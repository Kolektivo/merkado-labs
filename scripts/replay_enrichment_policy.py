"""Deterministic policy replay for stored Terra-v3 proposals (no OpenAI).

Usage:
  python scripts/replay_enrichment_policy.py \\
    --source-keys keller_williams_curacao,remax_curacao \\
    --selection-file data/processed/public_effective_policy_replay_selection.json \\
    --policy-version enrichment_policy_v3 \\
    --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.neighbourhood import (  # noqa: E402
    is_generic_neighbourhood,
)
from merkado_labs.enrichment.policy import (  # noqa: E402
    POLICY_VERSION,
    evaluate_proposal_attributes,
)
from merkado_labs.enrichment.timeline import (  # noqa: E402
    AI_ENRICHMENT_COMPLETED,
    build_enrichment_completed_event,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402


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


def _attrs_from_proposal(
    body: dict[str, Any],
    supporting_evidence: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
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

    decision_bags: list[list[dict[str, Any]]] = []
    # Prefer original enrichment audit decisions when present — they survive
    # accidental partial rewrites of proposal.field_decisions.
    audit = (supporting_evidence or {}).get("run_audit") or {}
    policy = audit.get("policy") or {}
    if isinstance(policy.get("decisions"), list):
        decision_bags.append(policy["decisions"])
    if isinstance(body.get("field_decisions"), list):
        decision_bags.append(body["field_decisions"])

    seen = {
        str(item.get("key") or "")
        for item in items
        if item.get("key")
    }
    for bag in decision_bags:
        for decision in bag:
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


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-keys",
        default="keller_williams_curacao,remax_curacao",
        help="Comma-separated property_sources.source_key values",
    )
    parser.add_argument(
        "--selection-file",
        required=True,
        help="JSON with proposal_ids / listing_ids from preflight",
    )
    parser.add_argument(
        "--policy-version",
        default=POLICY_VERSION,
        help="Must match enrichment_policy_v3",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist proposal field decisions / applied attributes / timeline",
    )
    parser.add_argument(
        "--output",
        default="data/processed/public_effective_policy_replay_result.json",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    _load_env()
    if args.policy_version != POLICY_VERSION:
        raise SystemExit(
            f"policy-version mismatch: requested {args.policy_version}, code {POLICY_VERSION}"
        )

    selection = json.loads(Path(args.selection_file).read_text(encoding="utf-8"))
    proposal_ids = set(selection.get("proposal_ids") or [])
    if not proposal_ids:
        raise SystemExit("selection file contains no proposal_ids")

    client = create_labs_client()
    source_keys = [s.strip() for s in args.source_keys.split(",") if s.strip()]
    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", source_keys)
        .execute()
        .data
        or []
    )
    source_ids = {s["id"] for s in sources}
    source_by_id = {s["id"]: s["source_key"] for s in sources}

    nb_names = {
        r["id"]: r["name"]
        for r in (client.table("neighbourhoods").select("id,name").execute().data or [])
    }

    # Fetch selected proposals only
    proposals: list[dict[str, Any]] = []
    id_list = sorted(proposal_ids)
    for i in range(0, len(id_list), 100):
        chunk = id_list[i : i + 100]
        rows = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,status,prompt_version,schema_version,"
                "input_checksum,generated_at,proposal,model,supporting_evidence,"
                "enrichment_job_id,token_usage"
            )
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        proposals.extend(rows)

    listing_ids = sorted({p["property_listing_id"] for p in proposals})
    listings: dict[str, dict] = {}
    for i in range(0, len(listing_ids), 100):
        chunk = listing_ids[i : i + 100]
        rows = (
            client.table("property_listings")
            .select(
                "id,external_id,property_source_id,title,description,amenities,"
                "source_neighbourhood_text,inferred_neighbourhood_id,property_type,"
                "bedrooms,bathrooms,enrichment_status,original_price,original_currency,"
                "latitude,longitude,listing_type,source_listing_status,status"
            )
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        for row in rows:
            listings[row["id"]] = row

    now = datetime.now(UTC).isoformat()
    results: list[dict[str, Any]] = []
    stop_reasons: list[str] = []
    protected_before: list[dict[str, Any]] = []

    for prop in proposals:
        lid = prop["property_listing_id"]
        listing = listings.get(lid)
        if listing is None:
            stop_reasons.append(f"{prop['id']}:listing_missing")
            continue
        if listing["property_source_id"] not in source_ids:
            stop_reasons.append(f"{prop['id']}:source_not_in_scope")
            continue
        if prop.get("prompt_version") != "listing_enrichment_v3":
            stop_reasons.append(f"{prop['id']}:not_terra_v3_prompt")
            continue
        if prop.get("schema_version") != "listing_enrichment_schema_v3":
            stop_reasons.append(f"{prop['id']}:not_terra_v3_schema")
            continue
        if prop.get("status") not in {"succeeded", "needs_review"}:
            stop_reasons.append(f"{prop['id']}:status_{prop.get('status')}")
            continue

        protected_before.append(
            {
                "id": lid,
                "original_price": listing.get("original_price"),
                "original_currency": listing.get("original_currency"),
                "latitude": listing.get("latitude"),
                "longitude": listing.get("longitude"),
                "bedrooms": listing.get("bedrooms"),
                "bathrooms": listing.get("bathrooms"),
                "listing_type": listing.get("listing_type"),
                "source_listing_status": listing.get("source_listing_status"),
            }
        )

        body = dict(prop.get("proposal") or {})
        # Preserve raw model payload keys; only replace decision projections.
        raw_keys = {
            k: body.get(k)
            for k in body
            if k
            not in {
                "field_decisions",
                "applied_attributes",
                "policy_version",
                "policy_revalidated_at",
                "policy_replay_reason",
            }
        }
        evidence = dict(prop.get("supporting_evidence") or {})
        attrs = _attrs_from_proposal(body, evidence)
        source_nb = listing.get("source_neighbourhood_text")
        map_name = nb_names.get(listing.get("inferred_neighbourhood_id"))
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
        decisions = [d.as_dict() for d in evaluation.decisions]
        applied = []
        for d in decisions:
            if d.get("final_status") != "auto_applied":
                continue
            applied.append(
                {
                    "key": d["key"],
                    "effective_value": d.get("resulting_effective", d.get("proposed_value")),
                    "provenance": "ai_extracted",
                    "confidence": d.get("confidence"),
                }
            )

        auto_n = sum(1 for d in decisions if d["final_status"] == "auto_applied")
        attn_n = sum(1 for d in decisions if d["final_status"] == "needs_attention")
        rej_n = sum(1 for d in decisions if d["final_status"] == "rejected")

        results.append(
            {
                "proposal_id": prop["id"],
                "listing_id": lid,
                "external_id": listing.get("external_id"),
                "source_key": source_by_id.get(listing["property_source_id"]),
                "auto_applied": auto_n,
                "needs_attention": attn_n,
                "rejected": rej_n,
                "decisions": decisions,
                "applied_attributes": applied,
                "raw_model_keys_preserved": sorted(raw_keys.keys()),
            }
        )

    report: dict[str, Any] = {
        "generated_at": now,
        "project_ref": "csaefdkpwukshtouyixg",
        "policy_version": POLICY_VERSION,
        "openai_calls": 0,
        "selection_file": args.selection_file,
        "proposal_ids_requested": len(proposal_ids),
        "proposals_loaded": len(proposals),
        "replayed": len(results),
        "stop_reasons": stop_reasons,
        "persist_requested": bool(args.apply),
        "persisted": False,
        "results": [
            {
                **{
                    k: v
                    for k, v in item.items()
                    if k not in {"decisions", "applied_attributes"}
                },
                "decision_count": len(item["decisions"]),
                "applied_count": len(item["applied_attributes"]),
            }
            for item in results
        ],
    }

    if stop_reasons:
        Path(args.output).write_text(
            json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({"ok": False, "stop_reasons": stop_reasons[:20]}, indent=2))
        return 2

    if args.apply:
        for item in results:
            prop = next(p for p in proposals if p["id"] == item["proposal_id"])
            body = dict(prop.get("proposal") or {})
            # Keep raw model fields; replace only policy projections.
            body["field_decisions"] = item["decisions"]
            body["applied_attributes"] = item["applied_attributes"]
            body["policy_version"] = POLICY_VERSION
            body["policy_revalidated_at"] = now
            body["policy_replay_reason"] = (
                "deterministic_public_effective_activation_replay"
            )

            evidence = dict(prop.get("supporting_evidence") or {})
            run_audit = dict(evidence.get("run_audit") or {})
            # Keep original policy.decisions for recovery; store replay separately.
            if "policy" in run_audit and "original_policy" not in run_audit:
                run_audit["original_policy"] = run_audit.get("policy")
            run_audit["policy_version"] = POLICY_VERSION
            run_audit["policy_revalidation"] = True
            run_audit["policy_revalidated_at"] = now
            run_audit["policy_replay_reason"] = body["policy_replay_reason"]
            run_audit["replayed_policy"] = {
                "decisions": item["decisions"],
                "fields_auto_applied": [
                    d["key"]
                    for d in item["decisions"]
                    if d.get("final_status") == "auto_applied"
                ],
            }
            evidence["run_audit"] = run_audit

            new_status = (
                "needs_review" if item["needs_attention"] > 0 else "succeeded"
            )
            client.table("ai_enrichment_proposals").update(
                {
                    "proposal": body,
                    "supporting_evidence": evidence,
                    "status": new_status,
                }
            ).eq("id", item["proposal_id"]).execute()

            client.table("property_listings").update(
                {
                    "enrichment_status": new_status,
                }
            ).eq("id", item["listing_id"]).execute()

            event = build_enrichment_completed_event(
                model=str(prop.get("model") or "gpt-5.6-terra"),
                fields_proposed=len(item["decisions"]),
                fields_auto_applied=item["auto_applied"],
                fields_needs_attention=item["needs_attention"],
                fields_rejected=item["rejected"],
                input_checksum=prop.get("input_checksum"),
                job_id=prop.get("enrichment_job_id"),
            )
            details = {
                **event.details,
                "policy_revalidation": True,
                "policy_version": POLICY_VERSION,
                "openai_calls": 0,
                "cost_usd": 0,
                "event_subtype": "policy_revalidation",
                "policy_replay_reason": body["policy_replay_reason"],
            }
            existing = (
                client.table("listing_activity_events")
                .select("id,new_value")
                .eq("property_listing_id", item["listing_id"])
                .eq("event_type", AI_ENRICHMENT_COMPLETED)
                .order("event_at", desc=True)
                .limit(8)
                .execute()
                .data
                or []
            )
            already = any(
                isinstance(e.get("new_value"), dict)
                and e["new_value"].get("policy_revalidation")
                and e["new_value"].get("policy_version") == POLICY_VERSION
                and e["new_value"].get("policy_replay_reason")
                == body["policy_replay_reason"]
                for e in existing
            )
            if not already:
                client.table("listing_activity_events").insert(
                    {
                        "property_listing_id": item["listing_id"],
                        "event_type": AI_ENRICHMENT_COMPLETED,
                        "event_at": event.event_at.isoformat(),
                        "previous_value": None,
                        "new_value": details,
                        "derivation_type": "system_calculated",
                        "confidence": 1.0,
                        "notes": (
                            f"Policy revalidation ({POLICY_VERSION}) without a new AI call. "
                            f"{item['auto_applied']} auto-applied, "
                            f"{item['needs_attention']} need attention."
                        ),
                    }
                ).execute()

        # Verify protected fields unchanged
        protected_after: list[dict[str, Any]] = []
        for i in range(0, len(listing_ids), 100):
            chunk = listing_ids[i : i + 100]
            rows = (
                client.table("property_listings")
                .select(
                    "id,original_price,original_currency,latitude,longitude,"
                    "bedrooms,bathrooms,listing_type,source_listing_status"
                )
                .in_("id", chunk)
                .execute()
                .data
                or []
            )
            for row in rows:
                protected_after.append(
                    {
                        "id": row["id"],
                        "original_price": row.get("original_price"),
                        "original_currency": row.get("original_currency"),
                        "latitude": row.get("latitude"),
                        "longitude": row.get("longitude"),
                        "bedrooms": row.get("bedrooms"),
                        "bathrooms": row.get("bathrooms"),
                        "listing_type": row.get("listing_type"),
                        "source_listing_status": row.get("source_listing_status"),
                    }
                )
        before_map = {r["id"]: r for r in protected_before}
        after_map = {r["id"]: r for r in protected_after}
        for lid, before in before_map.items():
            if after_map.get(lid) != before:
                stop_reasons.append(f"{lid}:protected_fields_changed")
        report["protected_fields_unchanged"] = not any(
            s.endswith(":protected_fields_changed") for s in stop_reasons
        )
        report["persisted"] = True

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "ok": True,
                "replayed": len(results),
                "persisted": report["persisted"],
                "openai_calls": 0,
                "output": args.output,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
