"""Create a Labs demo Property Search Request for match preview."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402


def main() -> int:
    client = create_labs_client()
    payload = {
        "title": "Labs demo — Salinja / Jan Thiel family home",
        "status": "confirmed",
        "transaction_type": "sale",
        "min_price": 300000,
        "max_price": 1200000,
        "price_currency": "XCG",
        "min_bedrooms": 2,
        "min_bathrooms": 1,
        "property_types": ["villa", "house", "apartment", "condo"],
        "preferred_neighbourhoods": ["Salinja", "Jan Thiel", "Piscadera", "Blue Bay"],
        "excluded_neighbourhoods": [],
        "must_haves": ["parking"],
        "preferences": ["pool", "move-in ready"],
        "dealbreakers": [],
        "renovation_willingness": "light",
        "timeline": "3-12 months",
        "notes": "Demo Search Request created by create_demo_search_request.py",
        "intake_source": "labs_demo",
        "confirmed_at": "2026-07-17T09:15:00Z",
    }
    row = client.table("property_search_requests").insert(payload).execute().data[0]
    ent = (
        client.table("merkado_agent_entitlements")
        .upsert(
            {
                "property_search_request_id": row["id"],
                "status": "test",
                "delivery_channel": "labs_preview",
                "notes": "Test entitlement — no email, no billing",
            },
            on_conflict="property_search_request_id",
        )
        .execute()
        .data
    )
    print(json.dumps({"request": row, "entitlement": ent}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
