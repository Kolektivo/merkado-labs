"""Phase 7-8: exact Terra canary selection + cost preflight for Moret."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.pricing import (  # noqa: E402
    DEFAULT_INPUT_TOKENS_PER_LISTING,
    DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    estimate_enrichment_cost,
)
from merkado_labs.scrapers.import_pipeline import (  # noqa: E402
    create_labs_client,
    resolve_property_source,
)
from merkado_labs.scrapers.moret_import_preview import (  # noqa: E402
    SOURCE_KEY,
    assert_labs_project_ref,
)

CANARY = [
    ("post-75682", "rich_sale"),
    ("post-75725", "rental"),
    ("post-74976", "generic_weak_location"),
    ("post-75799", "from_price_or_unusual"),
    ("post-74710", "sparse_or_difficult"),
]
OUT_SEL = ROOT / "data/processed/moret_terra_canary_selection.json"
OUT_COST = ROOT / "data/processed/moret_terra_canary_cost_preflight.json"
CATALOG = ROOT / "data/processed/moret_complete_catalog.json"
CEILING = 0.25


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
            "source_description_checksum,neighbourhood_assignment_method,"
            "inferred_neighbourhood_id,neighbourhood_id,field_provenance,"
            "status,source_listing_status"
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

    # resolve neighbourhood names when possible
    nb_ids = [
        r.get("inferred_neighbourhood_id") or r.get("neighbourhood_id")
        for r in rows
        if r.get("inferred_neighbourhood_id") or r.get("neighbourhood_id")
    ]
    nb_names: dict[str, str] = {}
    if nb_ids:
        nbs = (
            client.table("neighbourhoods")
            .select("id,name")
            .in_("id", list({str(i) for i in nb_ids}))
            .execute()
            .data
            or []
        )
        nb_names = {str(n["id"]): n["name"] for n in nbs}

    listings = []
    estimated_inputs = []
    for ext, role in CANARY:
        row = by_ext[ext]
        cat = cat_by[ext]
        desc = row.get("description") or ""
        est_in = max(
            int(cat.get("estimated_input_tokens") or 0),
            int(len(desc) / 4) + 200,
            800,
        )
        estimated_inputs.append(est_in)
        map_nb_id = row.get("inferred_neighbourhood_id") or row.get("neighbourhood_id")
        map_nb = nb_names.get(str(map_nb_id)) if map_nb_id else None
        source_nb = row.get("source_neighbourhood_text") or cat.get("neighbourhood_text")
        effective = source_nb or map_nb
        listings.append(
            {
                "listing_id": str(row["id"]),
                "external_id": ext,
                "title": row.get("title"),
                "listing_type": row.get("listing_type"),
                "sale_rent": row.get("listing_type"),
                "original_price": row.get("original_price"),
                "original_currency": row.get("original_currency"),
                "public_eligible": row.get("public_eligible"),
                "description_length": len(desc),
                "source_neighbourhood": source_nb,
                "map_neighbourhood": map_nb,
                "effective_neighbourhood": effective,
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "from_price": bool(cat.get("from_price")),
                "current_semantic_checksum": row.get("source_description_checksum"),
                "reason_selected": role,
                "estimated_input_tokens": est_in,
            }
        )

    listing_ids = [item["listing_id"] for item in listings]
    selection = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 7,
        "source_key": SOURCE_KEY,
        "model_required": "gpt-5.6-terra",
        "prompt_version": "listing_enrichment_v3",
        "schema_version": "listing_enrichment_schema_v3",
        "policy_version": "enrichment_policy_v3",
        "allow_canary": True,
        "count": 5,
        "listing_ids": listing_ids,
        "external_ids": ext_ids,
        "listings": listings,
        "canaries": listings,
        "selection_rule": "Exactly five approved Moret Terra-v3 canary listings",
        "do_not_replace_without_approval": True,
    }
    OUT_SEL.write_text(json.dumps(selection, indent=2, default=str) + "\n", encoding="utf-8")

    expected = estimate_enrichment_cost(
        model="gpt-5.6-terra",
        listing_count=5,
        input_tokens_per_listing=max(1, int(sum(estimated_inputs) / 5)),
        output_tokens_per_listing=DEFAULT_OUTPUT_TOKENS_PER_LISTING,
    )
    conservative = estimate_enrichment_cost(
        model="gpt-5.6-terra",
        listing_count=5,
        input_tokens_per_listing=max(1, int(sum(estimated_inputs) / 5 * 1.35)),
        output_tokens_per_listing=int(DEFAULT_OUTPUT_TOKENS_PER_LISTING * 1.2),
    )
    one_retry = estimate_enrichment_cost(
        model="gpt-5.6-terra",
        listing_count=1,
        input_tokens_per_listing=max(1, int(max(estimated_inputs) * 1.35)),
        output_tokens_per_listing=int(DEFAULT_OUTPUT_TOKENS_PER_LISTING * 1.2),
    )
    expected_cost = float(expected.estimated_usd)
    conservative_cost = float(conservative.estimated_usd)
    retry_allowance = float(one_retry.estimated_usd)
    conservative_with_retry = conservative_cost + retry_allowance

    cost = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 8,
        "source_key": SOURCE_KEY,
        "listing_count": 5,
        "model": "gpt-5.6-terra",
        "prompt": "listing_enrichment_v3",
        "schema": "listing_enrichment_schema_v3",
        "policy": "enrichment_policy_v3",
        "max_output_tokens": 3500,
        "batch_size": 1,
        "ceiling_usd": CEILING,
        "progress_persists_after_every_listing": True,
        "one_transport_retry_maximum": True,
        "no_validation_policy_retry": True,
        "protected_source_facts_cannot_change": True,
        "no_initial_71_batch": True,
        "expected_input_tokens": sum(estimated_inputs),
        "expected_output_tokens": DEFAULT_OUTPUT_TOKENS_PER_LISTING * 5,
        "expected_cost_usd": round(expected_cost, 6),
        "conservative_cost_usd": round(conservative_cost, 6),
        "retry_allowance_usd": round(retry_allowance, 6),
        "conservative_with_one_retry_usd": round(conservative_with_retry, 6),
        "remaining_budget_usd": round(CEILING - conservative_with_retry, 6),
        "stop_if_conservative_exceeds_ceiling": conservative_with_retry > CEILING,
        "default_input_tokens_constant": DEFAULT_INPUT_TOKENS_PER_LISTING,
        "per_listing": [
            {
                "external_id": listings[i]["external_id"],
                "estimated_input_tokens": estimated_inputs[i],
            }
            for i in range(5)
        ],
    }
    OUT_COST.write_text(json.dumps(cost, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "selection": str(OUT_SEL).replace("\\", "/"),
                "listing_ids": listing_ids,
                "external_ids": ext_ids,
                "expected_cost_usd": cost["expected_cost_usd"],
                "conservative_with_one_retry_usd": cost["conservative_with_one_retry_usd"],
                "stop": cost["stop_if_conservative_exceeds_ceiling"],
            },
            indent=2,
        )
    )
    return 2 if cost["stop_if_conservative_exceeds_ceiling"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
