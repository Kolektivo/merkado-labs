"""Exact Terra canary selection + cost preflight for Monumentenzorg."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.pricing import (  # noqa: E402
    DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    estimate_enrichment_cost,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.monumentenzorg_import_preview import (  # noqa: E402
    SOURCE_KEY,
    assert_labs_project_ref,
)

CANARY = [
    ("property-19349", "standard_numeric_priced_active_rental"),
    ("property-18650", "villa_maria_starting_at_from_price"),
]
OUT_SEL = ROOT / "data/processed/monumentenzorg_terra_canary_selection.json"
OUT_COST = ROOT / "data/processed/monumentenzorg_terra_canary_cost_preflight.json"
CATALOG = ROOT / "data/processed/monumentenzorg_complete_catalog.json"
CEILING = 0.10


def main() -> int:
    assert_labs_project_ref()
    client = create_labs_client()
    source = resolve_property_source(client, SOURCE_KEY)
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    cat_by = {item["external_id"]: item for item in catalog["listings"]}

    ext_ids = [c[0] for c in CANARY]
    rows = (
        client.table("property_listings")
        .select(
            "id,external_id,title,listing_type,original_price,original_currency,"
            "public_eligible,description,source_neighbourhood_text,latitude,longitude,"
            "source_description_checksum,status,source_listing_status"
        )
        .eq("property_source_id", source["id"])
        .in_("external_id", ext_ids)
        .execute()
        .data
        or []
    )
    by_ext = {r["external_id"]: r for r in rows}
    if set(by_ext) != set(ext_ids):
        raise SystemExit(f"Canary rows missing: {sorted(set(ext_ids) - set(by_ext))}")

    listings = []
    estimated_inputs = []
    for ext, role in CANARY:
        row = by_ext[ext]
        cat = cat_by[ext]
        desc = row.get("description") or ""
        est_in = max(int(len(desc) / 4) + 200, 800)
        estimated_inputs.append(est_in)
        listings.append(
            {
                "listing_id": str(row["id"]),
                "external_id": ext,
                "title": row.get("title"),
                "listing_type": row.get("listing_type"),
                "original_price": row.get("original_price"),
                "original_currency": row.get("original_currency"),
                "public_eligible": row.get("public_eligible"),
                "description_length": len(desc),
                "source_neighbourhood": row.get("source_neighbourhood_text")
                or cat.get("neighbourhood_text"),
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "from_price": bool((cat.get("raw_payload") or {}).get("from_price")),
                "current_semantic_checksum": row.get("source_description_checksum"),
                "reason_selected": role,
                "estimated_input_tokens": est_in,
            }
        )

    listing_ids = [item["listing_id"] for item in listings]
    selection = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "model_required": "gpt-5.6-terra",
        "prompt_version": "listing_enrichment_v3",
        "schema_version": "listing_enrichment_schema_v3",
        "policy_version": "enrichment_policy_v3",
        "allow_canary": True,
        "count": 2,
        "listing_ids": listing_ids,
        "external_ids": ext_ids,
        "listings": listings,
        "canaries": listings,
        "selection_rule": (
            "Exactly two approved Monumentenzorg Terra-v3 canary listings: "
            "one standard priced rental + Villa Maria from-price"
        ),
        "do_not_replace_without_approval": True,
        "hard_ceiling_usd": CEILING,
    }
    OUT_SEL.write_text(json.dumps(selection, indent=2, default=str) + "\n", encoding="utf-8")

    expected = estimate_enrichment_cost(
        model="gpt-5.6-terra",
        listing_count=2,
        input_tokens_per_listing=max(1, int(sum(estimated_inputs) / 2)),
        output_tokens_per_listing=DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    )
    conservative = estimate_enrichment_cost(
        model="gpt-5.6-terra",
        listing_count=2,
        input_tokens_per_listing=max(1, int(sum(estimated_inputs) / 2 * 1.35)),
        output_tokens_per_listing=int(DEFAULT_OUTPUT_TOKENS_PER_LISTING * 1.2),
    )
    cost = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_key": SOURCE_KEY,
        "listing_count": 2,
        "model": "gpt-5.6-terra",
        "prompt": "listing_enrichment_v3",
        "schema": "listing_enrichment_schema_v3",
        "policy": "enrichment_policy_v3",
        "max_output_tokens": 3500,
        "batch_size": 1,
        "ceiling_usd": CEILING,
        "expected_usd": float(expected.estimated_usd),
        "conservative_usd": float(conservative.estimated_usd),
        "within_ceiling": float(conservative.estimated_usd) <= CEILING,
        "selection_path": str(OUT_SEL).replace("\\", "/"),
    }
    OUT_COST.write_text(json.dumps(cost, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps({"selection": selection["external_ids"], "cost": cost}, indent=2))
    if not cost["within_ceiling"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
