"""Post-batch KW activation audits (Labs SELECTs + local policy checks; no OpenAI)."""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.evidence import ground_evidence  # noqa: E402
from merkado_labs.enrichment.fields import (  # noqa: E402
    FORBIDDEN_AI_FIELDS,
)
from merkado_labs.enrichment.pricing import cost_from_token_usage  # noqa: E402
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

CANARY = frozenset({"001JVD", "ADL-0006", "ZK2423", "JC-003", "ID-002"})
FOCUS_ATTRS = [
    "pool",
    "gated_community",
    "parking",
    "garage",
    "air_conditioning",
    "garden",
    "terrace",
    "balcony",
    "furnished",
    "sea_view",
    "solar_panels",
    "generator",
    "security",
    "appliances",
    "accessibility",
    "pet_suitability",
]
PROTECTED = [
    "original_price",
    "original_currency",
    "source_listing_status",
    "listing_type",
    "external_id",
    "source_url",
    "latitude",
    "longitude",
    "source_neighbourhood_text",
    "bedrooms",
    "bathrooms",
    "floor_area_m2",
    "lot_area_value",
    "public_eligible",
]


def _latest_proposal(props: list[dict]) -> dict | None:
    if not props:
        return None
    return sorted(props, key=lambda p: str(p.get("generated_at") or ""))[-1]


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, "keller_williams_curacao")
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,status,public_eligible,"
            "source_neighbourhood_text,description,enrichment_status,"
            "enrichment_last_input_checksum,enrichment_last_run_at,"
            "bedrooms,bathrooms,original_price,original_currency,"
            "property_type,source_listing_status,source_url,latitude,longitude,"
            "amenities,floor_area_m2,lot_area_value,lot_area_unit,"
            "neighbourhood_assignment_status,neighbourhood_assignment_method,"
            "inferred_neighbourhood_id"
        )
        .eq("property_source_id", source["id"])
        .execute()
        .data
        or []
    )
    if len(rows) != 84:
        raise SystemExit(f"Expected 84 KW listings, got {len(rows)}")

    listing_ids = [r["id"] for r in rows]
    proposals = (
        client.table("ai_enrichment_proposals")
        .select(
            "id,property_listing_id,status,model,prompt_version,schema_version,"
            "input_checksum,proposal,supporting_evidence,token_usage,"
            "generated_at,error_message,warnings"
        )
        .in_("property_listing_id", listing_ids)
        .eq("model", "gpt-5.6-terra")
        .execute()
        .data
        or []
    )
    props_by_listing: dict[str, list[dict]] = defaultdict(list)
    for prop in proposals:
        props_by_listing[str(prop["property_listing_id"])].append(prop)

    events = (
        client.table("listing_activity_events")
        .select("id,property_listing_id,event_type,event_at,notes,new_value")
        .in_("property_listing_id", listing_ids)
        .like("event_type", "ai_enrichment%")
        .execute()
        .data
        or []
    )
    events_by_listing: dict[str, list[dict]] = defaultdict(list)
    for event in events:
        events_by_listing[str(event["property_listing_id"])].append(event)

    token_totals = Counter()
    auto_applied = 0
    needs_attention = 0
    rejected = 0
    attr_stats: dict[str, dict] = defaultdict(
        lambda: {
            "proposed": 0,
            "auto_applied": 0,
            "needs_attention": 0,
            "rejected": 0,
            "confidences": [],
            "evidence_ok": 0,
            "evidence_checked": 0,
            "phrases": Counter(),
            "sale": 0,
            "rent": 0,
            "false_positives": [],
        }
    )
    neighbourhood_audit = {
        "explicit_locations": 0,
        "generic_curacao": 0,
        "ai_candidates": 0,
        "auto_applied_neighbourhood": [],
        "needs_attention_neighbourhood": [],
        "missing_coords": [],
        "missing_usable_neighbourhood": [],
        "geospatial_assignments": Counter(),
    }
    policy_violations = []
    protected_checksums = []
    timeline_totals = Counter()
    timeline_issues = []
    status_counts = Counter(str(r.get("enrichment_status") or "not_run") for r in rows)

    for row in rows:
        lid = str(row["id"])
        eid = str(row["external_id"])
        listing_type = str(row.get("listing_type") or "")
        source_text = "\n".join(
            part for part in (row.get("title"), row.get("description")) if part
        )
        loc = (row.get("source_neighbourhood_text") or "").strip()
        if loc:
            neighbourhood_audit["explicit_locations"] += 1
            if loc.casefold() in {"curaçao", "curacao", "curaçao "}:
                neighbourhood_audit["generic_curacao"] += 1
        if row.get("latitude") is None or row.get("longitude") is None:
            neighbourhood_audit["missing_coords"].append(eid)
        geo = row.get("neighbourhood_assignment_status") or "none"
        neighbourhood_audit["geospatial_assignments"][str(geo)] += 1

        before = {key: row.get(key) for key in PROTECTED}
        protected_checksums.append(
            {"external_id": eid, "listing_id": lid, "protected_fields": before}
        )

        prop = _latest_proposal(props_by_listing.get(lid, []))
        if not prop:
            if not loc or loc.casefold() in {"curaçao", "curacao"}:
                neighbourhood_audit["missing_usable_neighbourhood"].append(eid)
            continue

        usage = prop.get("token_usage") or {}
        for key in (
            "input_tokens",
            "cached_input_tokens",
            "output_tokens",
            "reasoning_tokens",
            "total_tokens",
        ):
            if isinstance(usage.get(key), int):
                token_totals[key] += usage[key]

        proposal_body = prop.get("proposal") or {}
        decisions = proposal_body.get("field_decisions") or []
        if not decisions:
            audit = (prop.get("supporting_evidence") or {}).get("run_audit") or {}
            decisions = (audit.get("policy") or {}).get("decisions") or []

        for decision in decisions:
            key = str(decision.get("key") or "")
            if not key:
                continue
            status = str(decision.get("final_status") or "")
            conf = decision.get("confidence")
            snippet = decision.get("evidence_snippet")
            bucket = attr_stats[key]
            bucket["proposed"] += 1
            if listing_type == "sale":
                bucket["sale"] += 1
            elif listing_type == "rent":
                bucket["rent"] += 1
            if isinstance(conf, (int, float)):
                bucket["confidences"].append(float(conf))
            if status == "auto_applied":
                bucket["auto_applied"] += 1
                auto_applied += 1
            elif status == "needs_attention":
                bucket["needs_attention"] += 1
                needs_attention += 1
            elif status == "rejected":
                bucket["rejected"] += 1
                rejected += 1
            if snippet:
                bucket["phrases"][str(snippet)[:120]] += 1
                bucket["evidence_checked"] += 1
                grounding = ground_evidence(
                    key=key, evidence_snippet=snippet, source_text=source_text
                )
                if grounding.ok_for_auto_apply or grounding.ok_for_attention:
                    bucket["evidence_ok"] += 1
                elif status == "auto_applied":
                    bucket["false_positives"].append(
                        {
                            "external_id": eid,
                            "snippet": snippet,
                            "reason": grounding.reason,
                        }
                    )
                    policy_violations.append(
                        {
                            "external_id": eid,
                            "key": key,
                            "issue": "auto_applied_without_grounded_evidence",
                            "reason": grounding.reason,
                        }
                    )
            if key in FORBIDDEN_AI_FIELDS and status == "auto_applied":
                policy_violations.append(
                    {
                        "external_id": eid,
                        "key": key,
                        "issue": "forbidden_field_auto_applied",
                    }
                )
            if key == "neighbourhood_candidate":
                neighbourhood_audit["ai_candidates"] += 1
                entry = {
                    "external_id": eid,
                    "value": decision.get("proposed_value")
                    or decision.get("resulting_effective"),
                    "status": status,
                    "source_location": loc,
                    "confidence": conf,
                }
                if status == "auto_applied":
                    neighbourhood_audit["auto_applied_neighbourhood"].append(entry)
                elif status == "needs_attention":
                    neighbourhood_audit["needs_attention_neighbourhood"].append(entry)

        if not loc or loc.casefold() in {"curaçao", "curacao"}:
            has_ai_nb = any(
                d.get("key") == "neighbourhood_candidate"
                and d.get("final_status") == "auto_applied"
                for d in decisions
            )
            if not has_ai_nb:
                neighbourhood_audit["missing_usable_neighbourhood"].append(eid)

        listing_events = sorted(
            events_by_listing.get(lid, []),
            key=lambda e: str(e.get("event_at") or ""),
        )
        for event in listing_events:
            timeline_totals[str(event.get("event_type"))] += 1
        # Duplicate check by type+notes
        seen = set()
        for event in listing_events:
            sig = (
                event.get("event_type"),
                event.get("notes"),
                json.dumps(event.get("new_value") or {}, sort_keys=True)[:200],
            )
            if sig in seen:
                timeline_issues.append(
                    {"external_id": eid, "issue": "duplicate_event", "sig": sig[0]}
                )
            seen.add(sig)

    total_cost, _ = cost_from_token_usage("gpt-5.6-terra", dict(token_totals))
    enriched = sum(
        1
        for r in rows
        if r.get("enrichment_status")
        in {"succeeded", "needs_review", "skipped_unchanged"}
    )
    failed = sum(1 for r in rows if r.get("enrichment_status") == "failed")
    never = sum(
        1
        for r in rows
        if (r.get("enrichment_status") or "not_run") in {"not_run", None, ""}
    )

    attribute_report = []
    for key in FOCUS_ATTRS + sorted(
        k for k in attr_stats if k not in FOCUS_ATTRS and attr_stats[k]["proposed"] >= 3
    ):
        stats = attr_stats[key]
        confs = stats["confidences"]
        precision = (
            stats["evidence_ok"] / stats["evidence_checked"]
            if stats["evidence_checked"]
            else None
        )
        if stats["auto_applied"] >= 8 and (precision or 0) >= 0.9:
            recommendation = "display_now"
        elif stats["proposed"] >= 10 and (precision or 0) >= 0.85:
            recommendation = "future_filter_candidate"
        elif stats["false_positives"] or (precision is not None and precision < 0.7):
            recommendation = "reject_noisy"
        elif stats["needs_attention"] > stats["auto_applied"]:
            recommendation = "taxonomy_review"
        else:
            recommendation = "retain_secondary_metadata"
        attribute_report.append(
            {
                "key": key,
                "listings_proposed": stats["proposed"],
                "auto_applied": stats["auto_applied"],
                "needs_attention": stats["needs_attention"],
                "rejected": stats["rejected"],
                "average_confidence": round(sum(confs) / len(confs), 4) if confs else None,
                "evidence_precision": round(precision, 4) if precision is not None else None,
                "common_source_phrases": [
                    {"phrase": phrase, "count": count}
                    for phrase, count in stats["phrases"].most_common(5)
                ],
                "false_positives": stats["false_positives"][:10],
                "sale": stats["sale"],
                "rent": stats["rent"],
                "recommendation": recommendation,
            }
        )

    neighbourhood_payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "explicit_locations": neighbourhood_audit["explicit_locations"],
        "generic_curacao": neighbourhood_audit["generic_curacao"],
        "geospatial_assignments": dict(neighbourhood_audit["geospatial_assignments"]),
        "ai_candidates": neighbourhood_audit["ai_candidates"],
        "auto_applied_neighbourhood": neighbourhood_audit["auto_applied_neighbourhood"],
        "needs_attention_neighbourhood": neighbourhood_audit[
            "needs_attention_neighbourhood"
        ],
        "missing_coords": neighbourhood_audit["missing_coords"],
        "missing_usable_neighbourhood": sorted(
            set(neighbourhood_audit["missing_usable_neighbourhood"])
        ),
        "rules": {
            "source_location_is_truth": True,
            "geospatial_assignment_separate": True,
            "generic_curacao_not_confirmed_neighbourhood": True,
            "coordinates_never_ai_generated": True,
        },
    }
    (ROOT / "data/processed/kw_terra_neighbourhood_audit.json").write_text(
        json.dumps(neighbourhood_payload, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    nb_md = [
        "# KW Terra neighbourhood audit",
        "",
        f"- Explicit source locations: {neighbourhood_payload['explicit_locations']}",
        f"- Generic Curaçao labels: {neighbourhood_payload['generic_curacao']}",
        f"- AI neighbourhood candidates: {neighbourhood_payload['ai_candidates']}",
        (
            "- Auto-applied neighbourhood values: "
            f"{len(neighbourhood_payload['auto_applied_neighbourhood'])}"
        ),
        (
            "- Needs-attention neighbourhood values: "
            f"{len(neighbourhood_payload['needs_attention_neighbourhood'])}"
        ),
        f"- Missing coordinates: {', '.join(neighbourhood_payload['missing_coords']) or 'none'}",
        (
            "- Still missing usable neighbourhood context: "
            f"{len(neighbourhood_payload['missing_usable_neighbourhood'])}"
        ),
        "",
        "Source location remains source truth. Geospatial assignment is separate.",
        "Generic Curaçao is not treated as a confirmed neighbourhood.",
        "",
    ]
    (ROOT / "data/processed/kw_terra_neighbourhood_audit.md").write_text(
        "\n".join(nb_md) + "\n", encoding="utf-8"
    )

    candidates = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": "keller_williams_curacao",
        "listing_count": 84,
        "model": "gpt-5.6-terra",
        "attributes": attribute_report,
    }
    (ROOT / "data/processed/kw_attribute_candidates.json").write_text(
        json.dumps(candidates, indent=2, default=str) + "\n", encoding="utf-8"
    )
    md_lines = [
        "# KW attribute candidates (post Terra enrichment)",
        "",
        f"Listings: 84 | Model: gpt-5.6-terra | Generated: {candidates['generated_at']}",
        "",
        (
            "| Attribute | Proposed | Auto | Attention | Rejected | "
            "Avg conf | Evidence prec | Recommendation |"
        ),
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for item in attribute_report:
        md_lines.append(
            f"| {item['key']} | {item['listings_proposed']} | {item['auto_applied']} | "
            f"{item['needs_attention']} | {item['rejected']} | {item['average_confidence']} | "
            f"{item['evidence_precision']} | {item['recommendation']} |"
        )
    (ROOT / "data/processed/kw_attribute_candidates.md").write_text(
        "\n".join(md_lines) + "\n", encoding="utf-8"
    )

    retry_path = ROOT / "data/processed/kw_terra_retry_candidates.json"
    retry = (
        json.loads(retry_path.read_text(encoding="utf-8")) if retry_path.exists() else {}
    )

    final = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_key": "keller_williams_curacao",
        "catalog_count": 84,
        "public_eligible": sum(1 for r in rows if r.get("public_eligible")),
        "public_excluded": sum(1 for r in rows if not r.get("public_eligible")),
        "enrichment_status_counts": dict(status_counts),
        "enriched_count": enriched,
        "never_enriched": never,
        "failed": failed,
        "model": "gpt-5.6-terra",
        "token_totals": dict(token_totals),
        "total_terra_cost_usd": float(total_cost) if total_cost is not None else None,
        "average_cost_usd": (
            float(total_cost) / enriched if total_cost is not None and enriched else None
        ),
        "auto_applied_fields": auto_applied,
        "needs_attention_fields": needs_attention,
        "rejected_fields": rejected,
        "policy_violations": policy_violations,
        "timeline_totals": dict(timeline_totals),
        "timeline_issues": timeline_issues[:50],
        "neighbourhood": {
            "explicit_locations": neighbourhood_payload["explicit_locations"],
            "generic_curacao": neighbourhood_payload["generic_curacao"],
            "auto_applied": len(neighbourhood_payload["auto_applied_neighbourhood"]),
            "needs_attention": len(
                neighbourhood_payload["needs_attention_neighbourhood"]
            ),
            "missing_coords": neighbourhood_payload["missing_coords"],
        },
        "attribute_top": attribute_report[:20],
        "retry_candidates": {
            "count": retry.get("count"),
            "external_ids": retry.get("external_ids"),
            "reason": retry.get("reason"),
        },
        "scheduling_status": "manual_unscheduled",
        "protected_source_fields": PROTECTED,
        "protected_field_sample_count": len(protected_checksums),
        "known_limitations": [
            (
                "24 listings failed structured-output truncation at "
                "max_output_tokens=2500 and are deferred to retry"
            ),
            "Attributes remain flexible metadata; no browse filters added",
            "KW remains manual and unscheduled",
        ],
        "recommendation_remax": (
            "Prepare a RE/MAX Terra enrichment preflight mirroring KW: "
            "prove eligible listing count, exclude any prior canaries, "
            "selection-file batch with max_output_tokens>=3500, USD ceiling, "
            "evidence grounding, and idempotent resume — do not run until approved."
        ),
    }
    (ROOT / "data/processed/kw_activation_final_report.json").write_text(
        json.dumps(final, indent=2, default=str) + "\n", encoding="utf-8"
    )
    final_md = [
        "# Keller Williams activation final report",
        "",
        f"- Catalog: {final['catalog_count']} KW listings (Labs `{ref}`)",
        f"- Public eligible / excluded: {final['public_eligible']} / {final['public_excluded']}",
        f"- Enrichment statuses: {final['enrichment_status_counts']}",
        f"- Model: `{final['model']}`",
        f"- Total Terra cost (all KW proposals): USD {final['total_terra_cost_usd']}",
        f"- Average cost per enriched listing: USD {final['average_cost_usd']}",
        (
            "- Auto-applied / needs-attention / rejected fields: "
            f"{final['auto_applied_fields']} / "
            f"{final['needs_attention_fields']} / "
            f"{final['rejected_fields']}"
        ),
        f"- Timeline AI events: {final['timeline_totals']}",
        f"- Retry candidates (not executed): {final['retry_candidates']}",
        "- Scheduling: **manual / unscheduled**",
        "",
        "## Known limitations",
        "",
    ]
    final_md.extend(f"- {item}" for item in final["known_limitations"])
    final_md.extend(
        [
            "",
            "## RE/MAX preparation (not executed)",
            "",
            final["recommendation_remax"],
            "",
        ]
    )
    (ROOT / "data/processed/kw_activation_final_report.md").write_text(
        "\n".join(final_md) + "\n", encoding="utf-8"
    )

    print(
        json.dumps(
            {
                "kw": 84,
                "enriched": enriched,
                "failed": failed,
                "never": never,
                "cost": final["total_terra_cost_usd"],
                "auto": auto_applied,
                "attention": needs_attention,
                "rejected": rejected,
                "policy_violations": len(policy_violations),
                "wrote": [
                    "kw_attribute_candidates.json",
                    "kw_terra_neighbourhood_audit.json",
                    "kw_activation_final_report.json",
                ],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
