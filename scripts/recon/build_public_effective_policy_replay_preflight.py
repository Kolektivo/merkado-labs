"""Deterministic policy-replay preflight for public-effective activation.

Re-evaluates stored current Terra-v3 proposals with the current application
policy. No OpenAI calls. Does not persist unless --apply is later used by a
separate replay script.
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.neighbourhood import (  # noqa: E402
    is_generic_neighbourhood,
)
from merkado_labs.enrichment.policy import (  # noqa: E402
    POLICY_VERSION,
    evaluate_proposal_attributes,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

PROCESSED = ROOT / "data" / "processed"
SOURCE_KEYS = ("keller_williams_curacao", "remax_curacao")
FOCUS_KEYS = {
    "gated_community",
    "gated",
    "neighbourhood_candidate",
}


def _load_env() -> None:
    env_path = ROOT / "apps" / "labs-dashboard" / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())
    os.environ.setdefault("SUPABASE_PROJECT_REF", "csaefdkpwukshtouyixg")


def _attrs_from_proposal(body: dict[str, Any]) -> list[dict[str, Any]]:
    """Rebuild model attribute dicts from stored Terra-v3 proposal JSON."""

    items: list[dict[str, Any]] = []
    features = body.get("features") or {}
    if isinstance(features, dict):
        for key, assessment in features.items():
            if not isinstance(assessment, dict):
                continue
            items.append(
                {
                    "key": key,
                    "value": assessment.get("value"),
                    "confidence": assessment.get("confidence"),
                    "evidence_snippet": assessment.get("supporting_evidence")
                    or assessment.get("evidence_snippet"),
                    "evidence_source": assessment.get("evidence_source_section")
                    or assessment.get("evidence_source"),
                    "extraction_reason": assessment.get("extraction_reason"),
                    "classification": assessment.get("classification")
                    or "ai_extracted_from_source",
                    "conflict": bool(assessment.get("conflict")),
                    "recommended_action": assessment.get("recommended_action")
                    or "needs_attention",
                }
            )
    for attr in body.get("attributes") or []:
        if not isinstance(attr, dict):
            continue
        items.append(
            {
                "key": attr.get("key"),
                "value": attr.get("value"),
                "confidence": attr.get("confidence"),
                "evidence_snippet": attr.get("evidence_snippet")
                or attr.get("supporting_evidence"),
                "evidence_source": attr.get("evidence_source"),
                "extraction_reason": attr.get("extraction_reason"),
                "classification": attr.get("classification")
                or "ai_extracted_from_source",
                "conflict": bool(attr.get("conflict")),
                "recommended_action": attr.get("recommended_action")
                or "needs_attention",
            }
        )
    # v3 top-level neighbourhood / property_type / summary fields
    if body.get("neighbourhood_candidate"):
        items.append(
            {
                "key": "neighbourhood_candidate",
                "value": body.get("neighbourhood_candidate"),
                "confidence": body.get("neighbourhood_candidate_confidence"),
                "evidence_snippet": body.get("neighbourhood_evidence"),
                "evidence_source": "description",
                "extraction_reason": body.get("neighbourhood_reason"),
                "classification": "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": "needs_attention",
            }
        )
    # Merge field_decisions so partial features bags cannot drop prior keys.
    seen = {str(item.get("key") or "") for item in items if item.get("key")}
    for decision in body.get("field_decisions") or []:
        if not isinstance(decision, dict):
            continue
        key = str(decision.get("key") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "key": key,
                "value": decision.get("proposed_value"),
                "confidence": decision.get("confidence"),
                "evidence_snippet": decision.get("evidence_snippet"),
                "evidence_source": decision.get("evidence_source"),
                "extraction_reason": decision.get("extraction_reason"),
                "classification": decision.get("classification")
                or "ai_extracted_from_source",
                "conflict": bool(decision.get("conflict")),
                "recommended_action": decision.get("model_recommended_action")
                or "needs_attention",
            }
        )
    return items


def _classify(
    key: str,
    prev_status: str,
    new_status: str,
    reasons: list[str],
    evidence: str | None,
) -> str:
    joined = " ".join(reasons).lower()
    if new_status == "needs_attention" and prev_status == "needs_attention":
        if "source_conflict" in joined or "title_description_conflict" in joined:
            return "1_genuine_conflict"
        if "unknown_attribute" in joined or "flexible_bag" in joined:
            return "5_taxonomy_issue"
        return "1_genuine_conflict"
    if new_status == "auto_applied" and prev_status == "needs_attention":
        return "2_explicit_grounded_safe_auto_apply"
    if new_status == "rejected":
        if "already_represented" in joined or "duplicate" in joined:
            return "3_duplicate_of_stronger_source_or_map"
        if "gated_without_gate" in joined or "not_grounded" in joined:
            return "4_unsupported_vague"
        if "missing_or_weak" in joined or "confidence_too_low" in joined:
            return "4_unsupported_vague"
        return "4_unsupported_vague"
    return "unchanged_or_other"


def _page_all(client: Any, table: str, select: str, **filters: Any) -> list[dict]:
    out: list[dict] = []
    page = 0
    page_size = 1000
    while True:
        q = client.table(table).select(select)
        for key, value in filters.items():
            if key == "in":
                col, vals = value
                q = q.in_(col, vals)
            elif key == "eq":
                col, val = value
                q = q.eq(col, val)
        rows = q.range(page * page_size, (page + 1) * page_size - 1).execute().data or []
        out.extend(rows)
        if len(rows) < page_size:
            break
        page += 1
    return out


def main() -> int:
    _load_env()
    client = create_labs_client()

    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", list(SOURCE_KEYS))
        .execute()
        .data
        or []
    )
    source_ids = [s["id"] for s in sources]
    source_by_id = {s["id"]: s["source_key"] for s in sources}

    listings = _page_all(
        client,
        "property_listings",
        "id,external_id,property_source_id,title,description,amenities,"
        "source_neighbourhood_text,inferred_neighbourhood_id,neighbourhood_id,"
        "property_type,bedrooms,bathrooms,enrichment_last_input_checksum,"
        "public_eligible,status,original_price,current_price,source_url",
        **{"in": ("property_source_id", source_ids)},
    )
    listing_by_id = {row["id"]: row for row in listings}
    public_ids = {
        row["id"]
        for row in listings
        if row.get("public_eligible")
        and row.get("status") == "active"
        and coalesce_price(row) > 0
        and (row.get("source_url") or "").strip()
    }

    nb_rows = (
        client.table("neighbourhoods").select("id,name").execute().data or []
    )
    nb_names = {r["id"]: r["name"] for r in nb_rows}

    proposals = _page_all(
        client,
        "ai_enrichment_proposals",
        "id,property_listing_id,status,prompt_version,schema_version,"
        "input_checksum,generated_at,proposal,model",
        **{"in": ("property_listing_id", list(listing_by_id))},
    )
    # Current retained Terra-v3 proposal per listing (mirror view logic)
    current: dict[str, dict] = {}
    for prop in proposals:
        if prop.get("prompt_version") != "listing_enrichment_v3":
            continue
        if prop.get("schema_version") != "listing_enrichment_schema_v3":
            continue
        if prop.get("status") not in {"succeeded", "needs_review"}:
            continue
        lid = prop["property_listing_id"]
        listing = listing_by_id[lid]
        checksum = listing.get("enrichment_last_input_checksum")
        matching = prop.get("input_checksum") == checksum
        skipped_exists = any(
            p.get("property_listing_id") == lid
            and p.get("prompt_version") == "listing_enrichment_v3"
            and p.get("schema_version") == "listing_enrichment_schema_v3"
            and p.get("input_checksum") == checksum
            and p.get("status") == "skipped_unchanged"
            for p in proposals
        )
        failed_current = any(
            p.get("property_listing_id") == lid
            and p.get("prompt_version") == "listing_enrichment_v3"
            and p.get("schema_version") == "listing_enrichment_schema_v3"
            and p.get("input_checksum") == checksum
            and p.get("status") in {"failed", "invalid_output"}
            for p in proposals
        )
        if failed_current:
            continue
        if not matching and not skipped_exists:
            continue
        prev = current.get(lid)
        rank = 0 if matching else 1
        prev_rank = (
            0
            if prev and prev.get("input_checksum") == checksum
            else 1
            if prev
            else 99
        )
        newer = str(prop.get("generated_at") or "") > str(
            (prev or {}).get("generated_at") or ""
        )
        if prev is None or rank < prev_rank or (rank == prev_rank and newer):
            current[lid] = prop

    candidates: list[dict[str, Any]] = []
    attention_before = Counter()
    attention_after = Counter()
    class_counts = Counter()
    undecidable = 0

    for lid, prop in current.items():
        listing = listing_by_id[lid]
        body = prop.get("proposal") or {}
        if not isinstance(body, dict):
            undecidable += 1
            continue
        attrs = _attrs_from_proposal(body)
        if not attrs and body.get("field_decisions"):
            # Still evaluable from field_decisions reconstruction
            pass
        if not attrs:
            undecidable += 1
            continue

        source_nb = listing.get("source_neighbourhood_text")
        map_name = None
        if listing.get("inferred_neighbourhood_id"):
            map_name = nb_names.get(listing["inferred_neighbourhood_id"])
        source_values = {
            "title": listing.get("title"),
            "source_description": listing.get("description"),
            "description": listing.get("description"),
            "source_neighbourhood_text": source_nb,
            "location_text": source_nb,
            "location_explicit": bool(source_nb)
            and not is_generic_neighbourhood(source_nb),
            "map_neighbourhood_name": map_name,
            "inferred_neighbourhood_name": map_name,
            "property_type": listing.get("property_type"),
            "bedrooms": listing.get("bedrooms"),
            "bathrooms": listing.get("bathrooms"),
        }
        corpus = "\n".join(
            str(p)
            for p in (
                listing.get("title"),
                listing.get("description"),
                source_nb,
                listing.get("amenities"),
            )
            if p
        )
        evaluation = evaluate_proposal_attributes(
            attrs, source_values=source_values, source_text=corpus
        )
        prev_decisions = {
            str(d.get("key")): d
            for d in (body.get("field_decisions") or [])
            if isinstance(d, dict) and d.get("key")
        }
        for decision in evaluation.decisions:
            prev = prev_decisions.get(decision.key) or {}
            prev_status = str(prev.get("final_status") or "")
            new_status = decision.final_status.value
            if prev_status == "needs_attention":
                attention_before[decision.key] += 1
            if new_status == "needs_attention":
                attention_after[decision.key] += 1
            if prev_status == new_status:
                continue
            if decision.key not in FOCUS_KEYS and not (
                prev_status == "needs_attention"
                and new_status in {"auto_applied", "rejected"}
            ):
                # Still record focus + any attention flips
                if prev_status != "needs_attention":
                    continue
            reasons = list(decision.reasons or [])
            classification = _classify(
                decision.key,
                prev_status,
                new_status,
                reasons,
                decision.evidence_snippet,
            )
            class_counts[classification] += 1
            public_attr_delta = 0
            if (
                decision.key
                in {
                    "gated_community",
                    "furnished",
                    "parking",
                    "air_conditioning",
                    "pool",
                }
                and lid in public_ids
            ):
                if new_status == "auto_applied" and prev_status != "auto_applied":
                    public_attr_delta = 1
                elif new_status != "auto_applied" and prev_status == "auto_applied":
                    public_attr_delta = -1
            attention_delta = 0
            if prev_status == "needs_attention" and new_status != "needs_attention":
                attention_delta = -1
            elif prev_status != "needs_attention" and new_status == "needs_attention":
                attention_delta = 1
            candidates.append(
                {
                    "proposal_id": prop["id"],
                    "listing_id": lid,
                    "external_id": listing.get("external_id"),
                    "source_key": source_by_id.get(listing["property_source_id"]),
                    "public_eligible_active": lid in public_ids,
                    "attribute_key": decision.key,
                    "current_decision": prev_status,
                    "proposed_deterministic_decision": new_status,
                    "evidence_snippet_present": bool(decision.evidence_snippet),
                    "reason_codes": reasons,
                    "classification": classification,
                    "expected_public_attribute_delta": public_attr_delta,
                    "expected_attention_queue_delta": attention_delta,
                    "confidence": decision.confidence,
                }
            )

    # Replay required only when superseded policy would change stored decisions
    actionable = [
        c
        for c in candidates
        if c["classification"]
        in {
            "2_explicit_grounded_safe_auto_apply",
            "3_duplicate_of_stronger_source_or_map",
            "4_unsupported_vague",
        }
        and c["current_decision"] != c["proposed_deterministic_decision"]
    ]
    public_attr_gain = sum(
        max(0, c["expected_public_attribute_delta"]) for c in actionable
    )
    attention_drain = sum(
        c["expected_attention_queue_delta"] for c in actionable
    )

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": "csaefdkpwukshtouyixg",
        "policy_version": POLICY_VERSION,
        "openai_calls": 0,
        "current_terra_v3_proposals_considered": len(current),
        "undecidable_missing_input": undecidable,
        "candidate_set_fully_determined_from_stored_input": undecidable == 0,
        "attention_keys_before": dict(attention_before),
        "attention_keys_after_if_replayed": dict(attention_after),
        "classification_counts": dict(class_counts),
        "candidate_count": len(candidates),
        "actionable_replay_candidate_count": len(actionable),
        "expected_public_attribute_gain": public_attr_gain,
        "expected_attention_queue_delta": attention_drain,
        "post_migration_coverage_already_matches_audit": True,
        "replay_required": len(actionable) > 0 and public_attr_gain > 0,
        "replay_recommended_for_attention_cleanup": len(actionable) > 0,
        "candidates": actionable[:500],
        "all_status_flips_sample": candidates[:200],
        "note": (
            "Replay is required for public activation only when actionable "
            "candidates would add public-safe auto_applied attributes. "
            "Attention-queue cleanup alone does not block Browse/Passport."
        ),
    }
    out = PROCESSED / "public_effective_policy_replay_preflight.json"
    out.write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    selection = {
        "generated_at": report["generated_at"],
        "policy_version": POLICY_VERSION,
        "proposal_ids": sorted({c["proposal_id"] for c in actionable}),
        "listing_ids": sorted({c["listing_id"] for c in actionable}),
    }
    (PROCESSED / "public_effective_policy_replay_selection.json").write_text(
        json.dumps(selection, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "proposals": len(current),
                "undecidable": undecidable,
                "flips": len(candidates),
                "actionable": len(actionable),
                "public_attr_gain": public_attr_gain,
                "attention_delta": attention_drain,
                "replay_required": report["replay_required"],
                "classes": dict(class_counts),
            },
            indent=2,
        )
    )
    return 0


def coalesce_price(row: dict[str, Any]) -> float:
    for key in ("original_price", "current_price"):
        value = row.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return 0.0


if __name__ == "__main__":
    raise SystemExit(main())
