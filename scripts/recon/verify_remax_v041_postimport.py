"""Post-import RE/MAX v0.4.1 verification against Labs."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment import compute_input_checksum  # noqa: E402
from merkado_labs.enrichment.jobs import listing_to_enrichment_input  # noqa: E402
from merkado_labs.enrichment.neighbourhood import resolve_effective_neighbourhood  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402
from merkado_labs.scrapers.remax_import_preview import (  # noqa: E402
    EXPECTED_CATALOG_CHECKSUM,
    load_existing_remax_rows,
)

PROCESSED = ROOT / "data" / "processed"
OUT_JSON = PROCESSED / "remax_v041_postimport_verification.json"
OUT_MD = PROCESSED / "remax_v041_postimport_verification.md"
SNAPSHOT = PROCESSED / "remax_v041_preimport_labs_snapshot.json"
IMPORT = PROCESSED / "remax_v041_import_result.json"
APPROVED_SEMANTIC_IDS = ("hr2165", "hr2185", "hs3061", "hs3103", "hs3104")
SOURCE_KEY = "remax_curacao"
MODEL = "gpt-5.6-terra"


def _chunk(
    client: Any, table: str, columns: str, listing_ids: list[str]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for start in range(0, len(listing_ids), 40):
        chunk = listing_ids[start : start + 40]
        rows.extend(
            client.table(table)
            .select(columns)
            .in_("property_listing_id", chunk)
            .execute()
            .data
            or []
        )
    return rows


def main() -> int:
    ref = assert_labs_project_ref()
    client = create_labs_client()
    rows = load_existing_remax_rows(client)
    nb_rows = (
        client.table("neighbourhoods").select("id,name").execute().data or []
    )
    nb_map = {str(n["id"]): n["name"] for n in nb_rows}
    for row in rows:
        row["inferred_neighbourhood_name"] = nb_map.get(
            str(row.get("inferred_neighbourhood_id") or "")
        )
        row["source_key"] = SOURCE_KEY
    listing_ids = [str(r["id"]) for r in rows]
    pre = json.loads(SNAPSHOT.read_text(encoding="utf-8")) if SNAPSHOT.exists() else {}
    import_payload = (
        json.loads(IMPORT.read_text(encoding="utf-8")) if IMPORT.exists() else {}
    )
    pre_by_ext = {
        str(r["external_id"]): r for r in (pre.get("listings") or [])
    }
    pre_by_id = {str(r["id"]): r for r in (pre.get("listings") or [])}

    events = _chunk(
        client,
        "listing_activity_events",
        "id,property_listing_id,event_type,event_at,notes,derivation_type",
        listing_ids,
    )
    obs = _chunk(
        client,
        "listing_observations",
        "id,property_listing_id,adapter_version,source_sha256,"
        "evidence_storage_path,observed_at",
        listing_ids,
    )

    run_id = (import_payload.get("import") or {}).get("source_run_id")
    # Delta vs preimport event IDs
    pre_event_ids = set(pre.get("activity_event_ids") or [])
    new_events = [e for e in events if e.get("id") not in pre_event_ids]
    new_event_counts = Counter(e.get("event_type") for e in new_events)

    pre_obs_ids = set(pre.get("listing_observation_ids") or [])
    new_obs = [o for o in obs if o.get("id") not in pre_obs_ids]

    ext_ids = [r["external_id"] for r in rows]
    urls = [r.get("source_url") for r in rows]
    with_coords = [
        r
        for r in rows
        if r.get("latitude") is not None and r.get("longitude") is not None
    ]
    without_coords = [
        r
        for r in rows
        if r.get("latitude") is None or r.get("longitude") is None
    ]
    public_eligible = sum(1 for r in rows if r.get("public_eligible"))
    inferred = [
        r for r in rows if r.get("neighbourhood_assignment_status") == "inferred"
    ]
    outside = [
        r
        for r in rows
        if r.get("neighbourhood_assignment_status") == "outside_polygons"
    ]
    assignment_counts = Counter(
        r.get("neighbourhood_assignment_status") for r in rows
    )

    # Stable IDs / protected fields
    id_stable = 0
    price_stable = 0
    currency_stable = 0
    status_stable = 0
    url_stable = 0
    null_replaced = []
    coords_added = 0
    coord_conflicts = 0
    image_deltas = []
    bathroom_changes = []
    eff_nb_changes = []

    for row in rows:
        eid = str(row["external_id"])
        before = pre_by_ext.get(eid) or pre_by_id.get(str(row["id"])) or {}
        if before and str(before.get("id")) == str(row["id"]):
            id_stable += 1
        if before.get("original_price") == row.get("original_price"):
            price_stable += 1
        if before.get("original_currency") == row.get("original_currency"):
            currency_stable += 1
        if before.get("source_listing_status") == row.get("source_listing_status"):
            status_stable += 1
        if before.get("source_url") == row.get("source_url"):
            url_stable += 1

        for field in (
            "original_price",
            "original_currency",
            "source_url",
            "bathrooms",
            "bedrooms",
            "description",
        ):
            if before.get(field) is not None and row.get(field) is None:
                null_replaced.append({"external_id": eid, "field": field})

        had_coords = (
            before.get("latitude") is not None and before.get("longitude") is not None
        )
        has_coords = (
            row.get("latitude") is not None and row.get("longitude") is not None
        )
        if has_coords and not had_coords:
            coords_added += 1
        elif has_coords and had_coords:
            if round(float(before["latitude"]), 6) != round(
                float(row["latitude"]), 6
            ) or round(float(before["longitude"]), 6) != round(
                float(row["longitude"]), 6
            ):
                coord_conflicts += 1

        before_images = before.get("image_count")
        after_images = (
            len(row.get("image_urls") or [])
            if isinstance(row.get("image_urls"), list)
            else None
        )
        if (
            before_images is not None
            and after_images is not None
            and before_images != after_images
        ):
            image_deltas.append(
                {
                    "external_id": eid,
                    "before": before_images,
                    "after": after_images,
                }
            )

        if before.get("bathrooms") != row.get("bathrooms"):
            bathroom_changes.append(
                {
                    "external_id": eid,
                    "before": before.get("bathrooms"),
                    "after": row.get("bathrooms"),
                }
            )

        before_eff = resolve_effective_neighbourhood(
            source_name=before.get("source_neighbourhood_text"),
            map_name=before.get("inferred_neighbourhood_name"),
            ai_candidate_name=None,
        )
        after_eff = resolve_effective_neighbourhood(
            source_name=row.get("source_neighbourhood_text"),
            map_name=row.get("inferred_neighbourhood_name"),
            ai_candidate_name=None,
        )
        if (
            before_eff.name != after_eff.name
            or before_eff.provenance != after_eff.provenance
        ):
            eff_nb_changes.append(
                {
                    "external_id": eid,
                    "before": before_eff.as_dict(),
                    "after": after_eff.as_dict(),
                    "source_neighbourhood_text": row.get("source_neighbourhood_text"),
                    "map_neighbourhood": row.get("inferred_neighbourhood_name"),
                }
            )

    # Semantic checksum impact of the v0.4.1 import alone: isolate coordinate /
    # map-neighbourhood additions on the current Labs row (other parser fields
    # are already applied equally on both sides of the comparison).
    semantic_changed = []
    for row in rows:
        eid = str(row["external_id"])
        after_row = dict(row)
        after_sum = compute_input_checksum(listing_to_enrichment_input(after_row))
        before_row = dict(row)
        before_row["latitude"] = None
        before_row["longitude"] = None
        before_row["coordinates_source"] = None
        before_row["inferred_neighbourhood_id"] = None
        before_row["inferred_neighbourhood_name"] = None
        before_row["neighbourhood_assignment_status"] = "missing_coords"
        before_row["neighbourhood_assignment_method"] = None
        before_row["neighbourhood_assignment_confidence"] = None
        before_sum = compute_input_checksum(listing_to_enrichment_input(before_row))
        if before_sum != after_sum:
            semantic_changed.append(
                {
                    "external_id": eid,
                    "listing_id": row["id"],
                    "before_semantic": before_sum,
                    "after_semantic": after_sum,
                    "effective_after": (
                        listing_to_enrichment_input(after_row).deterministic_fields
                        or {}
                    ).get("effective_neighbourhood"),
                    "field_causing_change": "effective_neighbourhood",
                }
            )

    assertions = {
        "remax_listings_220": len(rows) == 220,
        "public_eligible_119": public_eligible == 119,
        "missing_transitions_0_new": new_event_counts.get("missing_from_source", 0)
        == 0,
        "removed_transitions_0_new": new_event_counts.get("removed_from_source", 0)
        == 0,
        "duplicate_external_ids_0": len(ext_ids) == len(set(ext_ids)),
        "duplicate_canonical_urls_0": len(urls) == len(set(urls)),
        "coordinate_coverage_199": len(with_coords) == 199,
        "listings_without_coordinates_21": len(without_coords) == 21,
        "pip_assignments_193": len(inferred) == 193,
        "outside_polygons_6": len(outside) == 6,
        "stable_listing_ids_220": id_stable == 220,
        "prices_stable_220": price_stable == 220,
        "currencies_stable_220": currency_stable == 220,
        "statuses_stable_220": status_stable == 220,
        "urls_stable_220": url_stable == 220,
        "null_replace_0": len(null_replaced) == 0,
        "coords_added_199": coords_added == 199,
        "coord_conflicts_0": coord_conflicts == 0,
        "semantic_changed_exactly_5": len(semantic_changed) == 5,
        "semantic_ids_approved": sorted(x["external_id"] for x in semantic_changed)
        == sorted(APPROVED_SEMANTIC_IDS),
        "import_inserts_0": (import_payload.get("import") or {}).get("imported_count")
        == 0,
        "import_updates_220": (import_payload.get("import") or {}).get("updated_count")
        == 220,
        "no_live_requests": import_payload.get("live_website_requests") is False,
        "no_evidence_uploads": len(import_payload.get("evidence_uploads") or []) == 0,
        "catalog_checksum_match": import_payload.get("catalog_checksum")
        == EXPECTED_CATALOG_CHECKSUM,
        "project_is_labs": ref == "csaefdkpwukshtouyixg",
        "billable_ai_not_over_5": len(semantic_changed) <= 5,
    }
    passed = all(assertions.values())
    stop_before_openai = len(semantic_changed) > 5

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "passed": passed,
        "stop_before_openai": stop_before_openai,
        "assertions": assertions,
        "import_result_summary": {
            "source_run_id": run_id,
            "imported_count": (import_payload.get("import") or {}).get(
                "imported_count"
            ),
            "updated_count": (import_payload.get("import") or {}).get("updated_count"),
            "observation_count": (import_payload.get("import") or {}).get(
                "observation_count"
            ),
            "event_count_reported": (import_payload.get("import") or {}).get(
                "event_count"
            ),
            "adapter_version": import_payload.get("adapter_version"),
            "live_website_requests": import_payload.get("live_website_requests"),
            "network_fetches": import_payload.get("network_fetches"),
            "evidence_uploads": len(import_payload.get("evidence_uploads") or []),
        },
        "labs_counts": {
            "listings": len(rows),
            "public_eligible": public_eligible,
            "with_coordinates": len(with_coords),
            "without_coordinates": len(without_coords),
            "assignment_status": dict(assignment_counts),
            "inferred": len(inferred),
            "outside_polygons": len(outside),
        },
        "deltas": {
            "coordinates_added": coords_added,
            "coordinate_conflicts": coord_conflicts,
            "effective_neighbourhood_changes": len(eff_nb_changes),
            "effective_neighbourhood_change_ids": [
                x["external_id"] for x in eff_nb_changes
            ],
            "effective_neighbourhood_details": eff_nb_changes,
            "image_delta_count": len(image_deltas),
            "image_deltas_sample": image_deltas[:30],
            "bathroom_changes": bathroom_changes,
            "new_observations": len(new_obs),
            "new_lifecycle_events": dict(new_event_counts),
            "null_replaced": null_replaced,
        },
        "semantic_checksum": {
            "changed_count": len(semantic_changed),
            "changed": semantic_changed,
            "approved_ids": list(APPROVED_SEMANTIC_IDS),
        },
        "protected": {
            "id_stable": id_stable,
            "price_stable": price_stable,
            "currency_stable": currency_stable,
            "status_stable": status_stable,
            "url_stable": url_stable,
        },
        "warnings": [],
        "errors": [] if passed else [k for k, v in assertions.items() if not v],
    }
    if stop_before_openai:
        payload["errors"].append(
            f"semantic_changed={len(semantic_changed)} exceeds 5 — stop before OpenAI"
        )

    OUT_JSON.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    md = [
        "# RE/MAX v0.4.1 post-import verification",
        "",
        f"- Passed: **{passed}**",
        f"- Listings: **{len(rows)}**",
        f"- Public eligible: **{public_eligible}**",
        f"- Coordinates: **{len(with_coords)}** / without **{len(without_coords)}**",
        f"- PIP inferred: **{len(inferred)}** / outside **{len(outside)}**",
        f"- Coords added: **{coords_added}** / conflicts **{coord_conflicts}**",
        f"- Effective neighbourhood changes: **{len(eff_nb_changes)}**",
        f"- Semantic checksum changes: **{len(semantic_changed)}**",
        f"- New missing/removed events: **{new_event_counts.get('missing_from_source', 0)}** / "
        f"**{new_event_counts.get('removed_from_source', 0)}**",
        f"- Stop before OpenAI: **{stop_before_openai}**",
        "",
        "## Assertions",
        "",
    ]
    for key, ok in assertions.items():
        md.append(f"- {'OK' if ok else 'FAIL'}: `{key}`")
    OUT_MD.write_text("\n".join(md) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "wrote": str(OUT_JSON).replace("\\", "/"),
                "passed": passed,
                "stop_before_openai": stop_before_openai,
                "coords": len(with_coords),
                "semantic_changed": len(semantic_changed),
                "failed": [k for k, v in assertions.items() if not v],
            },
            indent=2,
        )
    )
    return 0 if passed and not stop_before_openai else 1


if __name__ == "__main__":
    raise SystemExit(main())
