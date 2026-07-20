"""Recover v4 enrichment proposals from succeeded v3 proposals without OpenAI.

This script is intentionally additive: it never updates listings or historical
v3 proposals. For each in-scope listing it selects the latest succeeded v3
proposal, re-evaluates its stored proposal body with enrichment_policy_v4, and
creates a new succeeded v4 proposal.

Selection policy: skip a listing when *any* succeeded v4 proposal already
exists. This is deliberately broader than matching input_checksum so a later
successful v4 run remains authoritative.

Usage:
  PYTHONPATH=src python scripts/recover_enrichment_v4_from_v3.py
  PYTHONPATH=src python scripts/recover_enrichment_v4_from_v3.py --apply
  PYTHONPATH=src python scripts/recover_enrichment_v4_from_v3.py --limit 25 \
    --output data/processed/enrichment_v4_recovery_report.json
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
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.neighbourhood import is_generic_neighbourhood  # noqa: E402
from merkado_labs.enrichment.policy import (  # noqa: E402
    POLICY_VERSION,
    evaluate_proposal_attributes,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
PRODUCTION_PROJECT_REF = "jkrfyvukhhsapoivntms"
SOURCE_KEYS = (
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)
V3_PROMPT_VERSION = "listing_enrichment_v3"
V3_SCHEMA_VERSION = "listing_enrichment_schema_v3"
V4_PROMPT_VERSION = "listing_enrichment_v4"
V4_SCHEMA_VERSION = "listing_enrichment_schema_v4"
BATCH_SIZE = 50


def _load_and_require_labs_env() -> None:
    """Load local dashboard settings and refuse every non-Labs project."""

    env_path = ROOT / "apps" / "labs-dashboard" / ".env.local"
    if not env_path.exists():
        raise RuntimeError(f"Required environment file is missing: {env_path}")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))

    project_ref = os.environ.get("SUPABASE_PROJECT_REF")
    if project_ref == PRODUCTION_PROJECT_REF:
        raise RuntimeError("Refusing production Supabase project reference.")
    if project_ref != LABS_PROJECT_REF:
        raise RuntimeError(
            "SUPABASE_PROJECT_REF must be "
            f"{LABS_PROJECT_REF!r}; received {project_ref!r}."
        )


def _attrs_from_proposal(
    body: dict[str, Any],
    supporting_evidence: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Normalize legacy v3 proposal shapes for the policy evaluator.

    Kept aligned with scripts/replay_enrichment_policy.py so policy recovery
    includes attributes represented only in prior field decisions.
    """

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
    audit = (supporting_evidence or {}).get("run_audit") or {}
    policy = audit.get("policy") or {}
    if isinstance(policy.get("decisions"), list):
        decision_bags.append(policy["decisions"])
    if isinstance(body.get("field_decisions"), list):
        decision_bags.append(body["field_decisions"])

    seen = {str(item.get("key") or "") for item in items if item.get("key")}
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


def _latest_succeeded_v3(proposals: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Return the newest succeeded v3 proposal for each listing."""

    latest: dict[str, dict[str, Any]] = {}
    for proposal in proposals:
        listing_id = str(proposal["property_listing_id"])
        existing = latest.get(listing_id)
        if existing is None or str(proposal.get("generated_at") or "") > str(
            existing.get("generated_at") or ""
        ):
            latest[listing_id] = proposal
    return latest


def _source_values(
    listing: dict[str, Any], neighbourhood_names: dict[str, str]
) -> tuple[dict[str, Any], str]:
    source_neighbourhood = listing.get("source_neighbourhood_text")
    map_name = neighbourhood_names.get(str(listing.get("inferred_neighbourhood_id")))
    amenities = listing.get("amenities")
    values = {
        "title": listing.get("title"),
        "source_description": listing.get("description"),
        "description": listing.get("description"),
        "source_neighbourhood_text": source_neighbourhood,
        "location_text": source_neighbourhood,
        "location_explicit": bool(source_neighbourhood)
        and not is_generic_neighbourhood(str(source_neighbourhood)),
        "map_neighbourhood_name": map_name,
        "inferred_neighbourhood_name": map_name,
        "property_type": listing.get("property_type"),
        "bedrooms": listing.get("bedrooms"),
        "bathrooms": listing.get("bathrooms"),
        "existing_structured_features": amenities,
    }
    corpus = "\n".join(
        str(value)
        for value in (
            listing.get("title"),
            listing.get("description"),
            source_neighbourhood,
            amenities,
        )
        if value
    )
    return values, corpus


def _decision_counts(decisions: list[dict[str, Any]]) -> dict[str, int]:
    statuses = Counter(str(decision.get("final_status") or "") for decision in decisions)
    return {
        "accepted": statuses["auto_applied"],
        "redundant": statuses["redundant"],
        "rejected": statuses["rejected"],
        "needs_attention": statuses["needs_attention"],
        "skipped": statuses["skipped"],
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview recovery candidates without inserts (the default).",
    )
    parser.add_argument(
        "--apply", action="store_true", help="Insert recovered v4 proposals."
    )
    parser.add_argument(
        "--output",
        default="data/processed/enrichment_v4_recovery_report.json",
        help="Path for the JSON report.",
    )
    parser.add_argument(
        "--limit", type=int, help="Maximum number of scoped listings to process."
    )
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("--apply and --dry-run cannot be used together")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    return args


def _in_chunks(values: list[str], size: int = BATCH_SIZE) -> list[list[str]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def main() -> int:
    args = _parse_args()
    _load_and_require_labs_env()
    if POLICY_VERSION != "enrichment_policy_v4":
        raise RuntimeError(f"Expected v4 policy code, found {POLICY_VERSION!r}.")

    client = create_labs_client()
    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_("source_key", list(SOURCE_KEYS))
        .execute()
        .data
        or []
    )
    source_ids = [str(row["id"]) for row in sources]
    source_by_id = {str(row["id"]): row["source_key"] for row in sources}
    if len(source_ids) != len(SOURCE_KEYS):
        found = set(source_by_id.values())
        raise RuntimeError(f"Missing configured sources: {sorted(set(SOURCE_KEYS) - found)}")

    listing_query = (
        client.table("property_listings")
        .select(
            "id,external_id,property_source_id,title,description,amenities,"
            "source_neighbourhood_text,inferred_neighbourhood_id,property_type,"
            "bedrooms,bathrooms"
        )
        .in_("property_source_id", source_ids)
        .order("id")
    )
    if args.limit:
        listing_query = listing_query.limit(args.limit)
    listings = listing_query.execute().data or []
    listing_ids = [str(row["id"]) for row in listings]
    listing_by_id = {str(row["id"]): row for row in listings}

    neighbourhood_names = {
        str(row["id"]): row["name"]
        for row in (
            client.table("neighbourhoods").select("id,name").execute().data or []
        )
    }
    v3_proposals: list[dict[str, Any]] = []
    v4_proposals: list[dict[str, Any]] = []
    for listing_chunk in _in_chunks(listing_ids):
        v3_proposals.extend(
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,model,prompt_version,schema_version,status,"
                "input_checksum,generated_at,proposal,confidence,supporting_evidence,"
                "warnings,token_usage"
            )
            .in_("property_listing_id", listing_chunk)
            .eq("status", "succeeded")
            .eq("prompt_version", V3_PROMPT_VERSION)
            .eq("schema_version", V3_SCHEMA_VERSION)
            .execute()
            .data
            or []
        )
        v4_proposals.extend(
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,model,status,input_checksum,generated_at"
            )
            .in_("property_listing_id", listing_chunk)
            .eq("prompt_version", V4_PROMPT_VERSION)
            .eq("schema_version", V4_SCHEMA_VERSION)
            .execute()
            .data
            or []
        )

    latest_v3 = _latest_succeeded_v3(v3_proposals)
    succeeded_v4_listings = {
        str(proposal["property_listing_id"])
        for proposal in v4_proposals
        if proposal.get("status") == "succeeded"
    }
    existing_v4_keys = {
        (
            str(proposal["property_listing_id"]),
            str(proposal.get("model")),
            str(proposal.get("input_checksum")),
        )
        for proposal in v4_proposals
    }

    now = datetime.now(UTC).isoformat()
    rows_to_insert: list[dict[str, Any]] = []
    per_listing: list[dict[str, Any]] = []
    skipped = Counter()
    before = Counter()
    after = Counter()

    for listing_id in listing_ids:
        proposal = latest_v3.get(listing_id)
        if proposal is None:
            skipped["no_succeeded_v3"] += 1
            continue
        if listing_id in succeeded_v4_listings:
            skipped["any_succeeded_v4_exists"] += 1
            continue
        if (
            listing_id,
            str(proposal.get("model")),
            str(proposal.get("input_checksum")),
        ) in existing_v4_keys:
            skipped["existing_v4_idempotency_key"] += 1
            continue

        listing = listing_by_id[listing_id]
        original_body = dict(proposal.get("proposal") or {})
        original_evidence = dict(proposal.get("supporting_evidence") or {})
        original_decisions = original_body.get("field_decisions") or []
        if isinstance(original_decisions, list):
            before.update(_decision_counts(original_decisions))

        attributes = _attrs_from_proposal(original_body, original_evidence)
        source_values, corpus = _source_values(listing, neighbourhood_names)
        evaluation = evaluate_proposal_attributes(
            attributes, source_values=source_values, source_text=corpus
        )
        decisions = [decision.as_dict() for decision in evaluation.decisions]
        after.update(_decision_counts(decisions))
        applied_attributes = [
            {
                "key": decision["key"],
                "effective_value": decision.get(
                    "resulting_effective", decision.get("proposed_value")
                ),
                "provenance": "ai_extracted",
                "confidence": decision.get("confidence"),
            }
            for decision in decisions
            if decision.get("final_status") == "auto_applied"
        ]

        proposal_body = {
            **original_body,
            "field_decisions": decisions,
            "applied_attributes": applied_attributes,
            "policy_version": POLICY_VERSION,
        }
        original_audit = dict(original_evidence.get("run_audit") or {})
        source_cost = original_audit.get(
            "estimated_cost_usd", original_evidence.get("estimated_cost_usd")
        )
        supporting_evidence = {
            **original_evidence,
            "token_usage": proposal.get("token_usage") or {},
            "run_audit": {
                "recovery_from_proposal_id": proposal["id"],
                "policy_version": POLICY_VERSION,
                "openai_calls": 0,
                "estimated_cost_usd": 0,
                "source_cost_usd": source_cost,
                "enrichment_job_id": None,
                "enrichment_job_note": (
                    "Null for deterministic v3-to-v4 recovery; no job was run."
                ),
                "source_run_audit": original_audit,
            },
        }
        rows_to_insert.append(
            {
                "property_listing_id": listing_id,
                "enrichment_job_id": None,
                "model": proposal["model"],
                "prompt_version": V4_PROMPT_VERSION,
                "schema_version": V4_SCHEMA_VERSION,
                "input_checksum": proposal["input_checksum"],
                "status": "succeeded",
                "proposal": proposal_body,
                "confidence": proposal.get("confidence"),
                "supporting_evidence": supporting_evidence,
                "warnings": proposal.get("warnings") or [],
                "token_usage": proposal.get("token_usage") or {},
                "api_request_id": None,
                "error_message": None,
                "generated_at": now,
            }
        )
        per_listing.append(
            {
                "listing_id": listing_id,
                "external_id": listing.get("external_id"),
                "source_key": source_by_id[str(listing["property_source_id"])],
                "source_v3_proposal_id": proposal["id"],
                "source_v3_generated_at": proposal.get("generated_at"),
                "input_checksum": proposal.get("input_checksum"),
                "field_decisions_before": _decision_counts(original_decisions),
                "field_decisions_after": _decision_counts(decisions),
            }
        )

    inserted = 0
    if args.apply:
        for batch in _in_chunks(rows_to_insert):
            client.table("ai_enrichment_proposals").insert(batch).execute()
            inserted += len(batch)

    report = {
        "generated_at": now,
        "project_ref": LABS_PROJECT_REF,
        "mode": "apply" if args.apply else "dry_run",
        "policy_version": POLICY_VERSION,
        "openai_calls": 0,
        "selection_policy": (
            "Skip any listing with a succeeded v4 proposal, regardless of checksum."
        ),
        "source_keys": list(SOURCE_KEYS),
        "listings_scoped": len(listing_ids),
        "listings_processed": len(rows_to_insert),
        "inserted": inserted,
        "would_insert": len(rows_to_insert),
        "skipped": dict(sorted(skipped.items())),
        "field_decisions_before": dict(before),
        "field_decisions_after": dict(after),
        "results": per_listing,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "mode": report["mode"],
                "listings_processed": report["listings_processed"],
                "inserted": report["inserted"],
                "would_insert": report["would_insert"],
                "skipped": report["skipped"],
                "field_decisions_before": report["field_decisions_before"],
                "field_decisions_after": report["field_decisions_after"],
                "output": str(output_path),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
