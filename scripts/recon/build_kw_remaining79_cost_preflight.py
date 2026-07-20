"""Write remaining-79 cost preflight JSON (no OpenAI calls)."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.config import get_settings  # noqa: E402
from merkado_labs.enrichment.pricing import (  # noqa: E402
    PRICING_AS_OF,
    PRICING_SOURCE,
    calculate_usage_cost_usd,
    cost_from_token_usage,
    estimate_enrichment_cost,
)
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import assert_labs_project_ref  # noqa: E402

SELECTION = ROOT / "data/processed/kw_terra_remaining79_selection.json"
OUT = ROOT / "data/processed/kw_terra_remaining79_cost_preflight.json"
CANARY = frozenset({"001JVD", "ADL-0006", "ZK2423", "JC-003", "ID-002"})
CEILING = 5.0


def main() -> int:
    ref = assert_labs_project_ref()
    settings = get_settings()
    model = (settings.openai_enrichment_model or "").strip()
    if model != "gpt-5.6-terra":
        raise SystemExit(f"Model must be gpt-5.6-terra, got {model!r}")
    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    count = len(selection["listing_ids"])
    if count != 79:
        raise SystemExit(f"Expected 79 selection ids, got {count}")
    if set(selection.get("external_ids") or []) & CANARY:
        raise SystemExit("Canary IDs present in selection")

    max_output = int(settings.openai_enrichment_max_output_tokens or 2500)
    estimate = estimate_enrichment_cost(model=model, listing_count=count)
    worst_cost, worst_note = calculate_usage_cost_usd(
        model=model,
        input_tokens=estimate.input_tokens,
        cached_input_tokens=0,
        output_tokens=count * max_output,
    )
    if worst_cost is None or float(worst_cost) > CEILING:
        raise SystemExit(
            f"Worst-case {worst_cost} exceeds ceiling {CEILING}; "
            f"reduce max_output_tokens (currently {max_output}) or split batch"
        )

    client = create_labs_client()
    canary_rows = (
        client.table("property_listings")
        .select("id,external_id")
        .in_("external_id", list(CANARY))
        .execute()
        .data
        or []
    )
    props = (
        client.table("ai_enrichment_proposals")
        .select("token_usage")
        .in_("property_listing_id", [r["id"] for r in canary_rows])
        .eq("model", model)
        .execute()
        .data
        or []
    )
    canary_tokens = {
        "input_tokens": 0,
        "cached_input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
    }
    for prop in props:
        usage = prop.get("token_usage") or {}
        for key in canary_tokens:
            if isinstance(usage.get(key), int):
                canary_tokens[key] += usage[key]
    canary_cost, _ = cost_from_token_usage(model, canary_tokens)
    canary_n = max(len(props), 1)
    avg_cost = float(canary_cost) / canary_n if canary_cost else None
    expected_from_canary = round(avg_cost * count, 4) if avg_cost else None
    # Rough duration: ~8s per listing including persist.
    expected_duration_minutes = round((count * 8) / 60, 1)

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "project_ref": ref,
        "model": model,
        "listing_count": count,
        "api_calls": count,
        "potential_retry_allowance": count,
        "max_output_tokens_per_listing": max_output,
        "estimated_input_tokens": estimate.input_tokens,
        "estimated_output_tokens_default": estimate.output_tokens,
        "maximum_output_tokens": count * max_output,
        "expected_cost_usd_default_rates": float(estimate.estimated_usd),
        "expected_cost_usd_from_canary_avg": expected_from_canary,
        "canary_observed": {
            "listings": canary_n,
            "token_usage": canary_tokens,
            "total_cost_usd": float(canary_cost) if canary_cost else None,
            "average_cost_usd": avg_cost,
        },
        "conservative_worst_case_cost_usd": float(worst_cost),
        "worst_case_note": worst_note,
        "approved_ceiling_usd": CEILING,
        "within_ceiling": float(worst_cost) <= CEILING,
        "expected_duration_minutes": expected_duration_minutes,
        "pricing_as_of": PRICING_AS_OF,
        "pricing_source": PRICING_SOURCE,
        "selection_file": str(SELECTION.relative_to(ROOT)).replace("\\", "/"),
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
