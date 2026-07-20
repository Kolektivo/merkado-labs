"""Cost preflight for the exact 24 failed KW Terra retry batch."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.pricing import (  # noqa: E402
    PRICING_AS_OF,
    PRICING_SOURCE,
    calculate_usage_cost_usd,
    estimate_enrichment_cost,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)

PROCESSED = ROOT / "data" / "processed"
RETRY_FILE = PROCESSED / "kw_terra_retry_candidates.json"
MODEL = "gpt-5.6-terra"
MAX_OUTPUT = 3500
CEILING = 2.0


def main() -> int:
    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")

    retry = json.loads(RETRY_FILE.read_text(encoding="utf-8"))
    listing_ids = [str(x) for x in retry.get("listing_ids") or []]
    if len(listing_ids) != 24 or len(set(listing_ids)) != 24:
        raise SystemExit(f"Retry file must contain exactly 24 unique IDs, got {len(listing_ids)}")

    client = create_labs_client()
    source = (
        client.table("property_sources")
        .select("id")
        .eq("source_key", "keller_williams_curacao")
        .limit(1)
        .execute()
    ).data[0]

    rows = (
        client.table("property_listings")
        .select("id,external_id,enrichment_status,property_source_id")
        .in_("id", listing_ids)
        .execute()
    ).data or []
    by_id = {r["id"]: r for r in rows}
    if len(by_id) != 24:
        raise SystemExit("Retry IDs do not all resolve to Labs listings")

    non_kw = [r for r in rows if r["property_source_id"] != source["id"]]
    if non_kw:
        raise SystemExit("Non-KW listings in retry set")

    non_failed = [
        r for r in rows if r.get("enrichment_status") not in {"failed", "invalid_output"}
    ]
    # enrichment_status uses "failed" for invalid_output proposals
    if non_failed:
        raise SystemExit(
            f"Retry set includes non-failed listings: "
            f"{[r['external_id'] for r in non_failed]}"
        )

    # Confirm no successful latest proposal
    props = (
        client.table("ai_enrichment_proposals")
        .select("property_listing_id,status,generated_at")
        .in_("property_listing_id", listing_ids)
        .eq("model", MODEL)
        .order("generated_at", desc=True)
        .execute()
    ).data or []
    latest: dict[str, str] = {}
    for p in props:
        lid = p["property_listing_id"]
        if lid not in latest:
            latest[lid] = p["status"]
    success_in_retry = [
        lid for lid, status in latest.items() if status in {"needs_review", "succeeded"}
    ]
    if success_in_retry:
        raise SystemExit(f"Successful listings in retry set: {success_in_retry}")

    estimate = estimate_enrichment_cost(model=MODEL, listing_count=24)
    # Compact schema v3 should need less output; keep 3500 ceiling.
    # Use observed KW avg input ~3900 for a more realistic worst case.
    realistic_input = 24 * 4000
    worst_cost, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=realistic_input,
        cached_input_tokens=0,
        output_tokens=24 * MAX_OUTPUT,
    )
    canary_avg = 0.03956
    expected_canary = round(canary_avg * 24, 4)
    # Compact-schema expected: lower output than prior 2500-truncation runs
    expected_compact, _ = calculate_usage_cost_usd(
        model=MODEL,
        input_tokens=realistic_input,
        cached_input_tokens=24 * 2000,
        output_tokens=24 * 1800,
    )

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "source_key": "keller_williams_curacao",
        "model": MODEL,
        "prompt_version": "listing_enrichment_v3",
        "schema_version": "listing_enrichment_schema_v3",
        "policy_version": "enrichment_policy_v3",
        "listing_count": 24,
        "selection_file": str(RETRY_FILE.relative_to(ROOT)).replace("\\", "/"),
        "max_output_tokens_per_listing": MAX_OUTPUT,
        "batch_size": 1,
        "force": True,
        "resume": True,
        "max_estimated_cost_usd": CEILING,
        "expected_cost_usd_default_rates": float(estimate.estimated_usd),
        "expected_cost_usd_from_canary_avg": expected_canary,
        "expected_cost_usd_compact_schema": float(expected_compact or 0),
        "worst_case_cost_usd_3500_output": float(worst_cost or 0),
        "within_ceiling": float(worst_cost or 99) <= CEILING,
        "all_kw": True,
        "all_previously_failed": True,
        "no_successful_listings": True,
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "listing_ids": listing_ids,
        "external_ids": [by_id[i]["external_id"] for i in listing_ids],
        "note": (
            "Compact schema v3 should fit in 3500 output tokens. "
            "4500 reserved only if fixture tests prove 3500 unsafe."
        ),
    }
    out = PROCESSED / "kw_terra_retry_cost_preflight.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))
    if not payload["within_ceiling"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
