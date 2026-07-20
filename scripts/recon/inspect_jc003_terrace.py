"""Inspect JC-003 terrace evidence vs source description (no API)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402


def main() -> int:
    client = create_labs_client()
    rows = (
        client.table("property_listings")
        .select("id,external_id,title,description")
        .eq("external_id", "JC-003")
        .limit(1)
        .execute()
        .data
        or []
    )
    row = rows[0]
    props = (
        client.table("ai_enrichment_proposals")
        .select("id,status,proposal,supporting_evidence,generated_at")
        .eq("property_listing_id", row["id"])
        .eq("model", "gpt-5.6-terra")
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    prop = props[0]
    audit = (prop.get("supporting_evidence") or {}).get("run_audit") or {}
    decisions = (audit.get("policy") or {}).get("decisions") or []
    terrace = next((d for d in decisions if d.get("key") == "terrace"), None)
    desc = row.get("description") or ""
    print("title:", row.get("title"))
    print("desc_len:", len(desc))
    print("terrace decision:", json.dumps(terrace, indent=2, default=str)[:2000])
    for pat in [
        r"terrace",
        r"terras",
        r"terra",
        r"Private",
        r"balcon",
        r"patio",
    ]:
        hits = re.findall(pat, desc, flags=re.I)
        print(f"pattern {pat!r} hits:", hits[:10], "count", len(hits))
    # Show windows around 'terra'
    for match in re.finditer(r".{0,40}terra.{0,40}", desc, flags=re.I):
        print("window:", repr(match.group(0)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
