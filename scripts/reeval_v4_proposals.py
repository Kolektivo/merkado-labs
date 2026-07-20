"""Re-evaluate existing v4 proposals with current policy (no OpenAI).

Optionally materializes deterministic display_overview fallbacks when missing.
Updates v4 proposal rows only — never touches v3 history.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.display_description import (  # noqa: E402
    build_fallback_display_description,
    clean_source_description,
    detect_dominant_language,
)
from merkado_labs.enrichment.policy import (  # noqa: E402
    POLICY_VERSION,
    evaluate_proposal_attributes,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS = "csaefdkpwukshtouyixg"


def _load_env() -> None:
    env = ROOT / "apps" / "labs-dashboard" / ".env.local"
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))
    os.environ["SUPABASE_PROJECT_REF"] = LABS


def _attrs_from_proposal(body: dict[str, Any]) -> list[dict[str, Any]]:
    """Rebuild attrs preferring original AI ``attributes`` evidence spans.

    Field decisions are a fallback for narrative top-level keys that may not
    appear in ``attributes``. Prior policy ``conflict`` flags are never reused.
    """

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for attr in body.get("attributes") or []:
        if not isinstance(attr, dict) or not attr.get("key"):
            continue
        key = str(attr.get("key"))
        if key in seen or attr.get("value") in (None, "", "unknown"):
            continue
        seen.add(key)
        items.append(
            {
                "key": key,
                "value": attr.get("value"),
                "confidence": attr.get("confidence"),
                "evidence_snippet": attr.get("evidence_snippet")
                or attr.get("supporting_evidence"),
                "evidence_source": attr.get("evidence_source"),
                "extraction_reason": attr.get("extraction_reason"),
                "classification": attr.get("classification")
                or "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": attr.get("recommended_action")
                or "auto_apply",
            }
        )
    for decision in body.get("field_decisions") or []:
        if not isinstance(decision, dict):
            continue
        key = str(decision.get("key") or "")
        if not key or key in seen:
            continue
        if decision.get("proposed_value") in (None, "", "unknown"):
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
                "conflict": False,
                "recommended_action": decision.get("model_recommended_action")
                or "auto_apply",
            }
        )
    # Top-level narrative keys from the model body.
    for key in (
        "concise_summary",
        "display_overview",
        "display_layout",
        "display_location",
        "display_highlights",
        "display_practical",
        "neighbourhood_candidate",
    ):
        if key in seen:
            continue
        value = body.get(key)
        if value in (None, "", [], {}):
            continue
        seen.add(key)
        items.append(
            {
                "key": key,
                "value": value,
                "confidence": body.get("overall_confidence") or 0.9,
                "evidence_snippet": (
                    body.get("cleaned_description")
                    or body.get("description")
                    or ""
                )[:160]
                or None,
                "evidence_source": "description",
                "extraction_reason": "other",
                "classification": "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": "auto_apply",
            }
        )
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listing-ids-file", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--fill-display-fallback", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("data/processed/v4_reeval.json"))
    args = parser.parse_args()
    _load_env()
    if os.environ.get("SUPABASE_PROJECT_REF") != LABS:
        raise SystemExit("Labs only")
    sel = json.loads(args.listing_ids_file.read_text(encoding="utf-8"))
    listing_ids = [str(x) for x in (sel.get("listing_ids") or [])]
    client = create_labs_client()
    props = (
        client.table("ai_enrichment_proposals")
        .select(
            "id,property_listing_id,proposal,supporting_evidence,status,generated_at"
        )
        .in_("property_listing_id", listing_ids)
        .eq("prompt_version", "listing_enrichment_v4")
        .in_("status", ["succeeded", "needs_review"])
        .execute()
        .data
        or []
    )
    latest: dict[str, dict] = {}
    # Prefer newest proposal per listing (view retains latest v4).
    props_sorted = sorted(
        props,
        key=lambda row: str(row.get("generated_at") or ""),
        reverse=True,
    )
    for p in props_sorted:
        lid = str(p["property_listing_id"])
        if lid not in latest:
            latest[lid] = p
    listings = {
        str(r["id"]): r
        for r in (
            client.table("property_listings")
            .select(
                "id,title,description,source_neighbourhood_text,property_type,"
                "bedrooms,bathrooms,amenities,inferred_neighbourhood_id"
            )
            .in_("id", list(latest))
            .execute()
            .data
            or []
        )
    }
    nb = {
        r["id"]: r["name"]
        for r in (client.table("neighbourhoods").select("id,name").execute().data or [])
    }
    before = Counter()
    after = Counter()
    updates = []
    for lid, prop in latest.items():
        body = dict(prop.get("proposal") or {})
        for d in body.get("field_decisions") or []:
            before[str(d.get("final_status"))] += 1
        row = listings.get(lid) or {}
        source_values = {
            "title": row.get("title"),
            "source_description": row.get("description"),
            "description": row.get("description"),
            "cleaned_listing_text": row.get("description"),
            "source_neighbourhood_text": row.get("source_neighbourhood_text"),
            "property_type": row.get("property_type"),
            "bedrooms": row.get("bedrooms"),
            "bathrooms": row.get("bathrooms"),
            "existing_structured_features": row.get("amenities"),
            "inferred_neighbourhood_name": nb.get(row.get("inferred_neighbourhood_id")),
        }
        attrs = _attrs_from_proposal(body)
        if args.fill_display_fallback:
            source_text = (row.get("description") or "").strip() or (
                f"{row.get('title') or ''} {row.get('source_neighbourhood_text') or ''}".strip()
            )
            prior_overview = next(
                (
                    d
                    for d in (body.get("field_decisions") or [])
                    if d.get("key") == "display_overview"
                ),
                None,
            )
            needs_fallback = bool(source_text) and (
                not any(a.get("key") == "display_overview" and a.get("value") for a in attrs)
                or (
                    prior_overview
                    and prior_overview.get("final_status")
                    in {"rejected", "needs_attention", "skipped"}
                )
            )
            if needs_fallback:
                lang = detect_dominant_language(source_text)
                fallback = build_fallback_display_description(source_text, lang)
                overview = fallback.get("display_overview") or clean_source_description(
                    source_text
                )
                if overview:
                    attrs = [a for a in attrs if a.get("key") != "display_overview"]
                    attrs.append(
                        {
                            "key": "display_overview",
                            "value": overview[:600],
                            "confidence": 0.95,
                            "evidence_snippet": source_text[:160],
                            "evidence_source": "description",
                            "extraction_reason": "other",
                            "classification": "ai_extracted_from_source",
                            "conflict": False,
                            "recommended_action": "auto_apply",
                        }
                    )
                    body["display_overview"] = overview[:600]
                    body["source_language"] = body.get("source_language") or lang
        evaluation = evaluate_proposal_attributes(
            attrs,
            source_values=source_values,
            source_text=row.get("description") or "",
        )
        for d in evaluation.decisions:
            after[d.final_status.value] += 1
        applied = [
            {
                "key": d.key,
                "effective_value": d.resulting_effective,
                "provenance": "ai_extracted",
                "confidence": d.confidence,
            }
            for d in evaluation.auto_applied
        ]
        body["field_decisions"] = [d.as_dict() for d in evaluation.decisions]
        body["applied_attributes"] = applied
        body["policy_version"] = POLICY_VERSION
        evidence = dict(prop.get("supporting_evidence") or {})
        audit = dict(evidence.get("run_audit") or {})
        audit.update(
            {
                "policy_version": POLICY_VERSION,
                "reevaluated_at": datetime.now(UTC).isoformat(),
                "openai_calls": 0,
                "auto_applied_count": len(evaluation.auto_applied),
                "needs_attention_count": len(evaluation.needs_attention),
                "rejected_count": len(evaluation.rejected),
                "redundant_count": len(getattr(evaluation, "redundant", []) or []),
            }
        )
        evidence["run_audit"] = audit
        status = "needs_review" if evaluation.needs_attention else "succeeded"
        updates.append(
            {
                "id": prop["id"],
                "proposal": body,
                "supporting_evidence": evidence,
                "status": status,
            }
        )
    report = {
        "mode": "apply" if args.apply else "dry_run",
        "listings": len(updates),
        "before": dict(before),
        "after": dict(after),
        "policy_version": POLICY_VERSION,
    }
    if args.apply:
        for i in range(0, len(updates), 25):
            chunk = updates[i : i + 25]
            for row in chunk:
                client.table("ai_enrichment_proposals").update(
                    {
                        "proposal": row["proposal"],
                        "supporting_evidence": row["supporting_evidence"],
                        "status": row["status"],
                    }
                ).eq("id", row["id"]).execute()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
