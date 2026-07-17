"""Run a small Labs AI enrichment validation batch (3–5 listings)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.jobs import (  # noqa: E402
    create_enrichment_job,
    process_enrichment_job,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)

DEFAULT_IDS = ("hs3080", "hs3059", "hs2540", "hr2155", "hr1394")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--external-ids", nargs="*", default=list(DEFAULT_IDS))
    parser.add_argument(
        "--model",
        default=None,
        help="Defaults to OPENAI_ENRICHMENT_MODEL (required; no silent fallback)",
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--batch-size", type=int, default=2)
    args = parser.parse_args()

    client = create_labs_client()
    source = resolve_property_source(client, "remax_curacao")
    rows = (
        client.table("property_listings")
        .select("id,external_id,title,status,source_listing_status")
        .eq("property_source_id", source["id"])
        .in_("external_id", args.external_ids)
        .execute()
        .data
        or []
    )
    if not rows:
        raise SystemExit("No listings found for requested external ids")
    listing_ids = [str(row["id"]) for row in rows]
    print(
        json.dumps(
            {
                "selected": [
                    {
                        "external_id": row["external_id"],
                        "status": row["status"],
                        "source_listing_status": row["source_listing_status"],
                        "title": row["title"],
                    }
                    for row in rows
                ]
            },
            indent=2,
        )
    )
    job_id = create_enrichment_job(
        client,
        scope_type="manual_selection",
        scope_filter={"external_ids": args.external_ids},
        listing_ids=listing_ids,
        model=args.model,
        requested_by="validation_script",
        property_source_id=str(source["id"]),
    )
    print(json.dumps({"job_id": job_id}, indent=2))
    result = process_enrichment_job(
        job_id,
        listing_ids=listing_ids,
        batch_size=args.batch_size,
        force=args.force,
        model=args.model,
        client=client,
    )
    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("failed", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
