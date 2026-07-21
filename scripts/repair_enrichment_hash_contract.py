"""Zero-cost Labs repair: backfill canonical enrichment hashes (no AI calls).

Safe for Merkado Labs only (`csaefdkpwukshtouyixg`).

For each public-eligible listing with a prior successful Terra proposal whose
semantic checksum still matches current source input:

- refresh ``enrichment_last_input_checksum`` to the current semantic checksum
- refresh ``enrichment_last_change_checksum`` to ``enrichment_input_hash_v1``
- preserve historical proposal rows (old hashes remain on proposals)

Dry-run by default. Pass ``--apply`` to write.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
for path in (str(SRC), str(ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from merkado_labs.enrichment import (  # noqa: E402
    compute_input_checksum,
    compute_legacy_input_checksum,
)
from merkado_labs.enrichment.jobs import (  # noqa: E402
    hydrate_map_neighbourhood_names,
    listing_to_enrichment_input,
    should_skip_unchanged_enrichment,
)
from merkado_labs.pipeline.change_hash import (  # noqa: E402
    compute_enrichment_input_hash,
)
from merkado_labs.pipeline.readiness import (  # noqa: E402
    FORBIDDEN_PROJECT_REF,
    LABS_PROJECT_REF,
)
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    assert_labs_project_ref,
)


def _client():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    if FORBIDDEN_PROJECT_REF in url:
        raise PermissionError("Production Supabase is forbidden")
    if LABS_PROJECT_REF not in url:
        raise PermissionError("Labs project URL required")
    assert_labs_project_ref()
    return create_client(url, key)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--source-key",
        action="append",
        dest="source_keys",
        default=None,
    )
    args = parser.parse_args()
    client = _client()

    sources = (
        client.table("property_sources")
        .select("id,source_key")
        .in_(
            "source_key",
            args.source_keys
            or [
                "monumentenzorg_curacao",
                "moret_real_estate",
                "keller_williams_curacao",
                "remax_curacao",
            ],
        )
        .execute()
        .data
        or []
    )
    report: dict[str, object] = {
        "apply": bool(args.apply),
        "project_ref": LABS_PROJECT_REF,
        "repaired": [],
        "billable_remaining": [],
        "counts": {},
    }
    for source in sources:
        source_key = source["source_key"]
        rows = (
            client.table("property_listings")
            .select(
                "id,external_id,source_url,title,description,listing_type,"
                "property_type,source_listing_status,status,bedrooms,bathrooms,"
                "floor_area_m2,lot_area_value,lot_area_unit,"
                "source_neighbourhood_text,original_price,original_currency,"
                "latitude,longitude,amenities,enrichment_status,"
                "enrichment_last_input_checksum,enrichment_last_change_checksum,"
                "neighbourhood_assignment_status,neighbourhood_assignment_method,"
                "neighbourhood_assignment_confidence,inferred_neighbourhood_id,"
                "public_eligible,property_source_id"
            )
            .eq("property_source_id", source["id"])
            .execute()
            .data
            or []
        )
        repaired = 0
        billable = 0
        # Hydrate map neighbourhood names so checksums match enrichment jobs /
        # English migration selection (both hydrate before checksum).
        rows = hydrate_map_neighbourhood_names(client, rows)
        for row in rows:
            row["source_key"] = source_key
            if not row.get("public_eligible"):
                continue
            enrichment_input = listing_to_enrichment_input(row)
            semantic = compute_input_checksum(enrichment_input)
            legacy = compute_legacy_input_checksum(enrichment_input)
            contract = compute_enrichment_input_hash(row)
            skip = should_skip_unchanged_enrichment(
                client, row=row, model="gpt-5.6-terra"
            )
            needs_input = row.get("enrichment_last_input_checksum") != semantic
            needs_change = row.get("enrichment_last_change_checksum") != contract
            if skip and (needs_input or needs_change):
                repaired += 1
                report["repaired"].append(  # type: ignore[union-attr]
                    {
                        "source_key": source_key,
                        "external_id": row.get("external_id"),
                        "listing_id": row["id"],
                        "old_input": row.get("enrichment_last_input_checksum"),
                        "new_input": semantic,
                        "legacy_input": legacy,
                        "old_change": row.get("enrichment_last_change_checksum"),
                        "new_change": contract,
                        "classification": "zero_cost_hash_repair",
                    }
                )
                if args.apply:
                    client.table("property_listings").update(
                        {
                            "enrichment_last_input_checksum": semantic,
                            "enrichment_last_change_checksum": contract,
                        }
                    ).eq("id", row["id"]).execute()
            elif not skip:
                billable += 1
                report["billable_remaining"].append(  # type: ignore[union-attr]
                    {
                        "source_key": source_key,
                        "external_id": row.get("external_id"),
                        "listing_id": row["id"],
                        "public_eligible": True,
                        "enrichment_status": row.get("enrichment_status"),
                    }
                )
        report["counts"][source_key] = {  # type: ignore[index]
            "listings": len(rows),
            "zero_cost_repairs": repaired,
            "billable_public": billable,
        }

    out = Path("data/processed/enrichment_hash_repair_report.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["counts"], indent=2))
    print(f"wrote {out} apply={args.apply}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
