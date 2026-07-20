"""Patch activation final report with protected-field and idempotency sections."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    final_path = ROOT / "data/processed/kw_activation_final_report.json"
    md_path = ROOT / "data/processed/kw_activation_final_report.md"
    final = json.loads(final_path.read_text(encoding="utf-8"))
    prot = json.loads(
        (ROOT / "data/processed/kw_terra_protected_fields_checksum.json").read_text(
            encoding="utf-8"
        )
    )
    idem = json.loads(
        (ROOT / "data/processed/kw_terra_idempotency_check.json").read_text(
            encoding="utf-8"
        )
    )
    retry = json.loads(
        (ROOT / "data/processed/kw_terra_retry_candidates.json").read_text(
            encoding="utf-8"
        )
    )
    final["protected_source_field_verification"] = prot
    final["idempotency"] = {
        "skipped": idem["result"]["skipped"],
        "exact_cost_usd": idem["result"]["exact_cost_usd"],
        "proposals_unchanged": idem["proposals_before"] == idem["proposals_after"],
        "events_unchanged": idem["events_before"] == idem["events_after"],
    }
    final["batch_notes"] = [
        "Initial remaining-79 run used max_output_tokens=2500; many structured outputs truncated.",
        "Default max_output_tokens raised to 3500; continuation recovered unprocessed listings.",
        "24 invalid_output failures remain in kw_terra_retry_candidates.json (not executed).",
        "First job process raced after operator stop; final Labs state reconciled from DB.",
    ]
    final["retry_candidates"] = {
        "count": retry.get("count"),
        "external_ids": retry.get("external_ids"),
        "reason": retry.get("reason"),
        "proposed_command": retry.get("proposed_command"),
    }
    final_path.write_text(
        json.dumps(final, indent=2, default=str) + "\n", encoding="utf-8"
    )
    md = md_path.read_text(encoding="utf-8").rstrip()
    extra = "\n".join(
        [
            "",
            "## Protected source fields",
            "",
            f"- Unchanged by AI auto-apply: {prot['source_facts_unchanged_by_ai_auto_apply']}",
            f"- Checksum: `{prot['protected_field_checksum_sha256']}`",
            "",
            "## Idempotency",
            "",
            f"- Skipped unchanged: {idem['result']['skipped']}/84",
            f"- Cost: USD {idem['result']['exact_cost_usd']}",
            (
                "- Proposals/events unchanged: "
                f"{idem['proposals_before'] == idem['proposals_after']} / "
                f"{idem['events_before'] == idem['events_after']}"
            ),
            "",
        ]
    )
    md_path.write_text(md + "\n" + extra, encoding="utf-8")
    print(
        json.dumps(
            {
                "enriched": final["enriched_count"],
                "failed": final["failed"],
                "cost": final["total_terra_cost_usd"],
                "violations": len(final.get("policy_violations") or []),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
