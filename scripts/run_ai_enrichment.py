"""CLI: process an ai_enrichment_jobs row by job id.

Usage:
  python scripts/run_ai_enrichment.py --job-id UUID [--force] [--batch-size N]

Loads listing_ids from the job summary (written when the job was created)
and calls process_enrichment_job. Labs project only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.jobs import process_enrichment_job  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402


def _listing_ids_from_summary(summary: Any) -> list[str]:
    if not isinstance(summary, dict):
        return []
    raw = summary.get("listing_ids") or summary.get("listingIds") or []
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if item]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Process a Labs AI enrichment job by id.",
    )
    parser.add_argument("--job-id", required=True, help="ai_enrichment_jobs.id UUID")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run even when input checksum is unchanged",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=5,
        help="Listings per OpenAI batch (default 5)",
    )
    args = parser.parse_args()

    if args.batch_size < 1:
        raise SystemExit("--batch-size must be >= 1")

    client = create_labs_client()
    rows = (
        client.table("ai_enrichment_jobs")
        .select("id,status,summary,model")
        .eq("id", args.job_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise SystemExit(f"Job not found: {args.job_id}")

    job = rows[0]
    listing_ids = _listing_ids_from_summary(job.get("summary"))
    if not listing_ids:
        raise SystemExit(
            f"Job {args.job_id} has no listing_ids in summary; "
            "create the job via the dashboard/API first."
        )

    result = process_enrichment_job(
        args.job_id,
        listing_ids=listing_ids,
        batch_size=args.batch_size,
        force=bool(args.force),
        model=job.get("model"),
        client=client,
    )
    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("failed", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
