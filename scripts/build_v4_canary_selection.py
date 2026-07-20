"""Build a ~20 listing cross-source v4 canary selection (Labs, no OpenAI)."""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

SOURCE_KEYS = [
    "keller_williams_curacao",
    "remax_curacao",
    "moret_real_estate",
    "monumentenzorg_curacao",
]


def _load_env() -> None:
    env_path = ROOT / "apps" / "labs-dashboard" / ".env.local"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    os.environ["SUPABASE_PROJECT_REF"] = "csaefdkpwukshtouyixg"


def main() -> int:
    _load_env()
    client = create_labs_client()
    sources = {
        r["id"]: r
        for r in (
            client.table("property_sources")
            .select("id,source_key")
            .in_("source_key", SOURCE_KEYS)
            .execute()
            .data
            or []
        )
    }
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,property_source_id,description,listing_type,"
            "source_neighbourhood_text,latitude,longitude,original_price,"
            "original_currency"
        )
        .eq("public_eligible", True)
        .eq("status", "active")
        .in_("property_source_id", list(sources))
        .execute()
        .data
        or []
    )
    for row in rows:
        row["source_key"] = sources[row["property_source_id"]]["source_key"]
        row["desc_len"] = len(row.get("description") or "")
        row["has_coords"] = row.get("latitude") is not None

    def pick(sk: str, pred=None, n: int = 5, reverse: bool = True):
        pool = [
            r
            for r in rows
            if r["source_key"] == sk and (pred(r) if pred else True)
        ]
        pool.sort(key=lambda r: r["desc_len"], reverse=reverse)
        return pool[:n]

    selected: list[dict] = []
    seen: set[str] = set()

    def add(items):
        for row in items:
            if row["id"] in seen:
                continue
            seen.add(row["id"])
            selected.append(row)

    add(pick("keller_williams_curacao", n=3, reverse=True))
    add(pick("keller_williams_curacao", n=2, reverse=False))
    add(pick("remax_curacao", lambda r: r["listing_type"] == "sale", n=3, reverse=True))
    add(pick("remax_curacao", lambda r: r["listing_type"] == "rent", n=2, reverse=True))
    add(pick("moret_real_estate", n=5, reverse=True))
    add(pick("monumentenzorg_curacao", n=5, reverse=True))
    add([r for r in rows if r["external_id"] == "property-18650"])
    # Keep exact 5/5/5/2 when possible; fill remaining from sparse/no-coord edges.
    for sk, target in (
        ("keller_williams_curacao", 5),
        ("remax_curacao", 5),
        ("moret_real_estate", 5),
        ("monumentenzorg_curacao", 2),
    ):
        have = sum(1 for r in selected if r["source_key"] == sk)
        if have < target:
            add(pick(sk, n=target - have, reverse=True))
    while len(selected) < 20:
        progressed = False
        for row in sorted(rows, key=lambda x: x["desc_len"], reverse=True):
            if row["id"] not in seen:
                selected.append(row)
                seen.add(row["id"])
                progressed = True
                break
        if not progressed:
            break
    # Trim extras while preserving required source quotas when possible.
    selected = selected[:20]

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "purpose": "enrichment_quality_v4_canary",
        "model_required": "gpt-5.6-terra",
        "prompt_version": "listing_enrichment_v4",
        "schema_version": "listing_enrichment_schema_v4",
        "policy_version": "enrichment_policy_v4",
        "max_budget_usd": 1.50,
        "force": True,
        "allow_cross_source": True,
        "allow_canary": True,
        "count": len(selected),
        "by_source": dict(Counter(r["source_key"] for r in selected)),
        "listing_ids": [r["id"] for r in selected],
        "external_ids": [r["external_id"] for r in selected],
        "listings": [
            {
                "listing_id": r["id"],
                "external_id": r["external_id"],
                "source_key": r["source_key"],
                "listing_type": r["listing_type"],
                "desc_len": r["desc_len"],
                "has_coords": r["has_coords"],
                "source_neighbourhood_text": r.get("source_neighbourhood_text"),
            }
            for r in selected
        ],
    }
    out = ROOT / "data" / "processed" / "enrichment_v4_canary_selection.json"
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "out": str(out),
                "count": payload["count"],
                "by_source": payload["by_source"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
