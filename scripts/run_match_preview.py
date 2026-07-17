"""Labs-only Match Report preview from a Property Search Request.

Reads confirmed/draft requests via service role, scores public-eligible active
listings with rules_v1, optionally writes listing_match_reports.

Never sends email. Never bills. Labs project only.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.matching import (  # noqa: E402
    ListingMatchCandidate,
    SearchRequestProfile,
    rank_listings,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

load_dotenv(ROOT / ".env")

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"


def _dec(value: object) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _as_str_tuple(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, list):
        return tuple(str(v) for v in value)
    return ()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-id", required=True)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument(
        "--write-db",
        action="store_true",
        help="Persist match reports (Labs only). Default is dry preview JSON.",
    )
    args = parser.parse_args()

    settings = get_settings()
    ref = (settings.supabase_project_ref or os.environ.get("SUPABASE_PROJECT_REF", "")).strip()
    if ref and ref != LABS_PROJECT_REF:
        print(f"Refusing non-Labs project ref: {ref}", file=sys.stderr)
        return 2

    client = create_labs_client()
    req = (
        client.table("property_search_requests")
        .select("*")
        .eq("id", args.request_id)
        .maybe_single()
        .execute()
    )
    row = req.data
    if not row:
        print("Search request not found", file=sys.stderr)
        return 1

    profile = SearchRequestProfile(
        transaction_type=row.get("transaction_type"),
        min_price=_dec(row.get("min_price")),
        max_price=_dec(row.get("max_price")),
        price_currency=str(row.get("price_currency") or "XCG"),
        min_bedrooms=float(row["min_bedrooms"]) if row.get("min_bedrooms") is not None else None,
        min_bathrooms=float(row["min_bathrooms"]) if row.get("min_bathrooms") is not None else None,
        min_floor_area_m2=_dec(row.get("min_floor_area_m2")),
        property_types=_as_str_tuple(row.get("property_types")),
        preferred_neighbourhoods=_as_str_tuple(row.get("preferred_neighbourhoods")),
        excluded_neighbourhoods=_as_str_tuple(row.get("excluded_neighbourhoods")),
        must_haves=tuple(
            str(x) for x in (row.get("must_haves") or []) if isinstance(x, str | int | float)
        ),
        preferences=tuple(
            str(x) for x in (row.get("preferences") or []) if isinstance(x, str | int | float)
        ),
        dealbreakers=tuple(
            str(x) for x in (row.get("dealbreakers") or []) if isinstance(x, str | int | float)
        ),
    )

    listings_resp = (
        client.table("property_listings")
        .select(
            "id,external_id,listing_type,property_type,status,public_eligible,"
            "benchmark_price_xcg,bedrooms,bathrooms,floor_area_m2,title,amenities,"
            "neighbourhood:neighbourhoods!property_listings_neighbourhood_id_fkey(name)"
        )
        .eq("public_eligible", True)
        .eq("status", "active")
        .limit(500)
        .execute()
    )

    candidates: list[ListingMatchCandidate] = []
    for item in listings_resp.data or []:
        nb = item.get("neighbourhood") or {}
        amenities_raw = item.get("amenities") or []
        amenity_labels: list[str] = []
        if isinstance(amenities_raw, list):
            for a in amenities_raw:
                if isinstance(a, dict):
                    label = a.get("label") or a.get("code")
                    if label is not None:
                        amenity_labels.append(str(label))
                else:
                    amenity_labels.append(str(a))
        candidates.append(
            ListingMatchCandidate(
                listing_id=str(item["id"]),
                external_id=str(item["external_id"]),
                listing_type=item.get("listing_type"),
                property_type=item.get("property_type"),
                status=item.get("status"),
                public_eligible=bool(item.get("public_eligible")),
                benchmark_price_xcg=_dec(item.get("benchmark_price_xcg")),
                bedrooms=float(item["bedrooms"]) if item.get("bedrooms") is not None else None,
                bathrooms=float(item["bathrooms"]) if item.get("bathrooms") is not None else None,
                floor_area_m2=_dec(item.get("floor_area_m2")),
                neighbourhood_text=nb.get("name") if isinstance(nb, dict) else None,
                amenities=tuple(amenity_labels),
                title=item.get("title"),
            )
        )

    matches = rank_listings(profile, candidates, limit=args.limit)
    payload = [
        {
            "listing_id": m.listing_id,
            "hard_pass": m.hard_pass,
            "match_score": m.match_score,
            "match_reasons": m.match_reasons,
            "trade_offs": m.trade_offs,
            "evidence": m.evidence,
            "scoring_version": m.scoring_version,
        }
        for m in matches
    ]
    print(json.dumps({"request_id": args.request_id, "matches": payload}, indent=2))

    if args.write_db:
        for m in matches:
            client.table("listing_match_reports").upsert(
                {
                    "property_search_request_id": args.request_id,
                    "property_listing_id": m.listing_id,
                    "match_score": m.match_score,
                    "hard_pass": m.hard_pass,
                    "match_reasons": m.match_reasons,
                    "trade_offs": m.trade_offs,
                    "evidence": m.evidence,
                    "scoring_version": m.scoring_version,
                },
                on_conflict="property_search_request_id,property_listing_id,scoring_version",
            ).execute()
        print(f"Wrote {len(matches)} match reports to Labs.", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
