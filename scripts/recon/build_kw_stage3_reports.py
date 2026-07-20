"""Build KW Stage 3 field-coverage, location, and quality reports from local cache."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.adapters.keller_williams_curacao import (  # noqa: E402
    KellerWilliamsCuracaoAdapter,
    load_neighbourhood_lexicon,
)

CACHE = ROOT / "data/raw/keller_williams_curacao/cache"
DRY_RUN = ROOT / "data/processed/kw_catalog_dry_run.json"
OUT_COVERAGE_JSON = ROOT / "data/processed/kw_catalog_field_coverage.json"
OUT_COVERAGE_MD = ROOT / "data/processed/kw_catalog_field_coverage.md"
OUT_QUALITY = ROOT / "data/processed/kw_catalog_quality_findings.json"
OUT_LOCATION = ROOT / "data/processed/kw_catalog_location_evidence.json"
OUT_REPARSED = ROOT / "data/processed/kw_catalog_reparsed_snapshots.json"


def _populated(value: Any) -> bool:
    if value is None:
        return False
    if value == ():
        return False
    if value == "":
        return False
    return True


def main() -> int:
    dry = json.loads(DRY_RUN.read_text(encoding="utf-8"))
    adapter = KellerWilliamsCuracaoAdapter()
    lexicon = load_neighbourhood_lexicon()
    snaps = []
    for item in dry["listings"]:
        url = item["url"]
        key = hashlib.sha256(url.encode()).hexdigest()
        html = (CACHE / f"{key}.html").read_text(encoding="utf-8", errors="replace")
        snap = adapter.parse_listing_html(
            html,
            listing_url=url,
            raw_sha256=item["raw_sha256"],
            neighbourhood_lexicon=lexicon,
        )
        snaps.append((item, html, snap))

    n = len(snaps)
    field_specs: list[dict[str, Any]] = [
        {
            "field": "external_id",
            "getter": lambda s: s.external_id,
            "selector": "url_slug / ID_FROM_SLUG_RE",
            "kind": "explicit_source_fact",
            "common_failure": "slug without trailing reference token",
            "parser_improvement_possible": True,
        },
        {
            "field": "title",
            "getter": lambda s: s.title,
            "selector": "h1 / <title>",
            "kind": "explicit_source_fact",
            "common_failure": "missing heading",
            "parser_improvement_possible": False,
        },
        {
            "field": "listing_type",
            "getter": lambda s: s.listing_type,
            "selector": "URL path + .page-property-details__type",
            "kind": "explicit_source_fact",
            "common_failure": "ambiguous path",
            "parser_improvement_possible": False,
        },
        {
            "field": "source_status",
            "getter": lambda s: s.source_status,
            "selector": ".page-property-details__status",
            "kind": "explicit_source_fact",
            "common_failure": "status element absent",
            "parser_improvement_possible": False,
        },
        {
            "field": "normalized_lifecycle_status",
            "getter": lambda s: s.lifecycle_hint.value if s.lifecycle_hint else None,
            "selector": "mapped from source_status",
            "kind": "calculated_value",
            "common_failure": "unmapped status label",
            "parser_improvement_possible": True,
        },
        {
            "field": "original_price",
            "getter": lambda s: s.original_price.amount if s.original_price else None,
            "selector": ".page-property-details__price first currency amount",
            "kind": "explicit_source_fact",
            "common_failure": "price upon request / missing price block",
            "parser_improvement_possible": False,
        },
        {
            "field": "original_currency",
            "getter": lambda s: s.original_price.currency if s.original_price else None,
            "selector": ".page-property-details__price first currency code",
            "kind": "explicit_source_fact",
            "common_failure": "no price block",
            "parser_improvement_possible": False,
        },
        {
            "field": "xcg_benchmark",
            "getter": lambda s: None,
            "selector": "post-import ECB/XCG conversion (not in dry-run)",
            "kind": "calculated_value",
            "common_failure": "requires import + rate provider",
            "parser_improvement_possible": False,
        },
        {
            "field": "location_text",
            "getter": lambda s: s.location_text,
            "selector": ".page-property-details__location",
            "kind": "explicit_source_fact",
            "common_failure": "missing location element",
            "parser_improvement_possible": False,
        },
        {
            "field": "neighbourhood_text",
            "getter": lambda s: s.neighbourhood_text,
            "selector": "dedicated location, else features, else alias match",
            "kind": "explicit_or_inferred",
            "common_failure": "generic Curaçao label without alias evidence",
            "parser_improvement_possible": True,
        },
        {
            "field": "bedrooms",
            "getter": lambda s: s.bedrooms,
            "selector": "#features Bedrooms / option__value",
            "kind": "explicit_source_fact",
            "common_failure": "lots/commercial without bedroom rows",
            "parser_improvement_possible": False,
        },
        {
            "field": "full_bathrooms",
            "getter": lambda s: s.raw_payload.get("full_bathrooms"),
            "selector": "#features Full bathrooms",
            "kind": "explicit_source_fact",
            "common_failure": "row absent",
            "parser_improvement_possible": False,
        },
        {
            "field": "half_bathrooms",
            "getter": lambda s: s.raw_payload.get("half_bathrooms"),
            "selector": "#features Half bathrooms",
            "kind": "explicit_source_fact",
            "common_failure": "row absent",
            "parser_improvement_possible": False,
        },
        {
            "field": "normalized_bathrooms",
            "getter": lambda s: s.bathrooms,
            "selector": "full + half/2",
            "kind": "calculated_value",
            "common_failure": "no bathroom rows",
            "parser_improvement_possible": False,
        },
        {
            "field": "floor_build_up_area_m2",
            "getter": lambda s: s.floor_area_m2,
            "selector": "#features Build up size",
            "kind": "explicit_source_fact",
            "common_failure": "empty/zero m² placeholder",
            "parser_improvement_possible": False,
        },
        {
            "field": "lot_land_area",
            "getter": lambda s: s.lot_area_value,
            "selector": "#features Land size",
            "kind": "explicit_source_fact",
            "common_failure": "empty/zero land size",
            "parser_improvement_possible": False,
        },
        {
            "field": "property_type",
            "getter": lambda s: s.property_type,
            "selector": ".page-property-details__type",
            "kind": "explicit_source_fact",
            "common_failure": "unexpected type badge text",
            "parser_improvement_possible": True,
        },
        {
            "field": "description",
            "getter": lambda s: s.description,
            "selector": "#description .wysiwyg",
            "kind": "explicit_source_fact",
            "common_failure": "empty description tab",
            "parser_improvement_possible": False,
        },
        {
            "field": "source_description_html",
            "getter": lambda s: s.source_description_html,
            "selector": "#description .wysiwyg inner HTML",
            "kind": "explicit_source_fact",
            "common_failure": "description block missing",
            "parser_improvement_possible": False,
        },
        {
            "field": "images",
            "getter": lambda s: s.image_urls,
            "selector": "a[data-fancybox=gallery][href*=/storage/]",
            "kind": "explicit_source_fact",
            "common_failure": "gallery absent",
            "parser_improvement_possible": False,
        },
        {
            "field": "realtor_agent_name",
            "getter": lambda s: s.raw_payload.get("agent_name"),
            "selector": ".card-agent__name",
            "kind": "explicit_source_fact",
            "common_failure": "agent card missing",
            "parser_improvement_possible": False,
        },
        {
            "field": "realtor_reference",
            "getter": lambda s: s.external_id,
            "selector": "URL slug reference token",
            "kind": "explicit_source_fact",
            "common_failure": "unparseable slug",
            "parser_improvement_possible": True,
        },
        {
            "field": "coordinates",
            "getter": lambda s: s.latitude is not None and s.longitude is not None,
            "selector": "script latLng { lat, lng }",
            "kind": "explicit_source_fact",
            "common_failure": "map block without coordinates",
            "parser_improvement_possible": False,
        },
        {
            "field": "amenities_features",
            "getter": lambda s: s.amenities,
            "selector": "no dedicated amenities section on KW detail pages",
            "kind": "explicit_source_fact",
            "common_failure": "source has no amenity checklist",
            "parser_improvement_possible": False,
        },
        {
            "field": "source_listing_date",
            "getter": lambda s: s.source_listed_at,
            "selector": "not present in KW HTML",
            "kind": "explicit_source_fact",
            "common_failure": "source omits listing date",
            "parser_improvement_possible": False,
        },
        {
            "field": "source_url",
            "getter": lambda s: s.source_url,
            "selector": "request URL",
            "kind": "explicit_source_fact",
            "common_failure": "n/a",
            "parser_improvement_possible": False,
        },
        {
            "field": "raw_evidence_checksum",
            "getter": lambda s: s.raw_sha256,
            "selector": "sha256(html bytes)",
            "kind": "calculated_value",
            "common_failure": "n/a",
            "parser_improvement_possible": False,
        },
        {
            "field": "parser_warnings",
            "getter": lambda s: s.warnings,
            "selector": "adapter warnings tuple",
            "kind": "calculated_value",
            "common_failure": "n/a",
            "parser_improvement_possible": False,
        },
    ]

    coverage_rows = []
    for spec in field_specs:
        pop = sum(1 for _, _, s in snaps if _populated(spec["getter"](s)))
        coverage_rows.append(
            {
                "field": spec["field"],
                "populated_count": pop,
                "missing_count": n - pop,
                "percent_populated": round(100.0 * pop / n, 1) if n else 0.0,
                "extraction_source_selector": spec["selector"],
                "value_kind": spec["kind"],
                "common_failure_reason": spec["common_failure"],
                "parser_improvement_possible": spec["parser_improvement_possible"],
            }
        )

    # Location evidence frequency
    dedicated_values = Counter()
    title_hits = []
    desc_hits = []
    slug_hits = []
    coords_no_neigh = []
    conflicts = []
    for item, html, snap in snaps:
        loc = snap.location_text
        if loc:
            dedicated_values[loc] += 1
        evidence = (snap.structured_evidence or {}).get("location_evidence") or {}
        if evidence.get("title_alias"):
            title_hits.append(
                {
                    "external_id": snap.external_id,
                    "match": evidence["title_alias"],
                    "title": snap.title,
                }
            )
        if evidence.get("description_alias"):
            desc_hits.append(
                {
                    "external_id": snap.external_id,
                    "match": evidence["description_alias"],
                }
            )
        if evidence.get("slug_alias"):
            slug_hits.append(
                {
                    "external_id": snap.external_id,
                    "match": evidence["slug_alias"],
                }
            )
        if snap.latitude is not None and not snap.neighbourhood_text:
            coords_no_neigh.append(snap.external_id)
        for warning in snap.warnings:
            if warning.startswith("neighbourhood_alias_conflict:"):
                conflicts.append({"external_id": snap.external_id, "warning": warning})

    location_report = {
        "listing_count": n,
        "dedicated_location_values": dict(dedicated_values.most_common()),
        "titles_with_alias_match_count": len(title_hits),
        "descriptions_with_alias_match_count": len(desc_hits),
        "slugs_with_alias_match_count": len(slug_hits),
        "titles_with_alias_match": title_hits[:50],
        "descriptions_with_alias_match": desc_hits[:50],
        "slugs_with_alias_match": slug_hits[:50],
        "coords_without_neighbourhood": coords_no_neigh,
        "conflicting_location_signals": conflicts,
        "generic_location_listings": [
            {
                "external_id": s.external_id,
                "location_text": s.location_text,
                "neighbourhood_text": s.neighbourhood_text,
            }
            for _, _, s in snaps
            if "generic_location_text" in s.warnings
        ],
        "inferred_neighbourhood_listings": [
            {
                "external_id": s.external_id,
                "neighbourhood_text": s.neighbourhood_text,
                "location_text": s.location_text,
            }
            for _, _, s in snaps
            if any(f.field_name == "neighbourhood_text" and f.inferred for f in s.fields)
        ],
    }

    # Quality findings
    findings: list[dict[str, Any]] = []
    for item, html, snap in snaps:
        if snap.bedrooms is not None and snap.bedrooms > 12:
            findings.append(
                {
                    "external_id": snap.external_id,
                    "url": snap.source_url,
                    "finding": f"bedrooms_high:{snap.bedrooms}",
                    "classification": "requires_human_review",
                    "notes": "May be multi-unit / student housing; source feature value retained.",
                }
            )
        if snap.bathrooms is not None and snap.bathrooms > 10:
            findings.append(
                {
                    "external_id": snap.external_id,
                    "url": snap.source_url,
                    "finding": f"bathrooms_high:{snap.bathrooms}",
                    "classification": "requires_human_review",
                    "notes": "High bathroom count from source features.",
                }
            )
        if snap.floor_area_m2 is not None and snap.floor_area_m2 <= 0:
            findings.append(
                {
                    "external_id": snap.external_id,
                    "finding": "non_positive_floor_area",
                    "classification": "parser_defect",
                    "notes": "Should have been dropped.",
                }
            )
        if (
            snap.floor_area_m2
            and snap.lot_area_value
            and snap.floor_area_m2 > snap.lot_area_value * Decimal("3")
        ):
            findings.append(
                {
                    "external_id": snap.external_id,
                    "finding": "floor_area_much_larger_than_lot",
                    "classification": "ambiguous",
                    "notes": f"floor={snap.floor_area_m2} lot={snap.lot_area_value}",
                }
            )
        if snap.location_text and snap.location_text.casefold() in {"curaçao", "curacao"}:
            findings.append(
                {
                    "external_id": snap.external_id,
                    "finding": "generic_location_curaçao",
                    "classification": "source_data_issue",
                    "notes": f"neighbourhood_text={snap.neighbourhood_text!r}",
                }
            )
        # Duplicate image URLs already de-duped; check agent image leakage
        if any("thumb_" in u and "600_600" in u for u in snap.image_urls):
            findings.append(
                {
                    "external_id": snap.external_id,
                    "finding": "possible_non_gallery_image",
                    "classification": "ambiguous",
                    "notes": "Gallery URL pattern unusual",
                }
            )
        if snap.title and "keller williams" in snap.title.casefold():
            findings.append(
                {
                    "external_id": snap.external_id,
                    "finding": "title_contains_brokerage_boilerplate",
                    "classification": "parser_defect",
                    "notes": snap.title,
                }
            )
        if snap.description and "silent listings" in snap.description.casefold():
            findings.append(
                {
                    "external_id": snap.external_id,
                    "finding": "description_may_include_nav",
                    "classification": "ambiguous",
                    "notes": "Navigation phrase found in description text",
                }
            )

    # Duplicate external ids across URLs (from dry-run discovery)
    id_urls = defaultdict(list)
    for item, _, snap in snaps:
        id_urls[snap.external_id].append(snap.source_url)
    for external_id, urls in id_urls.items():
        if len(set(urls)) > 1:
            findings.append(
                {
                    "external_id": external_id,
                    "finding": "duplicate_external_id_multiple_urls",
                    "classification": "requires_human_review",
                    "notes": urls,
                }
            )

    # Acceptable no-price
    for _, _, snap in snaps:
        if not snap.has_positive_price:
            findings.append(
                {
                    "external_id": snap.external_id,
                    "finding": "no_price",
                    "classification": "source_data_issue",
                    "notes": f"status={snap.source_status}",
                }
            )

    coverage_payload = {
        "generated_from": "local_cache_reparse_after_stage3_parser",
        "adapter_version": snaps[0][2].adapter_version if snaps else None,
        "listing_count": n,
        "dry_run_outcome": dry["run"],
        "fields": coverage_rows,
        "warning_counts": dict(
            Counter(w for _, _, s in snaps for w in s.warnings).most_common()
        ),
        "category_breakdown": {
            "sale": sum(1 for _, _, s in snaps if s.listing_type == "sale"),
            "rent": sum(1 for _, _, s in snaps if s.listing_type == "rent"),
        },
        "property_type_breakdown": dict(
            Counter(s.property_type for _, _, s in snaps).most_common()
        ),
    }
    OUT_COVERAGE_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_COVERAGE_JSON.write_text(
        json.dumps(coverage_payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )

    md_lines = [
        "# Keller Williams catalog field coverage",
        "",
        f"Listings: **{n}** (re-parsed from local cache with adapter "
        f"{coverage_payload['adapter_version']})",
        "",
        "| Field | Populated | Missing | % | Kind | Selector |",
        "|---|---:|---:|---:|---|---|",
    ]
    for row in coverage_rows:
        md_lines.append(
            f"| {row['field']} | {row['populated_count']} | {row['missing_count']} | "
            f"{row['percent_populated']} | {row['value_kind']} | "
            f"{row['extraction_source_selector']} |"
        )
    md_lines.extend(
        [
            "",
            "## Common warning counts",
            "",
        ]
    )
    for warning, count in coverage_payload["warning_counts"].items():
        md_lines.append(f"- `{warning}`: {count}")
    md_lines.extend(
        [
            "",
            "## Notes",
            "",
            "- XCG benchmark is intentionally absent in dry-run (computed at import).",
            "- Amenities are not published as a structured KW section.",
            "- Source listing dates are not present in KW detail HTML.",
            "- Neighbourhood may be inferred from title/description aliases only when "
            "dedicated location is missing or generic; inferred values keep provenance.",
            "",
        ]
    )
    OUT_COVERAGE_MD.write_text("\n".join(md_lines), encoding="utf-8")

    OUT_LOCATION.write_text(
        json.dumps(location_report, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    OUT_QUALITY.write_text(
        json.dumps(
            {
                "finding_count": len(findings),
                "by_classification": dict(
                    Counter(f["classification"] for f in findings).most_common()
                ),
                "findings": findings,
            },
            indent=2,
            ensure_ascii=False,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )

    reparsed = []
    for item, _, snap in snaps:
        reparsed.append(
            {
                "external_id": snap.external_id,
                "url": snap.source_url,
                "title": snap.title,
                "listing_type": snap.listing_type,
                "property_type": snap.property_type,
                "source_status": snap.source_status,
                "lifecycle_hint": snap.lifecycle_hint.value if snap.lifecycle_hint else None,
                "price": str(snap.original_price.amount) if snap.original_price else None,
                "currency": snap.original_price.currency if snap.original_price else None,
                "location_text": snap.location_text,
                "neighbourhood_text": snap.neighbourhood_text,
                "bedrooms": snap.bedrooms,
                "bathrooms": snap.bathrooms,
                "full_bathrooms": snap.raw_payload.get("full_bathrooms"),
                "half_bathrooms": snap.raw_payload.get("half_bathrooms"),
                "floor_area_m2": str(snap.floor_area_m2) if snap.floor_area_m2 else None,
                "lot_area_value": str(snap.lot_area_value) if snap.lot_area_value else None,
                "latitude": snap.latitude,
                "longitude": snap.longitude,
                "agent_name": snap.raw_payload.get("agent_name"),
                "image_count": len(snap.image_urls),
                "warnings": list(snap.warnings),
                "location_evidence": snap.structured_evidence.get("location_evidence"),
            }
        )
    OUT_REPARSED.write_text(
        json.dumps(
            {
                "adapter_version": coverage_payload["adapter_version"],
                "listing_count": n,
                "listings": reparsed,
            },
            indent=2,
            ensure_ascii=False,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT_COVERAGE_JSON}")
    print(f"Wrote {OUT_COVERAGE_MD}")
    print(f"Wrote {OUT_LOCATION}")
    print(f"Wrote {OUT_QUALITY}")
    print(f"Wrote {OUT_REPARSED}")
    print("coverage_sample", coverage_rows[:5])
    print("quality_classes", Counter(f["classification"] for f in findings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
