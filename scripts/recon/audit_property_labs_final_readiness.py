"""Final Property Labs readiness audit (read-only).

Writes timestamped reports under data/processed/ (gitignored).
No scrapes, imports, AI, migrations, schedules, or production access.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.pipeline.readiness import (  # noqa: E402
    SOURCE_READINESS,
    ready_source_keys,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
EXPECTED_KEYS = [
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
    "sothebys_curacao",
]
BASELINES = {
    "keller_williams_curacao": {
        "listings": 84,
        "public": 81,
        "terra": 84,
        "coords": None,
        "readiness": "ready",
    },
    "remax_curacao": {
        "listings": 220,
        "public": 119,
        "terra": 220,
        "coords": 199,
        "readiness": "ready",
    },
    "moret_real_estate": {
        "listings": 71,
        "public": 71,
        "terra": 71,
        "coords": 71,
        "readiness": "ready",
    },
    "monumentenzorg_curacao": {
        "listings": 5,
        "public": 2,
        "terra": 5,
        "coords": 0,
        "readiness": "ready",
    },
    "sothebys_curacao": {
        "listings": 0,
        "public": 0,
        "terra": 0,
        "coords": 0,
        "readiness": "blocked",
    },
}
EXPECTED_PUBLIC_TOTAL = 273


def _status_counts(rows: list[dict]) -> dict[str, int]:
    return dict(Counter(str(r.get("status") or "unknown") for r in rows))


def _latest_terra_v3(client, listing_ids: list[str]) -> int:
    if not listing_ids:
        return 0
    count = 0
    for start in range(0, len(listing_ids), 80):
        chunk = listing_ids[start : start + 80]
        props = (
            client.table("ai_enrichment_proposals")
            .select("property_listing_id,model,prompt_version,created_at")
            .in_("property_listing_id", chunk)
            .order("created_at", desc=True)
            .execute()
        ).data or []
        seen: set[str] = set()
        for p in props:
            lid = str(p.get("property_listing_id"))
            if lid in seen:
                continue
            seen.add(lid)
            if p.get("model") == "gpt-5.6-terra" and "v3" in str(
                p.get("prompt_version") or ""
            ):
                count += 1
    return count


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_dir = PROCESSED / f"property_labs_final_readiness_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = (
        client.table("property_sources")
        .select(
            "id,source_key,display_name,enabled,adapter_status,removal_threshold"
        )
        .execute()
    ).data or []
    by_key = {s["source_key"]: s for s in sources}
    chh_keys = [
        s["source_key"]
        for s in sources
        if "chh" in s["source_key"].lower()
        or "caribbean" in s["source_key"].lower()
        or "caribbean" in str(s.get("display_name") or "").lower()
    ]

    public_total = (
        client.table("public_property_listings")
        .select("id", count="exact", head=True)
        .execute()
    ).count or 0

    assets = (
        client.table("property_assets").select("id", count="exact", head=True).execute()
    ).count or 0
    linked = (
        client.table("property_listings")
        .select("id", count="exact", head=True)
        .not_.is_("property_asset_id", "null")
        .execute()
    ).count or 0

    source_reports = []
    discrepancies: list[str] = []
    for key in EXPECTED_KEYS:
        src = by_key.get(key)
        readiness = SOURCE_READINESS[key]
        baseline = BASELINES[key]
        listings: list[dict] = []
        runs: list[dict] = []
        if src:
            listings = (
                client.table("property_listings")
                .select(
                    "id,external_id,status,public_eligible,public_exclusion_reason,"
                    "original_price,source_url,latitude,longitude,last_seen_at,"
                    "property_asset_id"
                )
                .eq("property_source_id", src["id"])
                .execute()
            ).data or []
            runs = (
                client.table("property_source_runs")
                .select(
                    "id,outcome,adapter_version,started_at,completed_at,"
                    "discovered_count,parsed_count,imported_count,metadata,notes"
                )
                .eq("property_source_id", src["id"])
                .order("started_at", desc=True)
                .limit(3)
                .execute()
            ).data or []

        ids = [str(r["id"]) for r in listings]
        terra = _latest_terra_v3(client, ids)
        coords = sum(
            1 for r in listings if r.get("latitude") is not None and r.get("longitude") is not None
        )
        public_n = sum(1 for r in listings if r.get("public_eligible") is True)
        no_price = sum(
            1
            for r in listings
            if r.get("original_price") is None or float(r.get("original_price") or 0) <= 0
        )
        missing_urls = sum(
            1 for r in listings if not (r.get("source_url") or "").strip()
        )
        ext_ids = [r.get("external_id") for r in listings]
        dup_ext = len(ext_ids) - len(set(ext_ids))
        urls = [r.get("source_url") for r in listings if r.get("source_url")]
        dup_urls = len(urls) - len(set(urls))

        latest = runs[0] if runs else None
        meta = (latest or {}).get("metadata") or {}
        report = {
            "source_key": key,
            "present_in_db": bool(src),
            "enabled": (src or {}).get("enabled"),
            "adapter_status": (src or {}).get("adapter_status"),
            "removal_threshold": (src or {}).get("removal_threshold"),
            "readiness_config": readiness.readiness,
            "adapter_version_config": readiness.adapter_version,
            "allows_full_refresh": readiness.allows_full_refresh,
            "listing_count": len(listings),
            "status_counts": _status_counts(listings),
            "public_eligible_count": public_n,
            "no_price_count": no_price,
            "coordinate_count": coords,
            "terra_v3_latest_count": terra,
            "missing_source_url_count": missing_urls,
            "duplicate_external_ids": dup_ext,
            "duplicate_source_urls": dup_urls,
            "linked_property_assets": sum(
                1 for r in listings if r.get("property_asset_id")
            ),
            "latest_run": {
                "outcome": (latest or {}).get("outcome"),
                "adapter_version": (latest or {}).get("adapter_version"),
                "discovered_count": (latest or {}).get("discovered_count"),
                "parsed_count": (latest or {}).get("parsed_count"),
                "complete_catalog": meta.get("complete_catalog"),
                "max_items": meta.get("max_items"),
                "max_pages": meta.get("max_pages"),
                "truncated": meta.get("truncated"),
                "bounded": meta.get("bounded"),
                "started_at": (latest or {}).get("started_at"),
                "notes": ((latest or {}).get("notes") or "")[:160],
            }
            if latest
            else None,
            "baseline": baseline,
            "matches_baseline": (
                len(listings) == baseline["listings"]
                and public_n == baseline["public"]
                and terra == baseline["terra"]
                and (baseline["coords"] is None or coords == baseline["coords"])
                and readiness.readiness == baseline["readiness"]
            ),
        }
        if key == "monumentenzorg_curacao":
            report["exclusions"] = [
                {
                    "external_id": r.get("external_id"),
                    "status": r.get("status"),
                    "public_eligible": r.get("public_eligible"),
                    "public_exclusion_reason": r.get("public_exclusion_reason"),
                    "original_price": r.get("original_price"),
                }
                for r in listings
                if r.get("public_eligible") is not True
            ]
        if not report["matches_baseline"]:
            discrepancies.append(
                f"{key}: actual listings={len(listings)} public={public_n} "
                f"terra={terra} coords={coords} readiness={readiness.readiness}; "
                f"expected {baseline}"
            )
        source_reports.append(report)

    obs_count = (
        client.table("listing_observations")
        .select("id", count="exact", head=True)
        .execute()
    ).count or 0

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "read_only": True,
        "forbidden_project_absent": True,
        "expected_public_browse_total": EXPECTED_PUBLIC_TOTAL,
        "actual_public_browse_total": public_total,
        "public_browse_matches": public_total == EXPECTED_PUBLIC_TOTAL,
        "ready_source_keys": ready_source_keys(),
        "chh_source_keys": chh_keys,
        "chh_absent": len(chh_keys) == 0,
        "property_assets_count": assets,
        "listings_linked_to_property_assets": linked,
        "no_automatic_asset_merge": linked == 0,
        "listing_observations_count": obs_count,
        "sources": source_reports,
        "discrepancies": discrepancies,
        "verdict": (
            "READY_WITH_SOTHEBYS_BLOCKED"
            if not discrepancies
            and public_total == EXPECTED_PUBLIC_TOTAL
            and len(chh_keys) == 0
            and linked == 0
            else "NEEDS_REVIEW"
        ),
    }

    (out_dir / "SUMMARY.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )

    lines = [
        "# Property Labs final readiness audit",
        "",
        f"Generated: {payload['generated_at']}",
        f"Project: `{ref}`",
        "Mode: read-only (no scrapes, imports, AI, migrations, schedules)",
        "",
        f"**Verdict:** `{payload['verdict']}`",
        "",
        f"- Public Browse total: **{public_total}** (expected {EXPECTED_PUBLIC_TOTAL})",
        f"- CHH absent: **{payload['chh_absent']}**",
        f"- Listings linked to property_assets: **{linked}** (assets table rows: {assets})",
        f"- Ready source keys: `{', '.join(ready_source_keys())}`",
        "",
        "| Source | Listings | Public | Terra-v3 | Coords | Readiness | Baseline |",
        "|---|---:|---:|---:|---:|---|---|",
    ]
    for r in source_reports:
        lines.append(
            f"| {r['source_key']} | {r['listing_count']} | "
            f"{r['public_eligible_count']} | {r['terra_v3_latest_count']} | "
            f"{r['coordinate_count']} | {r['readiness_config']} | "
            f"{'OK' if r['matches_baseline'] else 'DRIFT'} |"
        )
    if discrepancies:
        lines.extend(["", "## Discrepancies", ""])
        for d in discrepancies:
            lines.append(f"- {d}")
    else:
        lines.extend(["", "No inventory discrepancies versus expected baselines.", ""])
    lines.extend(
        [
            "## Safety notes",
            "",
            "- All Ready sources remain manual/unscheduled.",
            "- Sotheby's remains BLOCKED / fail-closed; official feed/API required.",
            "- Do not run WAF bypass, browser automation, or production operations.",
            "",
        ]
    )
    (out_dir / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    # Stable pointer for local convenience (also gitignored)
    (PROCESSED / "property_labs_final_readiness_latest.json").write_text(
        json.dumps(
            {"report_dir": str(out_dir.relative_to(ROOT)).replace("\\", "/"), **payload},
            indent=2,
            ensure_ascii=False,
            default=str,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "verdict": payload["verdict"],
                "public_browse": public_total,
                "report_dir": str(out_dir.relative_to(ROOT)).replace("\\", "/"),
                "discrepancies": discrepancies,
            },
            indent=2,
        )
    )
    return 0 if payload["verdict"] == "READY_WITH_SOTHEBYS_BLOCKED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
