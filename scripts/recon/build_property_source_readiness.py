"""Phase 13 read-only property source readiness audit."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.pricing import calculate_usage_cost_usd  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"

EXPECTED = [
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
    "sothebys_curacao",
]


def _adapter_path(key: str) -> Path | None:
    mapping = {
        "keller_williams_curacao": ROOT
        / "src/merkado_labs/scrapers/adapters/keller_williams_curacao.py",
        "remax_curacao": ROOT / "src/merkado_labs/scrapers/adapters/remax_curacao.py",
        "moret_real_estate": ROOT
        / "src/merkado_labs/scrapers/adapters/moret_real_estate.py",
        "monumentenzorg_curacao": ROOT
        / "src/merkado_labs/scrapers/adapters/monumentenzorg_curacao.py",
        "sothebys_curacao": ROOT
        / "src/merkado_labs/scrapers/adapters/sothebys_curacao.py",
    }
    path = mapping.get(key)
    return path if path and path.exists() else None


def _read_adapter_version(path: Path | None) -> str | None:
    if not path:
        return None
    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines()[:80]:
        if "ADAPTER_VERSION" in line or "adapter_version" in line:
            if "=" in line:
                return line.split("=", 1)[1].strip().strip("\"'")
    return None


def _coverage(rows: list[dict], field: str) -> dict:
    present = sum(1 for r in rows if r.get(field) not in (None, "", []))
    return {
        "present": present,
        "total": len(rows),
        "pct": round(100 * present / max(len(rows), 1), 1),
    }


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    now = datetime.now(UTC).isoformat()

    sources = (
        client.table("property_sources")
        .select("id,source_key,display_name,created_at")
        .execute()
    ).data or []
    by_key = {s["source_key"]: s for s in sources}

    reports = []
    for key in EXPECTED:
        src = by_key.get(key)
        adapter = _adapter_path(key)
        adapter_version = _read_adapter_version(adapter)
        listings = []
        if src:
            listings = (
                client.table("property_listings")
                .select(
                    "id,external_id,public_eligible,enrichment_status,description,"
                    "original_price,original_currency,benchmark_price_xcg,"
                    "source_neighbourhood_text,location,latitude,longitude,"
                    "neighbourhood_id,property_type,bedrooms,bathrooms"
                )
                .eq("property_source_id", src["id"])
                .execute()
            ).data or []

        proposals = []
        if listings:
            proposals = (
                client.table("ai_enrichment_proposals")
                .select("id,property_listing_id,status,model,token_usage")
                .in_("property_listing_id", [r["id"] for r in listings])
                .execute()
            ).data or []

        terra_costs = [
            float(
                calculate_usage_cost_usd(
                    model=str(p.get("model")),
                    input_tokens=int((p.get("token_usage") or {}).get("input_tokens") or 0),
                    cached_input_tokens=int(
                        (p.get("token_usage") or {}).get("cached_input_tokens") or 0
                    ),
                    output_tokens=int((p.get("token_usage") or {}).get("output_tokens") or 0),
                )[0]
                or 0
            )
            for p in proposals
            if p.get("model") == "gpt-5.6-terra" and p.get("token_usage")
        ]

        # Runs
        runs = []
        if src:
            runs = (
                client.table("property_source_runs")
                .select(
                    "id,outcome,adapter_version,started_at,completed_at,"
                    "discovered_count,parsed_count,imported_count,notes"
                )
                .eq("property_source_id", src["id"])
                .order("started_at", desc=True)
                .limit(5)
                .execute()
            ).data or []

        # Evidence presence via observations count
        obs_count = 0
        if listings:
            obs = (
                client.table("listing_observations")
                .select("id", count="exact", head=True)
                .in_("property_listing_id", [r["id"] for r in listings[:200]])
                .execute()
            )
            obs_count = obs.count or 0

        blocked_reason = None
        catalog_completeness = "unknown"
        safest_next = None
        known_gaps = []

        if key == "keller_williams_curacao":
            catalog_completeness = "activated_manual_full_catalog_84"
            safest_next = (
                "Keep KW Ready and manual/unscheduled; Refresh & enrich = new/changed only"
            )
            known_gaps = ["Manual only; not scheduled", "Live-crawl pagination still incomplete"]
        elif key == "remax_curacao":
            catalog_completeness = (
                "complete_manual_adapter_220"
                if len(listings) >= 220
                else f"labs_rows_{len(listings)}"
            )
            safest_next = (
                "Keep RE/MAX Ready and manual/unscheduled; Refresh & enrich = new/changed only"
            )
            known_gaps = [
                "Coordinates 199/220 (21 still missing)",
                "Historical gpt-4.1-mini v1 proposals not comparable to Terra v3",
            ]
        elif key == "moret_real_estate":
            catalog_completeness = "complete_activated_71"
            safest_next = (
                "Keep Moret Ready and manual/unscheduled; Refresh & enrich = new/changed only"
            )
            known_gaps = [
                "Terra-v3 initial backfill complete (71/71)",
                "Manual/unscheduled only",
            ]
        elif key == "monumentenzorg_curacao":
            catalog_completeness = "complete_activated_5"
            safest_next = (
                "Keep Monumentenzorg Ready and manual/unscheduled; "
                "Refresh & enrich = new/changed only"
            )
            known_gaps = [
                "Coordinates 0/5 (source has none)",
                "Public eligible 2/5 (sold + missing_price exclusions)",
                "Manual/unscheduled only",
            ]
        elif key == "sothebys_curacao":
            blocked_reason = (
                "BLOCKED 2026-07-20: affiliate TLS broken; network HTTP 202 WAF; "
                "app.sir.com office shell has no catalog. Official feed/API required."
            )
            catalog_completeness = "access_route_under_investigation"
            safest_next = (
                "Official affiliate feed/export or Anywhere partner API with written "
                "approval (no WAF bypass)"
            )
            known_gaps = [
                "Not Ready / BLOCKED",
                "No imported listings",
                "No approved automated access route",
            ]

        if not adapter:
            known_gaps.append("Adapter file not found in repository")
        if not src:
            known_gaps.append("Source row missing in Labs")

        reports.append(
            {
                "source_key": key,
                "display_name": (src or {}).get("display_name"),
                "adapter_path": str(adapter.relative_to(ROOT)).replace("\\", "/")
                if adapter
                else None,
                "adapter_version": adapter_version,
                "catalog_completeness": catalog_completeness,
                "current_listing_count": len(listings),
                "public_eligible_count": sum(
                    1 for r in listings if r.get("public_eligible")
                ),
                "raw_evidence_observation_sample_count": obs_count,
                "description_coverage": _coverage(listings, "description"),
                "price_currency_coverage": {
                    "original_price": _coverage(listings, "original_price"),
                    "original_currency": _coverage(listings, "original_currency"),
                },
                "xcg_benchmark_coverage": _coverage(listings, "benchmark_price_xcg"),
                "location_coverage": {
                    "location": _coverage(listings, "location"),
                    "source_neighbourhood_text": _coverage(
                        listings, "source_neighbourhood_text"
                    ),
                },
                "coordinate_coverage": {
                    "latitude": _coverage(listings, "latitude"),
                    "longitude": _coverage(listings, "longitude"),
                },
                "neighbourhood_coverage": _coverage(listings, "neighbourhood_id"),
                "scraper_run_outcomes": dict(
                    Counter(r.get("outcome") for r in runs)
                ),
                "recent_runs": [
                    {
                        "id": r.get("id"),
                        "outcome": r.get("outcome"),
                        "adapter_version": r.get("adapter_version"),
                        "started_at": r.get("started_at"),
                        "discovered_count": r.get("discovered_count"),
                        "imported_count": r.get("imported_count"),
                    }
                    for r in runs[:3]
                ],
                "ai_proposal_count": len(proposals),
                "ai_status_counts": dict(Counter(p.get("status") for p in proposals)),
                "ai_model_counts": dict(Counter(p.get("model") for p in proposals)),
                "average_terra_cost_usd": round(
                    sum(terra_costs) / len(terra_costs), 4
                )
                if terra_costs
                else None,
                "known_parser_gaps": known_gaps,
                "blocked_reason": blocked_reason,
                "safest_next_task": safest_next,
            }
        )

    recommendation = {
        "recommended_track": "property_labs_ready_with_sothebys_blocked",
        "rationale": (
            "KW, RE/MAX, Moret, and Monumentenzorg are Ready with complete Terra-v3 "
            "coverage and remain manual/unscheduled. Sotheby's access route is BLOCKED "
            "pending an official feed/export or partner API. A blocked source is a "
            "valid final state — do not attempt WAF bypass or browser automation."
        ),
        "do_not_begin": [
            "sothebys_waf_bypass",
            "sothebys_browser_automation",
            "scheduled_ingestion",
            "production_deploy",
            "automatic_property_asset_merge",
        ],
    }

    payload = {
        "generated_at": now,
        "project_ref": ref,
        "read_only": True,
        "sources": reports,
        "recommendation": recommendation,
    }
    (PROCESSED / "property_source_readiness.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )

    lines = [
        "# Property source readiness",
        "",
        f"Generated: {now}",
        "",
        "Read-only audit. No scrapes, imports, or AI calls.",
        "",
        f"**Recommended next track:** `{recommendation['recommended_track']}`",
        "",
        recommendation["rationale"],
        "",
        "| Source | Listings | Public | AI proposals | Catalog | Blocked |",
        "|---|---:|---:|---:|---|---|",
    ]
    for r in reports:
        lines.append(
            f"| {r['source_key']} | {r['current_listing_count']} | "
            f"{r['public_eligible_count']} | {r['ai_proposal_count']} | "
            f"{r['catalog_completeness']} | {r['blocked_reason'] or '—'} |"
        )
    lines.extend(["", "## Per-source safest next task", ""])
    for r in reports:
        lines.append(f"- **{r['source_key']}**: {r['safest_next_task']}")
    (PROCESSED / "property_source_readiness.md").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )
    print(json.dumps({"sources": len(reports), "recommendation": recommendation}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
