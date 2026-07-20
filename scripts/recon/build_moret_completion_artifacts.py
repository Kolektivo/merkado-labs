"""Build Moret completion artifacts from the verified local catalog (no writes, no OpenAI)."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.pricing import (  # noqa: E402
    DEFAULT_INPUT_TOKENS_PER_LISTING,
    DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    estimate_enrichment_cost,
)
from merkado_labs.normalization.currency import (  # noqa: E402
    ManualEurRateProvider,
    to_benchmark_xcg,
)
from merkado_labs.normalization.eligibility import evaluate_public_eligibility  # noqa: E402
from merkado_labs.scrapers.adapters.moret_real_estate import ADAPTER_VERSION  # noqa: E402
from merkado_labs.scrapers.contracts import MoneyAmount as MoneyAmountContract  # noqa: E402

CATALOG = ROOT / "data/processed/moret_complete_catalog.json"
PREFLIGHT = ROOT / "data/processed/moret_completion_preflight.json"
OUT = ROOT / "data/processed"


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _dump(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")


def _md(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def reconcile(catalog: dict[str, Any], preflight: dict[str, Any]) -> dict[str, Any]:
    by_id = {row["external_id"]: row for row in catalog["listings"]}
    rows = []
    for existing in preflight["listings"]:
        ext = existing["external_id"]
        prop = by_id.get(ext)
        if not prop:
            rows.append(
                {
                    "external_id": ext,
                    "classification": "requires_attention",
                    "reason": "missing_from_complete_catalog",
                    "current": existing,
                }
            )
            continue
        same_url = prop["source_url"] == existing["source_url"]
        price_same = (
            str(existing.get("original_price") or "").rstrip("0").rstrip(".")
            == str(prop.get("original_price") or "").rstrip("0").rstrip(".")
            and existing.get("original_currency") == prop.get("original_currency")
        )
        title_same = (existing.get("title") or "").replace("–", "-") == (
            prop.get("title") or ""
        ).replace("–", "-").replace("&#8211;", "-")
        conflicts = []
        if not same_url:
            conflicts.append("source_url")
        # listing_type correction is expected for misclassified sample rows
        type_changed = existing.get("listing_type") != prop.get("listing_type")
        neighbourhood_changed = (existing.get("source_neighbourhood_text") or "") != (
            prop.get("neighbourhood_text") or ""
        )
        if type_changed:
            conflicts.append("listing_type")
        if not price_same:
            conflicts.append("price")
        if not title_same:
            conflicts.append("title")
        if neighbourhood_changed:
            conflicts.append("neighbourhood_text")
        if existing.get("source_description_checksum") != prop.get("description_checksum"):
            conflicts.append("description_checksum")

        if not conflicts and same_url and price_same and title_same:
            classification = "unchanged"
        elif ext.startswith("post-") and same_url:
            classification = "safe_update"
        else:
            classification = "requires_attention"

        rows.append(
            {
                "external_id": ext,
                "classification": classification,
                "same_external_id": True,
                "same_canonical_url": same_url,
                "current_title": existing.get("title"),
                "proposed_title": prop.get("title"),
                "current_price": existing.get("original_price"),
                "proposed_price": prop.get("original_price"),
                "current_currency": existing.get("original_currency"),
                "proposed_currency": prop.get("original_currency"),
                "current_status": existing.get("status"),
                "proposed_status": prop.get("source_status"),
                "current_listing_type": existing.get("listing_type"),
                "proposed_listing_type": prop.get("listing_type"),
                "current_description_checksum": existing.get("source_description_checksum"),
                "proposed_description_checksum": prop.get("description_checksum"),
                "current_neighbourhood": existing.get("source_neighbourhood_text"),
                "proposed_neighbourhood": prop.get("neighbourhood_text"),
                "current_coordinates": {
                    "lat": existing.get("latitude"),
                    "lng": existing.get("longitude"),
                },
                "proposed_coordinates": {
                    "lat": prop.get("latitude"),
                    "lng": prop.get("longitude"),
                },
                "protected_field_conflicts": [
                    f
                    for f in ("external_id", "source_url")
                    if f == "source_url" and not same_url
                ],
                "changed_fields": conflicts,
            }
        )

    existing_ids = {r["external_id"] for r in preflight["listings"]}
    inserts = [
        {
            "external_id": item["external_id"],
            "classification": "new_insert",
            "source_url": item["source_url"],
            "title": item["title"],
            "listing_type": item["listing_type"],
            "original_price": item["original_price"],
            "original_currency": item["original_currency"],
        }
        for item in catalog["listings"]
        if item["external_id"] not in existing_ids
    ]
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "adapter_version": ADAPTER_VERSION,
        "catalog_checksum": catalog.get("catalog_checksum"),
        "existing_rows": rows,
        "new_inserts": inserts,
        "summary": {
            "existing": len(rows),
            "unchanged": sum(1 for r in rows if r["classification"] == "unchanged"),
            "safe_update": sum(1 for r in rows if r["classification"] == "safe_update"),
            "requires_attention": sum(
                1 for r in rows if r["classification"] == "requires_attention"
            ),
            "identity_conflict": sum(
                1 for r in rows if r["classification"] == "identity_conflict"
            ),
            "new_insert": len(inserts),
        },
        "notes": [
            "First complete catalog establishes the baseline; do not treat the prior "
            "five-listing sample as evidence that other listings were previously absent.",
            "No Labs writes performed.",
        ],
    }


def import_preflight(catalog: dict[str, Any], recon: dict[str, Any]) -> dict[str, Any]:
    listings = catalog["listings"]
    eligible = 0
    for item in listings:
        status = item.get("lifecycle_hint") or item.get("source_status") or "unknown"
        ok, reason = evaluate_public_eligibility(
            status="active" if status in {"active", "under_contract", "reserved"} else status,
            original_price=Decimal(item["original_price"]) if item.get("original_price") else None,
            source_enabled=True,
            source_url=item.get("source_url"),
            has_critical_parser_error=bool(item.get("parser_errors")),
            source_adapter_status="manual",
            has_source_attribution=True,
        )
        item["_public_ok"] = ok
        item["_public_reason"] = reason
        if ok:
            eligible += 1

    eur_provider = ManualEurRateProvider(
        rate=Decimal("2.00"),
        provider_id="manual_preflight_placeholder",
        notes="Placeholder for local preflight only; live import uses ECB path",
    )
    fx_examples = []
    for item in listings:
        if item.get("original_currency") in {"EUR", "USD", "XCG", "ANG"} and item.get(
            "original_price"
        ):
            money = MoneyAmountContract(
                amount=Decimal(item["original_price"]),
                currency=item["original_currency"],
            )
            bench = to_benchmark_xcg(money, eur_provider=eur_provider)
            fx_examples.append(
                {
                    "external_id": item["external_id"],
                    "currency": item["original_currency"],
                    "method": bench.conversion_method.value if bench.conversion_method else None,
                    "amount_xcg": str(bench.amount_xcg) if bench.amount_xcg is not None else None,
                    "pending": bench.pending,
                }
            )
            if len(fx_examples) >= 8:
                break

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "adapter_version": ADAPTER_VERSION,
        "complete_catalog": catalog.get("complete_catalog"),
        "catalog_checksum": catalog.get("catalog_checksum"),
        "projected": {
            "inserts": recon["summary"]["new_insert"],
            "updates": recon["summary"]["safe_update"],
            "unchanged": recon["summary"]["unchanged"],
            "requires_attention": recon["summary"]["requires_attention"],
            "no_price_public_exclusions": sum(1 for i in listings if not i.get("original_price")),
            "active_public_eligible": eligible,
            "sold_rented_inactive": sum(
                1 for i in listings if i.get("source_status") in {"sold", "rented", "inactive"}
            ),
            "observations": len(listings),
            "price_events_upper_bound": recon["summary"]["safe_update"]
            + recon["summary"]["new_insert"],
            "benchmark_conversions": len(listings),
            "geospatial_assignments": sum(1 for i in listings if i.get("latitude") is not None),
            "potential_missing_events": 0,
            "potential_removed_events": 0,
        },
        "fx_examples": fx_examples,
        "stop_if_unexpected_removals": False,
        "notes": [
            "Absence/removal transitions are not proposed against the prior bounded sample.",
            "First complete catalog establishes the complete baseline.",
            "No database writes performed.",
        ],
    }


def lifecycle_preview(catalog: dict[str, Any]) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "complete_catalog": catalog.get("complete_catalog"),
        "source_status_counts": dict(Counter(i.get("source_status") for i in catalog["listings"])),
        "lifecycle_counts": dict(Counter(i.get("lifecycle_hint") for i in catalog["listings"])),
        "absence_transitions_allowed": bool(catalog.get("complete_catalog")),
        "proposed_missing_events": 0,
        "proposed_removed_events": 0,
        "notes": [
            "No missing/removed events vs prior bounded sample.",
            "All 71 archive listings currently parse as source_status=active.",
        ],
    }


def terra_artifacts(
    catalog: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    listings = catalog["listings"]
    eligible = []
    excluded = []
    lengths = []
    for item in listings:
        desc_len = int(item.get("description_length") or 0)
        lengths.append(desc_len)
        enough = desc_len >= 80 and bool(item.get("title"))
        checksum = item.get("description_checksum") or hashlib.sha256(
            (item.get("title") or "").encode()
        ).hexdigest()
        row = {
            "external_id": item["external_id"],
            "title": item["title"],
            "listing_type": item["listing_type"],
            "description_length": desc_len,
            "neighbourhood_text": item.get("neighbourhood_text"),
            "location_text": item.get("location_text"),
            "property_type": item.get("property_type"),
            "from_price": item.get("from_price"),
            "semantic_checksum": checksum,
            "estimated_input_tokens": max(800, desc_len // 4 + 600),
        }
        if enough and item.get("original_price"):
            eligible.append(row)
        else:
            excluded.append({**row, "reason": "insufficient_description_or_price"})

    # Canary selection — unique external IDs, role predicates in priority order
    selectors = [
        (
            "rich_sale",
            lambda r: r["listing_type"] == "sale"
            and not r.get("from_price")
            and r["description_length"] > 800,
        ),
        (
            "rental",
            lambda r: r["listing_type"] == "rent" and r["description_length"] > 400,
        ),
        (
            "generic_weak_location",
            lambda r: r["listing_type"] == "sale"
            and (not r.get("property_type") or len(r.get("location_text") or "") < 20),
        ),
        ("from_price_or_unusual", lambda r: bool(r.get("from_price"))),
        ("sparse_or_difficult", lambda r: r["description_length"] < 350),
    ]
    unique_canaries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for role, pred in selectors:
        chosen = None
        for row in eligible:
            if row["external_id"] in seen:
                continue
            if pred(row):
                chosen = row
                break
        if chosen is None:
            for row in eligible:
                if row["external_id"] not in seen:
                    chosen = row
                    break
        if chosen is None:
            continue
        seen.add(chosen["external_id"])
        unique_canaries.append({"role": role, **chosen})

    model = "gpt-5.6-terra"
    canary_input = sum(c["estimated_input_tokens"] for c in unique_canaries)
    canary_cost = estimate_enrichment_cost(
        model=model,
        listing_count=5,
        input_tokens_per_listing=max(1, canary_input // 5),
        output_tokens_per_listing=DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    )
    full_input = sum(r["estimated_input_tokens"] for r in eligible)
    full_cost = estimate_enrichment_cost(
        model=model,
        listing_count=len(eligible),
        input_tokens_per_listing=max(1, full_input // max(len(eligible), 1)),
        output_tokens_per_listing=DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    )
    ceiling = max(
        (canary_cost.estimated_usd * Decimal("1.35")).quantize(Decimal("0.01")),
        Decimal("0.25"),
    )

    audit = {
        "generated_at": datetime.now(UTC).isoformat(),
        "adapter_version": ADAPTER_VERSION,
        "eligible_for_enrichment": len(eligible),
        "excluded_insufficient_input": len(excluded),
        "description_length": {
            "min": min(lengths) if lengths else 0,
            "max": max(lengths) if lengths else 0,
            "avg": round(sum(lengths) / len(lengths), 1) if lengths else 0,
        },
        "neighbourhood_inputs_present": sum(1 for r in eligible if r.get("neighbourhood_text")),
        "likely_attention_categories": [
            "from_price_projects",
            "weak_neighbourhood_text",
            "bilingual_alias_context",
        ],
        "eligible_sample": eligible[:10],
        "excluded_sample": excluded[:10],
    }
    canary = {
        "generated_at": datetime.now(UTC).isoformat(),
        "count": len(unique_canaries),
        "canaries": unique_canaries,
        "selection_rule": "Exactly five representative listings for Terra-v3 canary",
    }
    cost = {
        "generated_at": datetime.now(UTC).isoformat(),
        "model": model,
        "openai_called": False,
        "canary": {
            "listings": 5,
            "estimated_input_tokens": canary_input,
            "estimated_output_tokens": 5 * DEFAULT_OUTPUT_TOKENS_PER_LISTING,
            "estimated_usd": str(canary_cost.estimated_usd),
            "recommended_ceiling_usd": str(ceiling),
        },
        "full_backfill_indicative": {
            "listings": len(eligible),
            "estimated_input_tokens": full_input,
            "estimated_output_tokens": len(eligible) * DEFAULT_OUTPUT_TOKENS_PER_LISTING,
            "estimated_usd": str(full_cost.estimated_usd),
        },
        "pricing_defaults": {
            "default_input_tokens_per_listing": DEFAULT_INPUT_TOKENS_PER_LISTING,
            "default_output_tokens_per_listing": DEFAULT_OUTPUT_TOKENS_PER_LISTING,
        },
        "notes": [
            "No OpenAI calls were made.",
            "Recommend bounded five-listing Terra canary before any backfill.",
        ],
    }
    return audit, canary, cost


def parser_findings(catalog: dict[str, Any]) -> dict[str, Any]:
    listings = catalog["listings"]
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "adapter_version": ADAPTER_VERSION,
        "complete_catalog": catalog.get("complete_catalog"),
        "findings": [
            {
                "id": "dutch_index_is_authoritative",
                "severity": "info",
                "detail": (
                    "Canonical catalog is Dutch /properties/ pagination (71). "
                    "estate_property-sitemap.xml lists ~190 URL paths including English "
                    "WPML mirrors with distinct post IDs; those are aliases, not extra listings."
                ),
            },
            {
                "id": "category_filter_counts_inflated",
                "severity": "info",
                "detail": (
                    "Search dropdown shows Huren(98)+Kopen(69); bilingual WPML posts inflate "
                    "taxonomy counts relative to the Dutch archive."
                ),
            },
            {
                "id": "euro_word_prices",
                "severity": "fixed",
                "detail": "price_area may contain '635.000 euro' amount-then-currency forms.",
            },
            {
                "id": "no_sold_rented_in_active_archive",
                "severity": "info",
                "detail": "All 71 archive listings currently parse as active.",
            },
            {
                "id": "prior_sample_listing_type_errors",
                "severity": "import_impact",
                "detail": (
                    "Bounded Labs sample misclassified some sale listings as rent via "
                    "low-price heuristic; v0.2.0 uses category evidence instead."
                ),
            },
        ],
        "warning_counts": dict(
            Counter(w for item in listings for w in item.get("warnings") or [])
        ),
        "parser_error_counts": dict(
            Counter(e for item in listings for e in item.get("parser_errors") or [])
        ),
    }


def main() -> int:
    catalog = _load(CATALOG)
    preflight = _load(PREFLIGHT)
    recon = reconcile(catalog, preflight)
    _dump(OUT / "moret_import_reconciliation.json", recon)
    _md(
        OUT / "moret_import_reconciliation.md",
        [
            "# Moret import reconciliation",
            "",
            f"- Generated: `{recon['generated_at']}`",
            f"- Existing rows: `{recon['summary']['existing']}`",
            f"- Safe updates: `{recon['summary']['safe_update']}`",
            f"- Unchanged: `{recon['summary']['unchanged']}`",
            f"- Requires attention: `{recon['summary']['requires_attention']}`",
            f"- New inserts: `{recon['summary']['new_insert']}`",
            "",
            "Prior five-listing sample is not used as an absence baseline.",
        ],
    )

    preview = import_preflight(catalog, recon)
    _dump(OUT / "moret_import_preflight.json", preview)
    _md(
        OUT / "moret_import_preflight.md",
        [
            "# Moret import preflight",
            "",
            f"- Inserts: `{preview['projected']['inserts']}`",
            f"- Updates: `{preview['projected']['updates']}`",
            f"- Public-eligible: `{preview['projected']['active_public_eligible']}`",
            f"- Missing events: `{preview['projected']['potential_missing_events']}`",
            f"- Removed events: `{preview['projected']['potential_removed_events']}`",
            "",
            "No database writes performed.",
        ],
    )
    life = lifecycle_preview(catalog)
    _dump(OUT / "moret_lifecycle_preview.json", life)

    findings = parser_findings(catalog)
    _dump(OUT / "moret_parser_findings.json", findings)
    _md(
        OUT / "moret_parser_findings.md",
        ["# Moret parser findings", ""]
        + [f"- **{f['id']}** ({f['severity']}): {f['detail']}" for f in findings["findings"]],
    )

    # Refresh field coverage markdown from catalog
    cov = _load(OUT / "moret_field_coverage.json")
    _md(
        OUT / "moret_field_coverage.md",
        ["# Moret field coverage", ""]
        + [
            f"- {k}: {v['count']}/{v['of']} ({v['pct']}%)"
            for k, v in (cov.get("coverage") or {}).items()
        ]
        + [
            "",
            f"- priced: {cov.get('priced')}",
            f"- no_price: {cov.get('no_price')}",
            f"- public_eligible_projected: {cov.get('public_eligible_projected')}",
        ],
    )

    audit, canary, cost = terra_artifacts(catalog)
    _dump(OUT / "moret_terra_input_audit.json", audit)
    _dump(OUT / "moret_terra_canary_selection.json", canary)
    _dump(OUT / "moret_terra_cost_preflight.json", cost)
    _md(
        OUT / "moret_terra_cost_preflight.md",
        [
            "# Moret Terra cost preflight",
            "",
            "- OpenAI called: `false`",
            f"- Model: `{cost['model']}`",
            "- Canary listings: `5`",
            f"- Canary estimated USD: `{cost['canary']['estimated_usd']}`",
            (
                "- Recommended canary ceiling USD: "
                f"`{cost['canary']['recommended_ceiling_usd']}`"
            ),
            (
                "- Full backfill indicative USD: "
                f"`{cost['full_backfill_indicative']['estimated_usd']}`"
            ),
            "",
            "Do not run Terra until a separately approved canary command is executed.",
        ],
    )

    # Refresh access audit markdown note about sitemap bilingualism
    access_path = OUT / "moret_source_access_audit.json"
    if access_path.exists():
        access = _load(access_path)
        access["sitemap_property_urls_observed"] = 190
        access["dutch_index_unique_urls"] = catalog["discovered_count"]
        access["bilingual_note"] = (
            "estate_property-sitemap.xml includes English WPML slug mirrors with "
            "distinct post IDs; Dutch /properties/ archive is the import catalog."
        )
        _dump(access_path, access)

    print(
        json.dumps(
            {
                "recon": recon["summary"],
                "import_preview": preview["projected"],
                "terra_canary_ceiling_usd": cost["canary"]["recommended_ceiling_usd"],
                "public_eligible": preview["projected"]["active_public_eligible"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
