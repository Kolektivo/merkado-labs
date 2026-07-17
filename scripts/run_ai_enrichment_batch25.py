"""Gated ~25-listing RE/MAX AI enrichment batch (Labs only).

Uses gpt-4.1-mini explicitly. Prints estimate first, then runs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from merkado_labs.enrichment.jobs import (  # noqa: E402
    create_enrichment_job,
    process_enrichment_job,
)
from merkado_labs.enrichment.pricing import estimate_enrichment_cost  # noqa: E402
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)

MODEL = "gpt-4.1-mini"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--batch-size", type=int, default=3)
    parser.add_argument("--yes", action="store_true", help="Required to spend")
    args = parser.parse_args()

    estimate = estimate_enrichment_cost(model=MODEL, listing_count=args.limit)
    print(
        json.dumps(
            {
                "estimate_usd": str(estimate.estimated_usd),
                "model": MODEL,
                "listing_count": args.limit,
                "pricing_as_of": estimate.pricing_as_of,
                "notes": estimate.notes,
            },
            indent=2,
        )
    )
    if not args.yes:
        print("Pass --yes to execute after reviewing the estimate.", file=sys.stderr)
        return 2

    client = create_labs_client()
    source = resolve_property_source(client, "remax_curacao")
    # Varied mix: active sale, active rent, sold, under-contract when available
    rows = (
        client.table("property_listings")
        .select("id,external_id,title,status,source_listing_status,public_eligible")
        .eq("property_source_id", source["id"])
        .order("last_seen_at", desc=True)
        .limit(400)
        .execute()
        .data
        or []
    )
    buckets: dict[str, list[dict]] = {
        "active_sale": [],
        "active_rent": [],
        "sold": [],
        "under_contract": [],
        "other": [],
    }
    for row in rows:
        status = (row.get("status") or "").lower()
        listing_type = (row.get("external_id") or "").lower()
        src_status = (row.get("source_listing_status") or "").lower()
        if "under contract" in src_status:
            buckets["under_contract"].append(row)
        elif status == "sold":
            buckets["sold"].append(row)
        elif listing_type.startswith("hr") and status == "active":
            buckets["active_rent"].append(row)
        elif listing_type.startswith("hs") and status == "active":
            buckets["active_sale"].append(row)
        else:
            buckets["other"].append(row)

    selected: list[dict] = []
    quotas = [
        ("active_sale", 10),
        ("active_rent", 5),
        ("sold", 5),
        ("under_contract", 3),
        ("other", 2),
    ]
    for key, n in quotas:
        selected.extend(buckets[key][:n])
    # Fill remainder
    if len(selected) < args.limit:
        seen = {r["id"] for r in selected}
        for row in rows:
            if row["id"] not in seen:
                selected.append(row)
            if len(selected) >= args.limit:
                break
    selected = selected[: args.limit]
    listing_ids = [str(r["id"]) for r in selected]
    print(
        json.dumps(
            {
                "selected_count": len(selected),
                "selected": [
                    {
                        "external_id": r["external_id"],
                        "status": r["status"],
                        "source_listing_status": r.get("source_listing_status"),
                    }
                    for r in selected
                ],
            },
            indent=2,
        )
    )

    job_id = create_enrichment_job(
        client,
        scope_type="manual_selection",
        scope_filter={"batch": "gated_25", "external_ids": [r["external_id"] for r in selected]},
        listing_ids=listing_ids,
        model=MODEL,
        requested_by="gated_batch25_script",
        property_source_id=str(source["id"]),
    )
    print(json.dumps({"job_id": job_id}, indent=2))
    result = process_enrichment_job(
        job_id,
        listing_ids=listing_ids,
        batch_size=args.batch_size,
        force=args.force,
        model=MODEL,
        client=client,
    )
    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("failed", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
