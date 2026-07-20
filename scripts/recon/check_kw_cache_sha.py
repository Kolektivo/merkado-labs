"""Verify dry-run raw_sha256 values match local cache HTML."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
dry = json.loads((ROOT / "data/processed/kw_catalog_dry_run.json").read_text(encoding="utf-8"))
cache = ROOT / "data/raw/keller_williams_curacao/cache"
mismatch = []
for item in dry["listings"]:
    path = cache / f"{hashlib.sha256(item['url'].encode()).hexdigest()}.html"
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    if sha != item.get("raw_sha256"):
        mismatch.append(
            {
                "external_id": item["external_id"],
                "artifact": item.get("raw_sha256"),
                "cache": sha,
            }
        )
print(json.dumps({"mismatches": len(mismatch), "sample": mismatch[:5]}, indent=2))
raise SystemExit(1 if mismatch else 0)
