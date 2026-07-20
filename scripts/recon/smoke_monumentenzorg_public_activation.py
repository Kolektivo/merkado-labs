"""Smoke-check public-safe Browse/Passport exposure for Monumentenzorg."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.monumentenzorg_import_preview import (  # noqa: E402
    SOURCE_KEY,
    assert_labs_project_ref,
)

OUT = ROOT / "data/processed/monumentenzorg_public_smoke.json"
FORBIDDEN_KEYS = {
    "prompt",
    "schema",
    "confidence",
    "token",
    "cost",
    "raw_ai",
    "proposal",
    "review_note",
    "openai",
}


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    rows = (
        client.table("public_property_listings")
        .select("*")
        .eq("source_key", SOURCE_KEY)
        .execute()
        .data
        or []
    )
    titles = {r.get("title"): r for r in rows}
    villa = next((r for r in rows if "Villa Maria" in (r.get("title") or "")), None)
    bargestraat = next(
        (r for r in rows if "Bargestraat" in (r.get("title") or "")), None
    )

    leakage = []
    for row in rows:
        blob = json.dumps(row, default=str).lower()
        for key in FORBIDDEN_KEYS:
            if key in blob and key not in {
                # allow benign words in normal copy if any; keep strict on metadata keys
            }:
                # only flag if key appears as a JSON field name-ish
                if f'"{key}' in blob or f"_{key}" in blob:
                    leakage.append({"external_hint": row.get("title"), "key": key})

    checks = {
        "public_rows_2": len(rows) == 2,
        "villa_maria_present": villa is not None,
        "bargestraat_present": bargestraat is not None,
        "no_price_tbd_absent": not any(
            "Fort Waakzaamheid" in (t or "") or "Villa Washington" in (t or "")
            for t in titles
        ),
        "sold_aura_absent": not any("Aura" in (t or "") for t in titles),
        "no_internal_ai_leakage_keys": not leakage,
        "project_is_labs": ref == "csaefdkpwukshtouyixg",
    }
    # from-price qualifier if exposed
    from_price_ok = True
    if villa:
        text = json.dumps(villa, default=str).lower()
        from_price_ok = "starting" in text or "from" in text or villa.get("price_qualifier") in {
            "from",
            "starting_at",
            "from_price",
        }
        checks["villa_maria_from_price_signal"] = from_price_ok

    failed = [k for k, ok in checks.items() if not ok]
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "public_count": len(rows),
        "titles": [r.get("title") for r in rows],
        "checks": checks,
        "failed_checks": failed,
        "passed": not failed,
        "leakage_samples": leakage[:10],
        "sample_villa_keys": sorted(villa.keys()) if villa else [],
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": payload["passed"],
                "failed_checks": failed,
                "titles": payload["titles"],
            },
            indent=2,
        )
    )
    return 0 if payload["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
