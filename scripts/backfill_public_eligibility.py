#!/usr/bin/env python3
"""Recompute public_eligible for all property listings (Labs only)."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from merkado_labs.config import get_settings
from merkado_labs.normalization.eligibility import evaluate_public_eligibility
from supabase import create_client


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("data/processed/eligibility_backfill_report.json"),
    )
    args = parser.parse_args()
    settings = get_settings()
    assert settings.supabase_project_ref == "csaefdkpwukshtouyixg"
    client = create_client(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )
    sources = {
        row["id"]: row
        for row in (
            client.table("property_sources")
            .select("id,source_key,enabled,adapter_status")
            .execute()
            .data
            or []
        )
    }
    listings = (
        client.table("property_listings")
        .select(
            "id,property_source_id,status,original_price,source_url,"
            "public_eligible,public_exclusion_reason,original_realtor_name"
        )
        .execute()
        .data
        or []
    )
    before = Counter()
    after = Counter()
    changes = []
    for row in listings:
        source = sources.get(row["property_source_id"], {})
        source_key = source.get("source_key", "unknown")
        before[(source_key, row.get("public_exclusion_reason") or "eligible" if row.get("public_eligible") else row.get("public_exclusion_reason") or "unknown")] += 1
        eligible, reason = evaluate_public_eligibility(
            status=row["status"],
            original_price=(
                Decimal(str(row["original_price"]))
                if row.get("original_price") is not None
                else None
            ),
            source_enabled=bool(source.get("enabled", True)),
            source_url=row.get("source_url"),
            source_adapter_status=source.get("adapter_status"),
            has_source_attribution=bool(
                row.get("original_realtor_name") or row.get("source_url")
            ),
        )
        after[(source_key, "eligible" if eligible else reason)] += 1
        if row.get("public_eligible") != eligible or (
            (None if eligible else reason) != row.get("public_exclusion_reason")
        ):
            changes.append(
                {
                    "id": row["id"],
                    "source_key": source_key,
                    "from": {
                        "public_eligible": row.get("public_eligible"),
                        "reason": row.get("public_exclusion_reason"),
                    },
                    "to": {
                        "public_eligible": eligible,
                        "reason": None if eligible else reason,
                    },
                }
            )
            if args.apply:
                client.table("property_listings").update(
                    {
                        "public_eligible": eligible,
                        "public_exclusion_reason": None if eligible else reason,
                        "updated_at": datetime.now(UTC).isoformat(),
                    }
                ).eq("id", row["id"]).execute()
    report = {
        "timestamp": datetime.now(UTC).isoformat(),
        "mode": "apply" if args.apply else "preview",
        "total": len(listings),
        "changes": len(changes),
        "before_by_source_reason": {f"{k[0]}|{k[1]}": v for k, v in before.items()},
        "after_by_source_reason": {f"{k[0]}|{k[1]}": v for k, v in after.items()},
        "sample_changes": changes[:50],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"mode": report["mode"], "total": report["total"], "changes": report["changes"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
