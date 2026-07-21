"""Zero-cost re-evaluation of stored AI enrichment proposals (no OpenAI).

Dry-run by default. Use --apply only after reviewing the report.

Guarantees:
- No OpenAI / model API calls
- Does not change enrichment input checksums / billable selection inputs
- Preserves historical proposal bodies (raw attributes) and archives prior
  policy decisions under supporting_evidence.run_audit.original_policy
- Confirms Labs project ref and that no property pipeline run is active
  before any write
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
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

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
READY_SOURCE_KEYS = (
    "monumentenzorg_curacao",
    "moret_real_estate",
    "keller_williams_curacao",
    "remax_curacao",
)

# Reuse attribute extraction from the existing replay script.
sys.path.insert(0, str(ROOT / "scripts"))
from replay_enrichment_policy import _attrs_from_proposal  # noqa: E402


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
    os.environ.setdefault("SUPABASE_PROJECT_REF", LABS_PROJECT_REF)


def _confirm_labs_project() -> list[str]:
    reasons: list[str] = []
    ref = (os.environ.get("SUPABASE_PROJECT_REF") or "").strip()
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "")
    if ref and ref != LABS_PROJECT_REF:
        reasons.append(f"SUPABASE_PROJECT_REF={ref} (expected {LABS_PROJECT_REF})")
    if "jkrfyvukhhsapoivntms" in url:
        reasons.append("production project URL detected — refuse")
    if LABS_PROJECT_REF not in url and ref != LABS_PROJECT_REF:
        # Soft check: URL may be custom; require explicit Labs ref env.
        if ref != LABS_PROJECT_REF:
            reasons.append("cannot confirm Labs project ref from env")
    return reasons


def _pipeline_active(client: Any) -> list[str]:
    reasons: list[str] = []
    rows = (
        client.table("property_pipeline_runs")
        .select("id,status,started_at")
        .in_("status", ["queued", "running", "in_progress", "dispatching"])
        .limit(5)
        .execute()
        .data
        or []
    )
    if rows:
        reasons.append(
            "active_pipeline_run:"
            + ",".join(f"{r['id']}:{r['status']}" for r in rows)
        )
    return reasons


def _status_of(decision: dict[str, Any]) -> str:
    return str(decision.get("final_status") or decision.get("status") or "")


def _prior_decisions(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Latest prior decision per canonical attribute key (last wins)."""

    from merkado_labs.enrichment.fields import normalize_attribute_key

    out: dict[str, dict[str, Any]] = {}
    for item in body.get("field_decisions") or []:
        if not isinstance(item, dict) or not item.get("key"):
            continue
        key = normalize_attribute_key(str(item["key"]))
        if key:
            out[key] = item
    return out


def _unique_decisions(decisions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Persist at most one decision per canonical key (first wins)."""

    from merkado_labs.enrichment.fields import normalize_attribute_key

    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for item in decisions:
        if not isinstance(item, dict):
            continue
        key = normalize_attribute_key(str(item.get("key") or ""))
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append({**item, "key": key})
    return unique


def _billable_public_counts(client: Any, source_ids: list[str]) -> dict[str, int]:
    """Approximate billable_public using public-eligible + missing checksum skip.

    Exact worker billable selection depends on checksums; this reports the
    public-eligible active count per Ready source (must remain unchanged by
    policy rematerialization) and a hard zero for 'policy_made_billable'.
    """

    counts: dict[str, int] = {}
    for sid in source_ids:
        rows = (
            client.table("property_listings")
            .select("id", count="exact")
            .eq("property_source_id", sid)
            .eq("public_eligible", True)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        counts[sid] = int(rows.count or 0)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-keys",
        default=",".join(READY_SOURCE_KEYS),
        help="Comma-separated Ready source_key values",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Persist rematerialized field decisions (default: dry-run)",
    )
    parser.add_argument(
        "--output",
        default="data/processed/zero_cost_policy_reeval_report.json",
    )
    parser.add_argument(
        "--listing-ids",
        default="",
        help="Optional comma-separated listing UUID filter",
    )
    args = parser.parse_args()
    _load_env()

    stop = _confirm_labs_project()
    now = datetime.now(UTC).isoformat()
    client = create_labs_client()
    pipeline_blocks = _pipeline_active(client)
    # Dry-run is always allowed; writes are blocked while a pipeline is active.
    if args.apply:
        stop.extend(pipeline_blocks)

    source_keys = [s.strip() for s in args.source_keys.split(",") if s.strip()]
    sources = (
        client.table("property_sources")
        .select("id,source_key,display_name")
        .in_("source_key", source_keys)
        .execute()
        .data
        or []
    )
    source_by_id = {s["id"]: s["source_key"] for s in sources}
    source_ids = list(source_by_id)

    listing_filter = {x.strip() for x in args.listing_ids.split(",") if x.strip()}

    # Load Ready listings.
    listings: list[dict[str, Any]] = []
    for i in range(0, len(source_ids), 50):
        chunk = source_ids[i : i + 50]
        q = (
            client.table("property_listings")
            .select(
                "id,property_source_id,external_id,title,description,"
                "source_neighbourhood_text,property_type,bedrooms,bathrooms,"
                "amenities,inferred_neighbourhood_id,public_eligible,status,"
                "enrichment_last_input_checksum,enrichment_status"
            )
            .in_("property_source_id", chunk)
        )
        rows = q.execute().data or []
        listings.extend(rows)
    if listing_filter:
        listings = [row for row in listings if row["id"] in listing_filter]
    listing_by_id = {row["id"]: row for row in listings}
    listing_ids = list(listing_by_id)

    nb_names = {
        r["id"]: r["name"]
        for r in (client.table("neighbourhoods").select("id,name").execute().data or [])
    }

    # Latest v4 proposal per listing (fallback: latest any).
    proposals: list[dict[str, Any]] = []
    for i in range(0, len(listing_ids), 80):
        chunk = listing_ids[i : i + 80]
        rows = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,schema_version,prompt_version,status,"
                "proposal,supporting_evidence,input_checksum,model,"
                "enrichment_job_id,generated_at"
            )
            .in_("property_listing_id", chunk)
            .in_("status", ["succeeded", "needs_review"])
            .order("generated_at", desc=True)
            .execute()
            .data
            or []
        )
        proposals.extend(rows)

    latest: dict[str, dict[str, Any]] = {}
    for prop in proposals:
        lid = prop["property_listing_id"]
        if lid not in listing_by_id:
            continue
        current = latest.get(lid)
        if current is None:
            latest[lid] = prop
            continue
        # Prefer v4 over v3 when both exist.
        cur_v4 = str(current.get("schema_version") or "").endswith("v4")
        new_v4 = str(prop.get("schema_version") or "").endswith("v4")
        if new_v4 and not cur_v4:
            latest[lid] = prop

    before_counts: Counter[str] = Counter()
    after_counts: Counter[str] = Counter()
    transitions: Counter[str] = Counter()
    by_field: dict[str, Counter[str]] = defaultdict(Counter)
    by_source: dict[str, Counter[str]] = defaultdict(Counter)
    changed_rows: list[dict[str, Any]] = []
    examples: list[dict[str, Any]] = []
    manual_review: list[dict[str, Any]] = []
    checksums_before = {
        lid: listing_by_id[lid].get("enrichment_last_input_checksum")
        for lid in listing_by_id
    }
    public_before = _billable_public_counts(client, source_ids)

    results_for_apply: list[dict[str, Any]] = []

    for lid, prop in latest.items():
        listing = listing_by_id[lid]
        body = dict(prop.get("proposal") or {})
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
            "existing_structured_features": listing.get("amenities"),
        }
        corpus = "\n".join(
            str(part)
            for part in (
                listing.get("title"),
                listing.get("description"),
                source_nb,
                listing.get("amenities"),
            )
            if part
        )
        evaluation = evaluate_proposal_attributes(
            attrs, source_values=source_values, source_text=corpus
        )
        new_decisions = _unique_decisions([d.as_dict() for d in evaluation.decisions])
        prior = _prior_decisions(body)
        source_key = source_by_id.get(listing["property_source_id"], "unknown")

        for d in new_decisions:
            key = str(d["key"])
            after = _status_of(d)
            after_counts[after] += 1
            by_field[key][after] += 1
            by_source[source_key][after] += 1
            old = prior.get(key)
            before = _status_of(old) if old else "missing"
            before_counts[before] += 1
            if before != after:
                transition = f"{before}->{after}"
                transitions[transition] += 1
                row = {
                    "listing_id": lid,
                    "proposal_id": prop["id"],
                    "source_key": source_key,
                    "field": key,
                    "before": before,
                    "after": after,
                    "proposed_value": d.get("proposed_value"),
                    "confidence": d.get("confidence"),
                    "evidence_snippet": (d.get("evidence_snippet") or "")[:160],
                    "reasons": d.get("reasons"),
                }
                changed_rows.append(row)
                if len(examples) < 40 and after == "auto_applied":
                    examples.append(row)
                if after == "needs_attention":
                    manual_review.append(row)

        applied = [
            {
                "key": d["key"],
                "effective_value": d.get("resulting_effective", d.get("proposed_value")),
                "provenance": (
                    "curated_location_knowledge"
                    if "curated_location_knowledge_gated_community"
                    in (d.get("reasons") or [])
                    else "ai_extracted"
                ),
                "confidence": d.get("confidence"),
            }
            for d in new_decisions
            if d.get("final_status") == "auto_applied"
        ]
        results_for_apply.append(
            {
                "proposal_id": prop["id"],
                "listing_id": lid,
                "decisions": new_decisions,
                "applied_attributes": applied,
                "needs_attention": sum(
                    1 for d in new_decisions if d.get("final_status") == "needs_attention"
                ),
                "auto_applied": sum(
                    1 for d in new_decisions if d.get("final_status") == "auto_applied"
                ),
                "rejected": sum(
                    1 for d in new_decisions if d.get("final_status") == "rejected"
                ),
                "model": prop.get("model"),
                "enrichment_job_id": prop.get("enrichment_job_id"),
                "input_checksum": prop.get("input_checksum"),
            }
        )

    unchanged = sum(1 for row in changed_rows if False)  # placeholder
    decision_pairs = sum(before_counts.values())
    changed_decision_count = len(changed_rows)
    unchanged = decision_pairs - changed_decision_count

    report: dict[str, Any] = {
        "generated_at": now,
        "project_ref": LABS_PROJECT_REF,
        "policy_version": POLICY_VERSION,
        "mode": "apply" if args.apply else "dry_run",
        "openai_calls": 0,
        "ai_cost_usd": 0,
        "proposals_inspected": len(latest),
        "listings_considered": len(listing_ids),
        "stop_reasons": stop,
        "before_status_counts": dict(before_counts),
        "after_status_counts": dict(after_counts),
        "transitions": dict(transitions),
        "unchanged_decisions": unchanged,
        "changed_decisions": changed_decision_count,
        "by_field_after": {k: dict(v) for k, v in sorted(by_field.items())},
        "by_source_after": {k: dict(v) for k, v in sorted(by_source.items())},
        "representative_auto_apply_examples": examples,
        "manual_review_candidates": manual_review[:100],
        "changed_rows": changed_rows,
        "public_eligible_active_before": {
            source_by_id[k]: v for k, v in public_before.items()
        },
        "billable_note": (
            "Policy rematerialization does not alter enrichment_input_checksum; "
            "billable_public selection remains checksum-driven and must stay 0 "
            "for unchanged Ready inventory."
        ),
        "persisted": False,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if stop:
        report["ok"] = False
        out_path.write_text(
            json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({"ok": False, "stop_reasons": stop, "output": str(out_path)}, indent=2))
        return 2

    if args.apply:
        # Re-check pipeline immediately before writes.
        stop = _pipeline_active(client)
        if stop:
            report["stop_reasons"] = stop
            report["ok"] = False
            out_path.write_text(
                json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
                encoding="utf-8",
            )
            print(json.dumps({"ok": False, "stop_reasons": stop, "apply_skipped": True}, indent=2))
            return 2

        for item in results_for_apply:
            prop = latest[item["listing_id"]]
            body = dict(prop.get("proposal") or {})
            body["field_decisions"] = item["decisions"]
            body["applied_attributes"] = item["applied_attributes"]
            body["policy_version"] = POLICY_VERSION
            body["policy_revalidated_at"] = now
            body["policy_replay_reason"] = "zero_cost_bilingual_evidence_policy_v4_2"

            evidence = dict(prop.get("supporting_evidence") or {})
            run_audit = dict(evidence.get("run_audit") or {})
            if "policy" in run_audit and "original_policy" not in run_audit:
                run_audit["original_policy"] = run_audit.get("policy")
            run_audit["policy_version"] = POLICY_VERSION
            run_audit["policy_revalidation"] = True
            run_audit["policy_revalidated_at"] = now
            run_audit["openai_calls"] = 0
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
                {"enrichment_status": new_status}
            ).eq("id", item["listing_id"]).execute()

            event = build_enrichment_completed_event(
                model=str(item.get("model") or "gpt-5.6-terra"),
                fields_proposed=len(item["decisions"]),
                fields_auto_applied=item["auto_applied"],
                fields_needs_attention=item["needs_attention"],
                fields_rejected=item["rejected"],
                input_checksum=item.get("input_checksum"),
                job_id=item.get("enrichment_job_id"),
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
                .limit(6)
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
                            f"Zero-cost policy revalidation ({POLICY_VERSION}). "
                            f"{item['auto_applied']} auto-applied, "
                            f"{item['needs_attention']} need attention."
                        ),
                    }
                ).execute()

        # Verify checksums unchanged.
        checksum_mismatch = []
        for i in range(0, len(listing_ids), 100):
            chunk = listing_ids[i : i + 100]
            rows = (
                client.table("property_listings")
                .select("id,enrichment_last_input_checksum")
                .in_("id", chunk)
                .execute()
                .data
                or []
            )
            for row in rows:
                if row.get("enrichment_last_input_checksum") != checksums_before.get(
                    row["id"]
                ):
                    checksum_mismatch.append(row["id"])
        public_after = _billable_public_counts(client, source_ids)
        report["checksums_unchanged"] = not checksum_mismatch
        report["checksum_mismatch_ids"] = checksum_mismatch[:20]
        report["public_eligible_active_after"] = {
            source_by_id[k]: v for k, v in public_after.items()
        }
        report["public_eligible_active_unchanged"] = public_before == public_after
        report["persisted"] = True

    report["ok"] = True
    out_path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    summary = {
        "ok": True,
        "mode": report["mode"],
        "proposals_inspected": report["proposals_inspected"],
        "before_status_counts": report["before_status_counts"],
        "after_status_counts": report["after_status_counts"],
        "transitions": report["transitions"],
        "changed_decisions": report["changed_decisions"],
        "openai_calls": 0,
        "output": str(out_path),
        "persisted": report["persisted"],
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
