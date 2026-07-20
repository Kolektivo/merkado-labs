"""Read-only enrichment quality audit for Property Labs (no writes, no OpenAI).

Usage:
  PYTHONPATH=src python scripts/audit_enrichment_quality.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.fields import (  # noqa: E402
    ALLOWED_AI_FIELDS,
    normalize_attribute_key,
)
from merkado_labs.enrichment.pricing import calculate_usage_cost_usd  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

SOURCE_KEYS = (
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
)

ALLOWLISTED = ALLOWED_AI_FIELDS | {
    "pool",
    "furnished",
    "parking",
    "parking_spaces",
    "garage",
    "gated_community",
    "air_conditioning",
    "sea_view",
    "garden",
    "balcony",
    "terrace",
    "solar_panels",
    "generator",
    "water_heater",
    "security_features",
    "pet_suitability",
    "accessibility",
    "appliance_inclusion",
    "waterfront",
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


def _page(client: Any, table: str, select: str, **filters: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0
    page = 1000
    while True:
        q = client.table(table).select(select).range(start, start + page - 1)
        for key, value in filters.items():
            if key.endswith("__in"):
                q = q.in_(key[:-4], value)
            elif key.endswith("__eq"):
                q = q.eq(key[:-4], value)
            else:
                q = q.eq(key, value)
        batch = q.execute().data or []
        rows.extend(batch)
        if len(batch) < page:
            break
        start += page
    return rows


def _classify_decision(decision: dict[str, Any]) -> str:
    status = str(decision.get("final_status") or "")
    reasons = [str(r) for r in (decision.get("reasons") or [])]
    reason_set = set(reasons)
    if status == "auto_applied":
        return "accepted"
    if status == "needs_attention":
        return "needs_attention"
    if status == "skipped":
        return "skipped"
    if "already_represented_by_source" in reason_set:
        return "redundant_source_value"
    if "already_represented_by_map" in reason_set:
        return "redundant_map_value"
    if "unknown_attribute_flexible_bag" in reason_set or "unsupported_rejected" in reason_set:
        return "rejected_not_allowlisted"
    if "forbidden_field" in reason_set:
        return "rejected_invalid"
    if any(
        r in reason_set
        for r in (
            "evidence_not_grounded",
            "evidence_not_in_source",
            "missing_or_weak_evidence",
            "evidence_too_short",
            "confidence_too_low",
        )
    ):
        return "rejected_unsupported"
    if any(
        r in reason_set
        for r in (
            "source_conflict",
            "title_description_conflict",
            "effective_resolver_conflict",
            "negation_conflict_with_source",
        )
    ):
        return "rejected_conflict"
    if any(
        r in reason_set
        for r in (
            "parking_spaces_not_integer",
            "parking_spaces_out_of_bounds",
            "gated_without_gate_synonym_rejected",
        )
    ):
        return "rejected_invalid"
    if status == "rejected":
        return "rejected_unsupported"
    return "missing_policy_decision"


def _detect_language(text: str) -> str:
    sample = text[:2000].lower()
    nl_hits = len(
        re.findall(
            r"\b(de|het|een|van|voor|met|gelegen|woning|slaapkamer|badkamer|tuin)\b",
            sample,
        )
    )
    en_hits = len(
        re.findall(
            r"\b(the|and|with|bedroom|bathroom|garden|located|property|apartment)\b",
            sample,
        )
    )
    if nl_hits >= en_hits + 3:
        return "nl"
    if en_hits >= nl_hits + 3:
        return "en"
    if nl_hits and en_hits:
        return "mixed"
    return "unknown"


def _description_score(text: str | None) -> dict[str, Any]:
    if not text or not str(text).strip():
        return {
            "score": 0,
            "length": 0,
            "paragraphs": 0,
            "language": "missing",
            "flags": ["missing_description"],
            "acceptable": False,
        }
    raw = str(text)
    cleaned = re.sub(r"[ \t]+", " ", raw)
    paragraphs = [p for p in re.split(r"\n\s*\n", cleaned.strip()) if p.strip()]
    words = re.findall(r"\b\w+\b", cleaned)
    flags: list[str] = []
    if len(words) > 350:
        flags.append("exceeds_display_length")
    if re.search(r"(whatsapp|call\s+us|email\s*:|@\w+\.\w+)", cleaned, re.I):
        flags.append("agent_contact_details")
    if re.search(r"(copyright|all rights reserved|privacy policy)", cleaned, re.I):
        flags.append("unrelated_footer")
    if len(re.findall(r"[A-ZÁÉÍÓÚ]{6,}", cleaned)) >= 3:
        flags.append("all_caps_content")
    if "\n\n\n" in raw or "  " * 3 in raw:
        flags.append("excessive_whitespace")
    if cleaned.count(cleaned[:80]) > 1 and len(cleaned) > 160:
        flags.append("possible_duplicated_text")
    lang = _detect_language(cleaned)
    if lang == "mixed":
        flags.append("mixed_language_content")
    score = 100
    score -= 15 * len(flags)
    if 40 <= len(words) <= 220 and not flags:
        score = max(score, 85)
        acceptable = True
    else:
        acceptable = score >= 70 and "missing_description" not in flags
    return {
        "score": max(0, min(100, score)),
        "length": len(cleaned),
        "word_count": len(words),
        "paragraphs": len(paragraphs),
        "language": lang,
        "flags": flags,
        "acceptable": acceptable,
    }


def main() -> int:
    _load_env()
    ref = os.environ.get("SUPABASE_PROJECT_REF", "")
    if ref != "csaefdkpwukshtouyixg":
        raise SystemExit(f"Refusing non-Labs project ref: {ref!r}")
    if "jkrfyvukhhsapoivntms" in json.dumps(dict(os.environ)):
        raise SystemExit("Production reference detected in environment")

    client = create_labs_client()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = ROOT / "data" / "processed" / f"enrichment_quality_audit_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = _page(
        client,
        "property_sources",
        "id,source_key,display_name,enabled",
        source_key__in=list(SOURCE_KEYS),
    )
    source_by_id = {s["id"]: s for s in sources}
    listings = _page(
        client,
        "property_listings",
        "id,external_id,title,property_source_id,public_eligible,status,"
        "source_neighbourhood_text,neighbourhood_id,inferred_neighbourhood_id,"
        "latitude,longitude,listing_type,original_price,currency,bedrooms,bathrooms,"
        "description,amenities,enrichment_status,enrichment_last_input_checksum,"
        "property_type,source_listing_status",
        property_source_id__in=list(source_by_id),
    )
    proposals = _page(
        client,
        "ai_enrichment_proposals",
        "id,property_listing_id,status,prompt_version,schema_version,model,"
        "input_checksum,proposal,supporting_evidence,token_usage,confidence,"
        "generated_at,created_at,review_status",
        prompt_version__eq="listing_enrichment_v3",
    )
    public_rows = _page(
        client,
        "public_property_listings",
        "id,external_id,source_key,effective_neighbourhood,"
        "effective_neighbourhood_provenance,effective_summary,public_attributes,"
        "description,listing_type",
    )
    neighbourhoods = {
        n["id"]: n.get("name")
        for n in _page(client, "neighbourhoods", "id,name")
    }

    latest: dict[str, dict[str, Any]] = {}
    for p in sorted(
        proposals,
        key=lambda r: (
            str(r.get("generated_at") or ""),
            str(r.get("created_at") or ""),
        ),
    ):
        if p.get("status") != "succeeded":
            continue
        latest[str(p["property_listing_id"])] = p

    category_counts: Counter[str] = Counter()
    by_source: dict[str, Counter[str]] = defaultdict(Counter)
    by_field: dict[str, Counter[str]] = defaultdict(Counter)
    reason_counts: Counter[str] = Counter()
    true_rejected = 0
    redundant = 0
    accepted = 0
    needs_attention = 0
    raw_proposal_fields = 0
    unique_keys: set[tuple[str, str]] = set()
    total_cost = 0.0
    cost_from_audit = 0.0

    for listing_id, prop in latest.items():
        listing = next((row for row in listings if row["id"] == listing_id), None)
        source_key = "unknown"
        if listing:
            src = source_by_id.get(listing["property_source_id"], {})
            source_key = str(src.get("source_key") or "unknown")
        usage = prop.get("token_usage") or {}
        if isinstance(usage, dict):
            try:
                cost, _err = calculate_usage_cost_usd(
                    model=str(prop.get("model") or "gpt-5.6-terra"),
                    input_tokens=int(usage.get("input_tokens") or 0),
                    output_tokens=int(usage.get("output_tokens") or 0),
                    cached_input_tokens=int(usage.get("cached_input_tokens") or 0),
                )
                if cost is not None:
                    total_cost += float(cost)
            except Exception:
                pass
        audit = (prop.get("supporting_evidence") or {}).get("run_audit") or {}
        if isinstance(audit, dict) and audit.get("estimated_cost_usd") is not None:
            try:
                cost_from_audit += float(audit["estimated_cost_usd"])
            except (TypeError, ValueError):
                pass
        body = prop.get("proposal") or {}
        decisions = body.get("field_decisions") or []
        for d in decisions:
            if not isinstance(d, dict):
                continue
            raw_proposal_fields += 1
            key = normalize_attribute_key(str(d.get("key") or ""))
            unique_keys.add((listing_id, key))
            cat = _classify_decision(d)
            category_counts[cat] += 1
            by_source[source_key][cat] += 1
            by_field[key][cat] += 1
            for r in d.get("reasons") or []:
                reason_counts[str(r)] += 1
            if cat == "accepted":
                accepted += 1
            elif cat.startswith("redundant"):
                redundant += 1
            elif cat == "needs_attention":
                needs_attention += 1
            elif cat.startswith("rejected"):
                true_rejected += 1

    public_by_id = {r["id"]: r for r in public_rows}
    desc_stats: dict[str, Any] = {
        "total_public": len(public_rows),
        "by_source": {},
        "by_language": Counter(),
        "acceptable": 0,
        "missing": 0,
        "flags": Counter(),
        "avg_score": 0.0,
    }
    scores: list[int] = []
    for row in public_rows:
        src = str(row.get("source_key") or "unknown")
        desc_stats["by_source"].setdefault(
            src,
            {"count": 0, "acceptable": 0, "missing": 0, "avg_words": 0, "words": []},
        )
        bucket = desc_stats["by_source"][src]
        bucket["count"] += 1
        scored = _description_score(row.get("description"))
        scores.append(int(scored["score"]))
        desc_stats["by_language"][scored["language"]] += 1
        if scored["language"] == "missing" or "missing_description" in scored["flags"]:
            desc_stats["missing"] += 1
            bucket["missing"] += 1
        if scored["acceptable"]:
            desc_stats["acceptable"] += 1
            bucket["acceptable"] += 1
        for flag in scored["flags"]:
            desc_stats["flags"][flag] += 1
        bucket["words"].append(int(scored.get("word_count") or 0))
    for src, bucket in desc_stats["by_source"].items():
        words = bucket.pop("words")
        bucket["avg_words"] = round(sum(words) / len(words), 1) if words else 0
    desc_stats["avg_score"] = round(sum(scores) / len(scores), 1) if scores else 0
    desc_stats["by_language"] = dict(desc_stats["by_language"])
    desc_stats["flags"] = dict(desc_stats["flags"])

    # Villa Maria + representative traces
    traces = []
    for listing in listings:
        src = source_by_id.get(listing["property_source_id"], {})
        source_key = str(src.get("source_key") or "")
        prop = latest.get(str(listing["id"]))
        public = public_by_id.get(listing["id"])
        map_name = neighbourhoods.get(listing.get("inferred_neighbourhood_id"))
        joined_source_nb = neighbourhoods.get(listing.get("neighbourhood_id"))
        listings_table_effective = joined_source_nb or map_name
        decisions = ((prop or {}).get("proposal") or {}).get("field_decisions") or []
        nb_decision = next(
            (d for d in decisions if d.get("key") == "neighbourhood_candidate"),
            None,
        )
        traces.append(
            {
                "external_id": listing.get("external_id"),
                "title": listing.get("title"),
                "source_key": source_key,
                "public_eligible": listing.get("public_eligible"),
                "listing_type": listing.get("listing_type"),
                "has_coords": listing.get("latitude") is not None
                and listing.get("longitude") is not None,
                "source_neighbourhood_text": listing.get("source_neighbourhood_text"),
                "joined_neighbourhood_name": joined_source_nb,
                "map_neighbourhood": map_name,
                "listings_table_would_show": listings_table_effective or "Not specified",
                "public_effective_neighbourhood": (public or {}).get(
                    "effective_neighbourhood"
                ),
                "public_provenance": (public or {}).get(
                    "effective_neighbourhood_provenance"
                ),
                "effective_summary": (public or {}).get("effective_summary"),
                "public_attribute_count": len((public or {}).get("public_attributes") or []),
                "ai_neighbourhood_decision": nb_decision,
                "description_preview": (listing.get("description") or "")[:160],
            }
        )

    villa = next(
        (t for t in traces if t.get("external_id") == "property-18650"),
        None,
    )

    # Coverage / conversion metrics
    public_attr_fields = 0
    for row in public_rows:
        public_attr_fields += len(row.get("public_attributes") or [])
    listings_with_source_nb_missed_in_table = sum(
        1
        for row in listings
        if (row.get("source_neighbourhood_text") or "").strip()
        and not neighbourhoods.get(row.get("neighbourhood_id"))
        and not neighbourhoods.get(row.get("inferred_neighbourhood_id"))
        and (row.get("source_neighbourhood_text") or "").strip().casefold()
        not in {
            "curacao",
            "curaçao",
            "curaçao island",
            "island",
            "netherlands antilles",
            "dutch caribbean",
        }
    )

    catalog_by_source = Counter(
        str(source_by_id[row["property_source_id"]]["source_key"])
        for row in listings
        if row["property_source_id"] in source_by_id
    )
    public_by_source = Counter(
        str(r.get("source_key")) for r in public_rows if r.get("source_key")
    )

    dashboard_rejected = sum(
        v
        for k, v in category_counts.items()
        if k.startswith("rejected") or k.startswith("redundant")
    )
    dashboard_rejection_pct = (
        round(100.0 * dashboard_rejected / raw_proposal_fields, 2)
        if raw_proposal_fields
        else 0.0
    )
    true_unsupported_pct = (
        round(100.0 * category_counts["rejected_unsupported"] / raw_proposal_fields, 2)
        if raw_proposal_fields
        else 0.0
    )

    summary = {
        "generated_at": stamp,
        "labs_project_ref": ref,
        "catalog_listings": len(listings),
        "public_listings": len(public_rows),
        "terra_v3_latest_succeeded_listings": len(latest),
        "raw_proposal_field_count": raw_proposal_fields,
        "unique_listing_field_pairs": len(unique_keys),
        "category_counts": dict(category_counts),
        "accepted": accepted,
        "redundant": redundant,
        "true_rejected_unsupported_conflict_invalid_not_allowlisted": true_rejected,
        "needs_attention": needs_attention,
        "dashboard_style_rejection_pct": dashboard_rejection_pct,
        "true_unsupported_pct_of_all_decisions": true_unsupported_pct,
        "apparent_rejection_explanation": {
            "headline": (
                f"Latest v3 field decisions show ~{dashboard_rejection_pct}% non-accepted "
                f"(rejected+redundant lumped). True unsupported is "
                f"{category_counts.get('rejected_unsupported', 0)} "
                f"({true_unsupported_pct}%). Not-allowlisted flexible-bag keys: "
                f"{category_counts.get('rejected_not_allowlisted', 0)}. "
                f"Redundant source/map echoes: {redundant}."
            ),
            "causes": [
                "AI emits non-allowlisted keys into the flexible bag",
                "Source/map neighbourhood echoes marked rejected (should be redundant)",
                "concise_summary evidence is the summary text itself",
                "Dashboard metrics treat all non-auto_applied as rejected",
                "Listings table ignores source_neighbourhood_text",
            ],
        },
        "cost_usd_recomputed_from_tokens": round(total_cost, 4),
        "cost_usd_from_run_audit": round(cost_from_audit, 4),
        "cost_per_accepted_field": round(cost_from_audit / accepted, 4) if accepted else None,
        "cost_per_public_visible_attr": (
            round(cost_from_audit / public_attr_fields, 4) if public_attr_fields else None
        ),
        "cost_per_listing_with_proposal": (
            round(cost_from_audit / len(latest), 4) if latest else None
        ),
        "public_effective_neighbourhood_coverage": sum(
            1 for r in public_rows if r.get("effective_neighbourhood")
        ),
        "public_effective_summary_coverage": sum(
            1 for r in public_rows if r.get("effective_summary")
        ),
        "public_attribute_field_instances": public_attr_fields,
        "listings_table_misses_source_neighbourhood": listings_with_source_nb_missed_in_table,
        "catalog_by_source": dict(catalog_by_source),
        "public_by_source": dict(public_by_source),
        "by_source": {k: dict(v) for k, v in by_source.items()},
        "by_field_top": {
            k: dict(v)
            for k, v in sorted(by_field.items(), key=lambda kv: -sum(kv[1].values()))[:40]
        },
        "top_reasons": reason_counts.most_common(30),
        "description_audit": desc_stats,
        "villa_maria": villa,
        "rejection_rate_nuance": {
            "raw_rejected_final_status_pct": round(
                100.0
                * sum(
                    1
                    for p in latest.values()
                    for d in ((p.get("proposal") or {}).get("field_decisions") or [])
                    if d.get("final_status") == "rejected"
                )
                / max(1, raw_proposal_fields),
                2,
            ),
            "note": (
                "UI ~94% rejected aligns with final_status=rejected "
                "including redundant and not-allowlisted bag keys."
            ),
        },
    }

    # Select representative traces
    def pick(predicate, n: int) -> list[dict[str, Any]]:
        out = [t for t in traces if predicate(t)]
        return out[:n]

    representative = {
        "keller_williams": pick(lambda t: t["source_key"] == "keller_williams_curacao", 5),
        "remax": pick(lambda t: t["source_key"] == "remax_curacao", 5),
        "moret": pick(lambda t: t["source_key"] == "moret_real_estate", 5),
        "monumentenzorg_all": pick(
            lambda t: t["source_key"] == "monumentenzorg_curacao", 10
        ),
        "villa_maria": villa,
        "source_nb_present_table_miss": pick(
            lambda t: t.get("source_neighbourhood_text")
            and t.get("listings_table_would_show") == "Not specified",
            5,
        ),
        "no_coords": pick(lambda t: not t.get("has_coords"), 5),
        "rent": pick(lambda t: t.get("listing_type") == "rent", 5),
        "sale": pick(lambda t: t.get("listing_type") == "sale", 5),
    }

    (out_dir / "COMPREHENSIVE_SUMMARY.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )
    (out_dir / "TRACES.json").write_text(
        json.dumps(representative, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )

    md = [
        f"# Enrichment quality audit ({stamp})",
        "",
        f"- Labs project: `{ref}`",
        f"- Catalog listings: **{len(listings)}**",
        f"- Public listings: **{len(public_rows)}**",
        f"- Latest succeeded Terra-v3 listings: **{len(latest)}**",
        f"- Raw field decisions: **{raw_proposal_fields}**",
        "",
        "## Why the UI shows ~94% rejected",
        "",
        summary["apparent_rejection_explanation"]["headline"],
        "",
        "Root causes:",
    ]
    for cause in summary["apparent_rejection_explanation"]["causes"]:
        md.append(f"- {cause}")
    md.extend(
        [
            "",
            "## Decision categories (latest v3 per listing)",
            "",
            "| Category | Count |",
            "|---|---:|",
        ]
    )
    for key, value in sorted(category_counts.items(), key=lambda kv: -kv[1]):
        md.append(f"| {key} | {value} |")
    md.extend(
        [
            "",
            f"- Dashboard-style non-accepted rate: **{dashboard_rejection_pct}%**",
            f"- True unsupported rate: **{true_unsupported_pct}%**",
            f"- Redundant (source/map echo): **{redundant}**",
            f"- Accepted (auto_applied): **{accepted}**",
            f"- Needs attention: **{needs_attention}**",
            "",
            "## Cost",
            "",
            f"- From run_audit estimated_cost_usd: **USD {cost_from_audit:.4f}**",
            f"- Recomputed from tokens: **USD {total_cost:.4f}**",
            f"- Cost / accepted field: **{summary['cost_per_accepted_field']}**",
            (
                "- Cost / public-visible attribute instance: "
                f"**{summary['cost_per_public_visible_attr']}**"
            ),
            (
                "- Cost / listing with proposal: "
                f"**{summary['cost_per_listing_with_proposal']}**"
            ),
            "",
            "## Public coverage",
            "",
            (
                "- Effective neighbourhood: "
                f"**{summary['public_effective_neighbourhood_coverage']}"
                f"/{len(public_rows)}**"
            ),
            (
                "- Effective summary: "
                f"**{summary['public_effective_summary_coverage']}"
                f"/{len(public_rows)}**"
            ),
            f"- Public attribute instances: **{public_attr_fields}**",
            (
                "- Listings table misses source neighbourhood text: "
                f"**{listings_with_source_nb_missed_in_table}**"
            ),
            "",
            "## Villa Maria",
            "",
            "```json",
            json.dumps(villa, indent=2, ensure_ascii=False, default=str),
            "```",
            "",
            "## Description audit (public)",
            "",
            (
                "- Acceptable presentation score: "
                f"**{desc_stats['acceptable']}/{desc_stats['total_public']}**"
            ),
            f"- Average score: **{desc_stats['avg_score']}**",
            f"- Languages: `{desc_stats['by_language']}`",
            f"- Flags: `{desc_stats['flags']}`",
            "",
            "## Top rejection reasons",
            "",
        ]
    )
    for reason, count in reason_counts.most_common(20):
        md.append(f"- `{reason}`: {count}")

    (out_dir / "COMPREHENSIVE_AUDIT.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(json.dumps({"out_dir": str(out_dir), "summary_keys": list(summary.keys())}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
