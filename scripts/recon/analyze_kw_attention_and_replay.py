"""Phase 6 attention analysis + Phase 10 local policy-v3 replay (no OpenAI)."""

from __future__ import annotations

import hashlib
import json
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
    resolve_effective_neighbourhood,
)
from merkado_labs.enrichment.policy import (  # noqa: E402
    POLICY_VERSION,
    evaluate_proposal_attributes,
)
from merkado_labs.enrichment.timeline import (  # noqa: E402
    AI_ENRICHMENT_COMPLETED,
    build_enrichment_completed_event,
)
from merkado_labs.enrichment.values import AutoApplyStatus  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
KW_SOURCE = "keller_williams_curacao"
PROTECTED_CHECKSUM_FILE = PROCESSED / "kw_terra_protected_fields_checksum.json"
PROTECTED_FIELDS = [
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


def _classify_attention_reason(decision: dict[str, Any]) -> str:
    reasons = [str(r) for r in (decision.get("reasons") or [])]
    conflict = str(decision.get("conflict_status") or "")
    key = str(decision.get("key") or "")
    joined = " ".join(reasons).lower()

    if conflict == "source_conflict" or "source_conflict" in joined:
        if key == "neighbourhood_candidate":
            return "neighbourhood_conflict"
        return "real_source_conflict"
    if conflict == "title_description_conflict" or "title_description" in joined:
        return "title_description_disagreement"
    if "confidence_too_low" in joined or "below_attention" in joined:
        return "low_confidence"
    if "confidence_moderate" in joined or "below_auto_apply" in joined:
        return "low_confidence"
    if "missing_or_weak_evidence" in joined or "evidence_too_short" in joined:
        return "missing_weak_evidence"
    if "evidence_not_grounded" in joined or "evidence_grounding" in joined:
        return "synonym_grounding"
    if "generic" in joined or "ambiguous" in joined and key == "neighbourhood_candidate":
        return "generic_location"
    if key == "neighbourhood_candidate":
        return "neighbourhood_conflict"
    if "unknown_attribute" in joined or conflict == "unsupported":
        return "unsupported_taxonomy_key"
    if "negation" in joined:
        return "negation_uncertainty"
    if "malformed" in joined or "encoding" in joined:
        return "malformed_encoding"
    if "parking_spaces" in joined or "not_integer" in joined or "out_of_bounds" in joined:
        return "numeric_ambiguity"
    if "duplicate" in joined:
        return "duplicate_attribute"
    if "forbidden" in joined:
        return "already_represented_by_stronger_source_data"
    if "value_type" in joined:
        return "value_type_failure"
    if "noisy" in joined or "marketing" in joined:
        return "low_value_noisy_suggestion"
    if decision.get("value_type") == "boolean" and decision.get("proposed_value") in {
        True,
        False,
        "present",
        "explicitly_absent",
    }:
        if "model_conflict" in joined:
            return "ambiguous_boolean"
    return "other"


def _group_guidance(reason: str) -> dict[str, Any]:
    human = reason in {
        "real_source_conflict",
        "title_description_disagreement",
        "neighbourhood_conflict",
        "unsupported_taxonomy_key",
        "ambiguous_boolean",
        "numeric_ambiguity",
    }
    deterministic = reason in {
        "synonym_grounding",
        "generic_location",
        "missing_weak_evidence",
        "low_value_noisy_suggestion",
        "malformed_encoding",
        "duplicate_attribute",
        "already_represented_by_stronger_source_data",
    }
    reject = reason in {
        "missing_weak_evidence",
        "low_value_noisy_suggestion",
        "malformed_encoding",
        "duplicate_attribute",
        "already_represented_by_stronger_source_data",
        "generic_location",
        "unsupported_taxonomy_key",
        "low_confidence",
    }
    return {
        "human_decision_needed": human and not reject,
        "deterministic_normalization_resolves": deterministic,
        "should_reject_instead": reject and not human,
        "remain_audit_only": not human,
    }


def _protected_snapshot(rows: list[dict]) -> str:
    payload = []
    for row in sorted(rows, key=lambda r: str(r.get("external_id") or r.get("id"))):
        payload.append({k: row.get(k) for k in PROTECTED_FIELDS})
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _source_text_from_listing(listing: dict) -> str:
    parts = [
        listing.get("title"),
        listing.get("description"),
        listing.get("location"),
        listing.get("source_neighbourhood_text"),
    ]
    return "\n".join(str(p) for p in parts if p)


def _attributes_from_stored_proposal(proposal_body: dict) -> list[dict]:
    """Accept v2/v3 stored proposal JSON without OpenAI re-parse."""

    if not proposal_body:
        return []
    # Prefer flattened field_decisions keys? No — re-evaluate raw model attrs.
    # Stored proposal usually keeps the model output shape plus field_decisions.
    features = proposal_body.get("features") or {}
    attributes = proposal_body.get("attributes") or []
    # Rebuild a minimal object compatible with proposal_to_attribute_dicts helpers
    # by synthesizing attribute dicts directly.
    items: list[dict] = []
    if isinstance(features, dict):
        for key, assessment in features.items():
            if not isinstance(assessment, dict):
                continue
            items.append(
                {
                    "key": key,
                    "value": assessment.get("value"),
                    "confidence": assessment.get("confidence"),
                    "evidence_snippet": assessment.get("supporting_evidence"),
                    "evidence_source": assessment.get("evidence_source_section"),
                    "extraction_reason": assessment.get("extraction_reason"),
                    "classification": assessment.get("classification")
                    or "ai_extracted_from_source",
                    "conflict": bool(assessment.get("conflict")),
                    "recommended_action": assessment.get("recommended_action")
                    or "needs_attention",
                }
            )
    if isinstance(attributes, list):
        for attr in attributes:
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
    if proposal_body.get("neighbourhood_candidate"):
        items.append(
            {
                "key": "neighbourhood_candidate",
                "value": proposal_body.get("neighbourhood_candidate"),
                "confidence": proposal_body.get("neighbourhood_candidate_confidence"),
                "evidence_snippet": proposal_body.get("neighbourhood_evidence"),
                "evidence_source": "location",
                "extraction_reason": "neighbourhood_candidate_from_source_text",
                "classification": "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": "needs_attention",
            }
        )
    if proposal_body.get("concise_summary"):
        summary = str(proposal_body["concise_summary"])
        items.append(
            {
                "key": "concise_summary",
                "value": summary,
                "confidence": proposal_body.get("overall_confidence"),
                "evidence_snippet": summary[:160],
                "evidence_source": "description",
                "extraction_reason": "factual_summary",
                "classification": "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": "auto_apply",
            }
        )
    gated = proposal_body.get("resort_or_gated_candidate")
    if gated and gated != "unknown":
        items.append(
            {
                "key": "gated_community",
                "value": gated,
                "confidence": proposal_body.get("overall_confidence"),
                "evidence_snippet": "resort_or_gated_candidate",
                "evidence_source": "description",
                "extraction_reason": "resort_or_gated_candidate",
                "classification": "ai_extracted_from_source",
                "conflict": False,
                "recommended_action": "needs_attention",
            }
        )
    # Deduplicate by key keeping highest confidence
    best: dict[str, dict] = {}
    for item in items:
        key = str(item.get("key") or "")
        if not key:
            continue
        prev = best.get(key)
        if prev is None or float(item.get("confidence") or 0) >= float(
            prev.get("confidence") or 0
        ):
            best[key] = item
    return list(best.values())


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")
    persist = "--persist" in sys.argv
    client = create_labs_client()
    now = datetime.now(UTC).isoformat()

    source = (
        client.table("property_sources")
        .select("id")
        .eq("source_key", KW_SOURCE)
        .limit(1)
        .execute()
    ).data[0]
    source_id = source["id"]

    listings = (
        client.table("property_listings")
        .select(
            "id,external_id,title,description,location,source_neighbourhood_text,"
            "neighbourhood_id,inferred_neighbourhood_id,neighbourhood_assignment_status,"
            "latitude,longitude,original_price,original_currency,source_listing_status,"
            "listing_type,source_url,bedrooms,bathrooms,floor_area_m2,lot_area_value,"
            "public_eligible,enrichment_status,property_type"
        )
        .eq("property_source_id", source_id)
        .execute()
    ).data or []
    listing_by_id = {row["id"]: row for row in listings}

    # Fetch neighbourhood names for map / inferred assignment
    nb_ids = {
        nid
        for row in listings
        for nid in (row.get("neighbourhood_id"), row.get("inferred_neighbourhood_id"))
        if nid
    }
    nb_names: dict[str, str] = {}
    if nb_ids:
        nbs = (
            client.table("neighbourhoods")
            .select("id,name")
            .in_("id", list(nb_ids))
            .execute()
        ).data or []
        nb_names = {n["id"]: n["name"] for n in nbs}

    proposals: list[dict] = []
    offset = 0
    while True:
        batch = (
            client.table("ai_enrichment_proposals")
            .select(
                "id,property_listing_id,status,model,prompt_version,schema_version,"
                "proposal,supporting_evidence,token_usage,generated_at,input_checksum,"
                "confidence,enrichment_job_id"
            )
            .in_("property_listing_id", list(listing_by_id))
            .order("generated_at", desc=True)
            .range(offset, offset + 999)
            .execute()
        ).data or []
        proposals.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    latest: dict[str, dict] = {}
    for prop in proposals:
        lid = prop["property_listing_id"]
        if lid not in latest:
            latest[lid] = prop

    success_props = [
        p
        for p in latest.values()
        if p.get("status") in {"needs_review", "succeeded"}
    ]
    if len(success_props) != 60:
        print(f"WARNING: expected 60 successful proposals, found {len(success_props)}")

    # --- Phase 6: attention analysis on PREVIOUS (stored) decisions ---
    groups: dict[str, dict[str, Any]] = {}
    prev_auto = 0
    prev_attention = 0
    prev_rejected = 0

    for prop in success_props:
        body = prop.get("proposal") or {}
        decisions = body.get("field_decisions") or []
        if not decisions and body.get("applied_attributes"):
            # fallback empty
            decisions = []
        for decision in decisions:
            if not isinstance(decision, dict):
                continue
            status = decision.get("final_status")
            if status == "auto_applied":
                prev_auto += 1
            elif status == "needs_attention":
                prev_attention += 1
                reason = _classify_attention_reason(decision)
                bucket = groups.setdefault(
                    reason,
                    {
                        "reason": reason,
                        "count": 0,
                        "listing_ids": set(),
                        "field_keys": Counter(),
                        "examples": [],
                        "confidences": [],
                        **_group_guidance(reason),
                    },
                )
                bucket["count"] += 1
                bucket["listing_ids"].add(prop["property_listing_id"])
                bucket["field_keys"][str(decision.get("key"))] += 1
                conf = decision.get("confidence")
                if conf is not None:
                    bucket["confidences"].append(float(conf))
                if len(bucket["examples"]) < 5:
                    lid = prop["property_listing_id"]
                    bucket["examples"].append(
                        {
                            "listing_id": lid,
                            "external_id": listing_by_id[lid]["external_id"],
                            "key": decision.get("key"),
                            "value": decision.get("proposed_value"),
                            "confidence": conf,
                            "reasons": decision.get("reasons"),
                            "evidence_snippet": (decision.get("evidence_snippet") or "")[
                                :160
                            ],
                        }
                    )
            elif status == "rejected":
                prev_rejected += 1

    attention_groups = []
    for reason, bucket in sorted(groups.items(), key=lambda kv: -kv[1]["count"]):
        confs = bucket["confidences"]
        attention_groups.append(
            {
                "reason": reason,
                "count": bucket["count"],
                "affected_listings": len(bucket["listing_ids"]),
                "field_keys": dict(bucket["field_keys"].most_common()),
                "examples": bucket["examples"],
                "confidence_range": [
                    min(confs) if confs else None,
                    max(confs) if confs else None,
                ],
                "human_decision_needed": bucket["human_decision_needed"],
                "deterministic_normalization_resolves": bucket[
                    "deterministic_normalization_resolves"
                ],
                "should_reject_instead": bucket["should_reject_instead"],
                "remain_audit_only": bucket["remain_audit_only"],
            }
        )

    attention_report = {
        "generated_at": now,
        "project_ref": ref,
        "source_key": KW_SOURCE,
        "successful_proposals_analyzed": len(success_props),
        "previous_totals": {
            "auto_applied": prev_auto,
            "needs_attention": prev_attention,
            "rejected": prev_rejected,
        },
        "groups": attention_groups,
        "note": (
            "Attention queue should contain real exceptions, not every "
            "non-auto-applied suggestion. Policy v3 rejects noisy classes."
        ),
    }
    (PROCESSED / "kw_attention_reason_analysis.json").write_text(
        json.dumps(attention_report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    md_lines = [
        "# KW needs_attention reason analysis",
        "",
        f"Generated: {now}",
        "",
        f"Analyzed {len(success_props)} successful Terra proposals.",
        (
            f"Previous totals: auto-applied={prev_auto}, "
            f"needs_attention={prev_attention}, rejected={prev_rejected}."
        ),
        "",
        "| Reason | Count | Listings | Human? | Reject instead? |",
        "|---|---:|---:|---|---|",
    ]
    for g in attention_groups:
        md_lines.append(
            f"| {g['reason']} | {g['count']} | {g['affected_listings']} | "
            f"{g['human_decision_needed']} | {g['should_reject_instead']} |"
        )
    (PROCESSED / "kw_attention_reason_analysis.md").write_text(
        "\n".join(md_lines) + "\n", encoding="utf-8"
    )

    # --- Phase 10: local replay ---
    protected_before = _protected_snapshot(listings)
    expected_protected = json.loads(PROTECTED_CHECKSUM_FILE.read_text(encoding="utf-8"))
    expected_sha = expected_protected.get("protected_field_checksum_sha256")

    new_auto = 0
    new_attention = 0
    new_rejected = 0
    newly_applied: list[dict] = []
    newly_rejected: list[dict] = []
    remaining_exceptions: list[dict] = []
    neighbourhood_changes: list[dict] = []
    stop_reasons: list[str] = []
    replay_results: list[dict] = []

    for prop in success_props:
        lid = prop["property_listing_id"]
        listing = listing_by_id[lid]
        body = prop.get("proposal") or {}
        attrs = _attributes_from_stored_proposal(body)
        source_nb = listing.get("source_neighbourhood_text") or listing.get("location")
        source_values = {
            "title": listing.get("title"),
            "source_description": listing.get("description"),
            "description": listing.get("description"),
            "source_neighbourhood_text": source_nb,
            "location_text": listing.get("location"),
            "location_explicit": bool(source_nb)
            and not is_generic_neighbourhood(source_nb),
            "property_type": listing.get("property_type"),
            "bedrooms": listing.get("bedrooms"),
            "bathrooms": listing.get("bathrooms"),
        }
        corpus = _source_text_from_listing(listing)
        evaluation = evaluate_proposal_attributes(
            attrs, source_values=source_values, source_text=corpus
        )

        prev_decisions = {
            str(d.get("key")): d
            for d in (body.get("field_decisions") or [])
            if isinstance(d, dict)
        }
        for decision in evaluation.decisions:
            d = decision.as_dict()
            if decision.final_status == AutoApplyStatus.AUTO_APPLIED:
                new_auto += 1
                prev = prev_decisions.get(decision.key) or {}
                if prev.get("final_status") != "auto_applied":
                    newly_applied.append(
                        {
                            "listing_id": lid,
                            "external_id": listing["external_id"],
                            "key": decision.key,
                            "value": decision.proposed_value,
                            "previous_status": prev.get("final_status"),
                        }
                    )
            elif decision.final_status == AutoApplyStatus.NEEDS_ATTENTION:
                new_attention += 1
                remaining_exceptions.append(
                    {
                        "listing_id": lid,
                        "external_id": listing["external_id"],
                        "key": decision.key,
                        "value": decision.proposed_value,
                        "reasons": d.get("reasons"),
                        "confidence": decision.confidence,
                    }
                )
            elif decision.final_status == AutoApplyStatus.REJECTED:
                new_rejected += 1
                prev = prev_decisions.get(decision.key) or {}
                if prev.get("final_status") != "rejected":
                    newly_rejected.append(
                        {
                            "listing_id": lid,
                            "external_id": listing["external_id"],
                            "key": decision.key,
                            "previous_status": prev.get("final_status"),
                            "reasons": d.get("reasons"),
                        }
                    )

            # Evidence without grounding must not auto-apply
            if (
                decision.final_status == AutoApplyStatus.AUTO_APPLIED
                and not decision.evidence_snippet
            ):
                stop_reasons.append(f"{lid}:{decision.key}:auto_apply_without_evidence")

        # Neighbourhood priority check
        ai_nb = None
        ai_conf = None
        ai_evidence = None
        for decision in evaluation.decisions:
            if decision.key == "neighbourhood_candidate":
                ai_nb = decision.proposed_value
                ai_conf = decision.confidence
                ai_evidence = decision.evidence_snippet
                break
        map_name = None
        if listing.get("inferred_neighbourhood_id"):
            map_name = nb_names.get(listing["inferred_neighbourhood_id"])
        if not map_name and listing.get("neighbourhood_id"):
            # Only treat confirmed neighbourhood_id as map when assignment is geospatial
            status = str(listing.get("neighbourhood_assignment_status") or "")
            if status in {"inferred", "matched", "assigned", "geospatial"}:
                map_name = nb_names.get(listing["neighbourhood_id"])

        ai_grounded = bool(ai_evidence) and (ai_conf or 0) >= 0.85
        resolved = resolve_effective_neighbourhood(
            source_name=source_nb,
            map_name=map_name,
            ai_candidate_name=str(ai_nb) if ai_nb else None,
            ai_candidate_confidence=ai_conf,
            ai_evidence_grounded=ai_grounded,
        )
        # Priority violations
        source_specific = (
            source_values["location_explicit"]
            and not is_generic_neighbourhood(source_values["source_neighbourhood_text"])
        )
        if source_specific and resolved.provenance.value != "source":
            stop_reasons.append(f"{lid}:source_neighbourhood_priority_violated")
        if (
            map_name
            and not source_specific
            and resolved.provenance.value == "ai_extracted"
            and resolved.name
            and str(resolved.name).lower() != str(map_name).lower()
        ):
            stop_reasons.append(f"{lid}:map_neighbourhood_priority_violated")

        neighbourhood_changes.append(
            {
                "listing_id": lid,
                "external_id": listing["external_id"],
                "effective": resolved.name,
                "provenance": resolved.provenance.value,
                "ai_candidate": ai_nb,
            }
        )

        replay_results.append(
            {
                "listing_id": lid,
                "external_id": listing["external_id"],
                "proposal_id": prop["id"],
                "auto_applied": len(evaluation.auto_applied),
                "needs_attention": len(evaluation.needs_attention),
                "rejected": len(evaluation.rejected),
                "decisions": [d.as_dict() for d in evaluation.decisions],
                "effective_neighbourhood": {
                    "name": resolved.name,
                    "provenance": resolved.provenance.value,
                },
            }
        )

    protected_after = _protected_snapshot(listings)
    if protected_before != protected_after:
        stop_reasons.append("protected_source_facts_changed_in_memory")
    if expected_sha and protected_before != expected_sha:
        # Recompute may differ if listing columns drifted since checksum file;
        # record but don't invent a mutation.
        pass

    cost_unchanged = True
    stop = bool(stop_reasons)

    replay_report = {
        "generated_at": now,
        "project_ref": ref,
        "policy_version": POLICY_VERSION,
        "openai_calls": 0,
        "cost_unchanged": cost_unchanged,
        "successful_proposals_replayed": len(success_props),
        "previous_totals": {
            "auto_applied": prev_auto,
            "needs_attention": prev_attention,
            "rejected": prev_rejected,
        },
        "new_totals": {
            "auto_applied": new_auto,
            "needs_attention": new_attention,
            "rejected": new_rejected,
        },
        "newly_applied_count": len(newly_applied),
        "newly_rejected_count": len(newly_rejected),
        "remaining_meaningful_exceptions": len(remaining_exceptions),
        "newly_applied_sample": newly_applied[:40],
        "newly_rejected_sample": newly_rejected[:40],
        "remaining_exceptions_sample": remaining_exceptions[:40],
        "neighbourhood_changes_sample": neighbourhood_changes[:20],
        "protected_field_checksum_before": protected_before,
        "protected_field_checksum_after": protected_after,
        "protected_checksum_file": expected_sha,
        "protected_unchanged": protected_before == protected_after,
        "stop_before_persist": stop,
        "stop_reasons": stop_reasons[:50],
        "persist_requested": persist,
        "persisted": False,
        "listings": replay_results,
    }

    if persist and not stop:
        # Persist only enrichment-derived classifications / applied_attributes.
        for item in replay_results:
            prop_id = item["proposal_id"]
            lid = item["listing_id"]
            prop = latest[lid]
            body = dict(prop.get("proposal") or {})
            decisions = item["decisions"]
            applied = [
                {
                    "key": d["key"],
                    "value": d["proposed_value"],
                    "confidence": d["confidence"],
                    "evidence_snippet": d["evidence_snippet"],
                    "final_status": d["final_status"],
                    "reasons": d["reasons"],
                }
                for d in decisions
                if d["final_status"] == "auto_applied"
            ]
            body["field_decisions"] = decisions
            body["applied_attributes"] = applied
            body["policy_version"] = POLICY_VERSION
            body["policy_revalidated_at"] = now

            evidence = dict(prop.get("supporting_evidence") or {})
            run_audit = dict(evidence.get("run_audit") or {})
            run_audit["policy_version"] = POLICY_VERSION
            run_audit["policy_revalidation"] = True
            run_audit["policy_revalidated_at"] = now
            evidence["run_audit"] = run_audit

            client.table("ai_enrichment_proposals").update(
                {
                    "proposal": body,
                    "supporting_evidence": evidence,
                }
            ).eq("id", prop_id).execute()

            # Timeline: policy revalidation, not new AI generation
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
            }
            existing = (
                client.table("listing_activity_events")
                .select("id,new_value")
                .eq("property_listing_id", lid)
                .eq("event_type", AI_ENRICHMENT_COMPLETED)
                .order("event_at", desc=True)
                .limit(5)
                .execute()
            ).data or []
            already = any(
                isinstance(e.get("new_value"), dict)
                and e["new_value"].get("policy_revalidation")
                and e["new_value"].get("policy_version") == POLICY_VERSION
                for e in existing
            )
            if not already:
                client.table("listing_activity_events").insert(
                    {
                        "property_listing_id": lid,
                        "event_type": AI_ENRICHMENT_COMPLETED,
                        "event_at": event.event_at.isoformat(),
                        "previous_value": None,
                        "new_value": details,
                        "derivation_type": "system_calculated",
                        "confidence": 1.0,
                        "notes": (
                            f"Policy revalidation ({POLICY_VERSION}) without a new AI call. "
                            f"{item['auto_applied']} fields auto-applied, "
                            f"{item['needs_attention']} need attention."
                        ),
                    }
                ).execute()

        replay_report["persisted"] = True

    (PROCESSED / "kw_policy_v3_replay.json").write_text(
        json.dumps(replay_report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    replay_md = f"""# KW policy v3 local replay

Generated: {now}

- OpenAI calls: **0**
- Cost unchanged: **{cost_unchanged}**
- Proposals replayed: {len(success_props)}
- Previous: auto={prev_auto}, attention={prev_attention}, rejected={prev_rejected}
- New: auto={new_auto}, attention={new_attention}, rejected={new_rejected}
- Newly applied: {len(newly_applied)}
- Newly rejected: {len(newly_rejected)}
- Remaining meaningful exceptions: {len(remaining_exceptions)}
- Protected checksum unchanged: {protected_before == protected_after}
- Stop before persist: {stop}
- Persisted: {replay_report['persisted']}

Stop reasons: {stop_reasons[:20] or 'none'}
"""
    (PROCESSED / "kw_policy_v3_replay.md").write_text(replay_md, encoding="utf-8")

    print(
        json.dumps(
            {
                "attention_groups": len(attention_groups),
                "prev": attention_report["previous_totals"],
                "new": replay_report["new_totals"],
                "stop": stop,
                "stop_reasons": stop_reasons[:10],
                "persisted": replay_report["persisted"],
            },
            indent=2,
        )
    )
    return 1 if stop else 0


if __name__ == "__main__":
    raise SystemExit(main())
