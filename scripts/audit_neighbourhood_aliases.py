#!/usr/bin/env python3
"""Dry-run audit of source neighbourhood alias canonicalization (no AI, no writes).

Lists every distinct ``source_neighbourhood_text`` with count, normalized key,
proposed canonical display, reason, and safe vs uncertain.

Usage:
  PYTHONPATH=src python scripts/audit_neighbourhood_aliases.py
  PYTHONPATH=src python scripts/audit_neighbourhood_aliases.py --input path.json

Default reads Labs ``property_listings`` (read-only). Pass ``--input`` with a
JSON array of ``{"source_neighbourhood_text": "...", "count": N}`` (or plain
strings) to run fully offline.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.neighbourhood_canonical import (  # noqa: E402
    canonicalize_neighbourhood,
)


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


def _counts_from_input(path: Path) -> Counter[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    counts: Counter[str] = Counter()
    if isinstance(payload, dict) and "entries" in payload:
        payload = payload["entries"]
    if not isinstance(payload, list):
        raise SystemExit(f"Unsupported input shape in {path}")
    for item in payload:
        if isinstance(item, str):
            text = item.strip()
            if text:
                counts[text] += 1
            continue
        if not isinstance(item, dict):
            continue
        text = (
            item.get("source_neighbourhood_text")
            or item.get("name")
            or item.get("value")
        )
        if not isinstance(text, str) or not text.strip():
            continue
        n = item.get("count", 1)
        counts[text.strip()] += int(n) if n is not None else 1
    return counts


def _counts_from_labs() -> Counter[str]:
    from merkado_labs.scrapers.import_pipeline import create_labs_client

    client = create_labs_client()
    counts: Counter[str] = Counter()
    start = 0
    page = 1000
    while True:
        rows = (
            client.table("property_listings")
            .select("source_neighbourhood_text")
            .range(start, start + page - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        for row in rows:
            text = row.get("source_neighbourhood_text")
            if isinstance(text, str) and text.strip():
                counts[text.strip()] += 1
        if len(rows) < page:
            break
        start += page
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        help="Offline JSON of neighbourhood strings or {source_neighbourhood_text,count}",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data" / "processed" / "neighbourhood_alias_audit.json",
        help="Report path under data/processed/",
    )
    args = parser.parse_args()

    if args.input:
        counts = _counts_from_input(args.input)
        source = str(args.input)
    else:
        _load_env()
        counts = _counts_from_labs()
        source = "labs.public.property_listings"

    rows: list[dict[str, Any]] = []
    reason_counts: Counter[str] = Counter()
    unsafe = 0
    for text, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        canonical = canonicalize_neighbourhood(text)
        reason_counts[canonical.reason] += 1
        if not canonical.safe:
            unsafe += 1
        rows.append(
            {
                "source_neighbourhood_text": text,
                "count": count,
                "normalized_key": canonical.normalized_key,
                "canonical_display": canonical.canonical_display,
                "reason": canonical.reason,
                "confidence": canonical.confidence,
                "safe": canonical.safe,
            }
        )

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "dry_run": True,
        "source": source,
        "distinct_values": len(rows),
        "total_listings_with_text": sum(counts.values()),
        "reason_counts": dict(reason_counts),
        "unsafe_or_uncertain": unsafe,
        "rows": rows,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {args.output} ({len(rows)} distinct values, {unsafe} uncertain/unsafe)")
    for reason, n in sorted(reason_counts.items()):
        print(f"  {reason}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
