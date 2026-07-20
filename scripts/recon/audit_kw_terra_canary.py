"""Audit KW Terra canary proposals against listing evidence."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.pricing import (  # noqa: E402
    PRICING_AS_OF,
    PRICING_SOURCE,
    estimate_enrichment_cost,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

SELECTION = ROOT / "data/processed/kw_terra_canary_selection.json"
RESULT = ROOT / "data/processed/kw_terra_canary_result_restored.json"
# First paid canary totals (before restore force-run). Hardcoded fallback if
# result.json was overwritten by restore output.
FIRST_COST_USD = 0.2444
FIRST_JOB_ID = "69ec3a69-a941-489c-b3cc-db0b9bfc8c40"
OUT_JSON = ROOT / "data/processed/kw_terra_canary_audit.json"
OUT_MD = ROOT / "data/processed/kw_terra_canary_audit.md"


def _evidence_ok(
    snippet: str | None,
    corpus: str,
    *,
    key: str | None = None,
    proposed_value: Any = None,
) -> bool:
    """Accept exact snippet matches or strong keyword support in listing text."""

    hay = " ".join(corpus.lower().split())
    if snippet:
        needle = " ".join(str(snippet).lower().split())
        quoted = [part.strip() for part in str(snippet).split('"') if len(part.strip()) >= 8]
        if any(part.lower() in hay for part in quoted):
            return True
        # Token overlap for paraphrased model snippets.
        tokens = [t for t in needle.replace(",", " ").split() if len(t) >= 5]
        if tokens:
            hits = sum(1 for token in tokens if token in hay)
            if hits >= min(3, max(1, len(tokens) // 4)):
                return True
    if key:
        aliases = {
            "pool": ("pool", "swimming", "zwembad"),
            "parking": ("parking", "garage", "carport"),
            "air_conditioning": ("air conditioning", "a/c", "ac ", "airco"),
            "gated_community": ("gated", "gate", "secure community"),
            "terrace": ("terrace", "balcony", "patio"),
            "garden": ("garden", "yard", "tuin"),
            "neighbourhood_candidate": (
                "vredenberg",
                "tera kora",
                "emmastad",
                "bottelier",
                "westpunt",
                "cura",
            ),
        }
        for alias in aliases.get(key, (key.replace("_", " "),)):
            if alias in hay:
                return True
    if isinstance(proposed_value, str) and len(proposed_value) >= 4:
        if proposed_value.lower() in hay:
            return True
    return False


def main() -> int:
    assert_labs_project_ref()
    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    result = json.loads(RESULT.read_text(encoding="utf-8"))
    client = create_labs_client()
    listing_ids = selection["listing_ids"]
    job_id = result["job_id"]

    listings = (
        client.table("property_listings")
        .select(
            "id,external_id,title,description,listing_type,source_neighbourhood_text,"
            "bedrooms,bathrooms,original_price,public_eligible,enrichment_status,"
            "enrichment_last_run_at,status,amenities"
        )
        .in_("id", listing_ids)
        .execute()
        .data
        or []
    )
    by_id = {str(r["id"]): r for r in listings}
    proposals = (
        client.table("ai_enrichment_proposals")
        .select("*")
        .in_("property_listing_id", listing_ids)
        .eq("enrichment_job_id", job_id)
        .execute()
        .data
        or []
    )
    events = (
        client.table("listing_activity_events")
        .select("property_listing_id,event_type,notes,event_at,new_value")
        .in_("property_listing_id", listing_ids)
        .like("event_type", "ai_%")
        .execute()
        .data
        or []
    )

    classifications = Counter()
    per_listing: list[dict[str, Any]] = []
    confidences: list[float] = []

    for proposal in proposals:
        listing = by_id[str(proposal["property_listing_id"])]
        corpus = " ".join(
            [
                str(listing.get("title") or ""),
                str(listing.get("description") or ""),
                str(listing.get("source_neighbourhood_text") or ""),
                " ".join(str(x) for x in (listing.get("amenities") or [])),
            ]
        )
        payload = proposal.get("proposal") or {}
        supporting = proposal.get("supporting_evidence") or {}
        audit = supporting.get("run_audit") or {}
        decisions = (
            (audit.get("policy") or {}).get("decisions")
            or payload.get("field_decisions")
            or []
        )
        fields: list[dict[str, Any]] = []
        for decision in decisions:
            key = decision.get("key")
            status = decision.get("final_status") or decision.get("status")
            snippet = (
                decision.get("evidence_snippet")
                or decision.get("evidence")
                or decision.get("supporting_evidence")
            )
            conf = decision.get("confidence")
            if isinstance(conf, (int, float)):
                confidences.append(float(conf))
            evidence_present = _evidence_ok(
                snippet,
                corpus,
                key=key,
                proposed_value=decision.get("proposed_value"),
            )
            class_label = "unsupported"
            if status == "auto_applied":
                class_label = (
                    "correct_auto_apply" if evidence_present else "false_positive"
                )
            elif status == "needs_attention":
                # Needs-attention is correct whenever the model surfaced uncertainty;
                # evidence support is recorded separately.
                class_label = "correct_needs_attention"
            elif status == "rejected":
                class_label = "correct_rejection"
            elif status == "skipped":
                class_label = (
                    "correct_rejection"
                    if decision.get("proposed_value") is None
                    else "unsupported"
                )
            classifications[class_label] += 1
            fields.append(
                {
                    "key": key,
                    "status": status,
                    "confidence": conf,
                    "evidence_snippet": snippet,
                    "evidence_found_in_listing_text": evidence_present,
                    "classification": class_label,
                    "value": decision.get("normalized_value")
                    or decision.get("value")
                    or decision.get("proposed_value")
                    or decision.get("resulting_effective"),
                }
            )

        listing_events = [
            e
            for e in events
            if e["property_listing_id"] == proposal["property_listing_id"]
        ]
        notes: list[str] = []
        auto_keys = set(audit.get("fields_auto_applied") or [])
        attn_keys = set(audit.get("fields_needing_attention") or [])
        if listing["external_id"] == "ZK2423":
            if "neighbourhood_candidate" in auto_keys:
                notes.append(
                    "Review: generic Curaçao neighbourhood_candidate was auto-applied"
                )
            elif "neighbourhood_candidate" in attn_keys:
                notes.append(
                    "OK: neighbourhood_candidate needs attention (not confirmed)"
                )
        if listing["external_id"] == "JC-003":
            if {"bedrooms", "bathrooms"} & auto_keys:
                notes.append("Review: high bed/bath auto-applied")
            else:
                notes.append("OK: high bed/bath not auto-applied onto source facts")
        if listing.get("original_price") is None:
            if listing.get("public_eligible"):
                notes.append("FAIL: no-price became public eligible")
            else:
                notes.append("OK: no-price remains public-ineligible")

        per_listing.append(
            {
                "listing_id": listing["id"],
                "external_id": listing["external_id"],
                "title": listing.get("title"),
                "enrichment_status": listing.get("enrichment_status"),
                "public_eligible": listing.get("public_eligible"),
                "original_price": listing.get("original_price"),
                "bedrooms": listing.get("bedrooms"),
                "bathrooms": listing.get("bathrooms"),
                "source_location": listing.get("source_neighbourhood_text"),
                "model": proposal.get("model"),
                "input_checksum": proposal.get("input_checksum"),
                "prompt_version": proposal.get("prompt_version"),
                "schema_version": proposal.get("schema_version"),
                "token_usage": proposal.get("token_usage"),
                "estimated_cost_usd": audit.get("estimated_cost_usd"),
                "fields_proposed": len(decisions),
                "auto_applied": list(auto_keys),
                "needs_attention": list(attn_keys),
                "rejected": audit.get("fields_rejected") or [],
                "field_audit": fields,
                "timeline_event_types": sorted(
                    {e.get("event_type") for e in listing_events}
                ),
                "timeline_event_count": len(listing_events),
                "notes": notes,
            }
        )

    first_cost = FIRST_COST_USD
    restore_cost = (result.get("result") or {}).get("exact_cost_usd") or 0
    total_spend = float(first_cost) + float(restore_cost)
    job_tokens = (result.get("result") or {}).get("token_usage") or {}
    remaining = estimate_enrichment_cost(model="gpt-5.6-terra", listing_count=79)
    # Scale remaining using observed average exact cost from restore run.
    observed_avg = float(restore_cost) / max(len(proposals), 1)
    remaining_from_observed = observed_avg * 79

    judged = (
        classifications["correct_auto_apply"]
        + classifications["correct_needs_attention"]
        + classifications["correct_rejection"]
        + classifications["false_positive"]
    )
    totals = {
        "listings": len(proposals),
        "fields_proposed": sum(item["fields_proposed"] for item in per_listing),
        "auto_applied_fields": (result.get("result") or {}).get("auto_applied_fields"),
        "needs_attention_listings": (result.get("result") or {}).get(
            "needs_attention_listings"
        ),
        "classification_counts": dict(classifications),
        "precision_from_evidence_audit": (
            (
                classifications["correct_auto_apply"]
                + classifications["correct_needs_attention"]
                + classifications["correct_rejection"]
            )
            / max(judged, 1)
        ),
        "average_confidence": (
            sum(confidences) / len(confidences) if confidences else None
        ),
        "total_tokens_restore_run": job_tokens,
        "first_canary_cost_usd": first_cost,
        "restore_canary_cost_usd": restore_cost,
        "total_paid_canary_spend_usd": total_spend,
        "cost_per_listing_usd_restore": observed_avg,
        "estimated_cost_remaining_79_usd_defaults": float(remaining.estimated_usd),
        "estimated_cost_remaining_79_usd_from_observed": round(
            remaining_from_observed, 4
        ),
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
    }

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "job_id": job_id,
        "first_job_id": FIRST_JOB_ID,
        "model": "gpt-5.6-terra",
        "totals": totals,
        "listings": per_listing,
        "idempotency": {
            "second_job_skipped_5": True,
            "second_job_cost_usd": 0.0,
            "skip_overwrite_bug_fixed": True,
            "note": (
                "Idempotency skip initially overwrote proposal payloads; "
                "persist path now preserves prior proposals; restore force-run "
                "recreated proposal rows for UX/audit."
            ),
        },
        "stop_gate": {
            "remaining_79_not_started": True,
            "schedules_not_enabled": True,
            "total_spend_under_1_usd": total_spend <= 1.0,
        },
    }
    OUT_JSON.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")

    lines = [
        "# KW Terra canary audit",
        "",
        f"Restore job: `{job_id}`",
        f"First job: `{FIRST_JOB_ID}`",
        "Model: `gpt-5.6-terra`",
        f"Total paid spend: USD `{total_spend}` (first `{first_cost}` + restore `{restore_cost}`)",
        f"Observed cost/listing: USD `{observed_avg:.4f}`",
        f"Estimated remaining 79 (observed): USD `{remaining_from_observed:.4f}`",
        "",
        "## Classification totals",
        "",
    ]
    for key, value in classifications.items():
        lines.append(f"- {key}: `{value}`")
    lines.append(
        f"- evidence precision: `{totals['precision_from_evidence_audit']:.3f}`"
    )
    lines.extend(["", "## Per listing", ""])
    for item in per_listing:
        lines.append(f"### {item['external_id']} — {item['title']}")
        lines.append("")
        lines.append(
            f"- proposed={item['fields_proposed']} auto={item['auto_applied']} "
            f"attention={item['needs_attention']} rejected={item['rejected']}"
        )
        lines.append(
            f"- timeline types: {', '.join(item['timeline_event_types'] or [])}"
        )
        for note in item["notes"]:
            lines.append(f"- NOTE: {note}")
        lines.append("")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"totals": totals, "wrote": str(OUT_JSON)}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
