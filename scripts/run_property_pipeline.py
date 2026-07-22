"""Run one Labs property pipeline orchestration from GitHub Actions or locally."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.pipeline.orchestrator import run_property_pipeline  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402

# GHA scheduled/manual/dry_run provenance; only explicit local stays local_cli.
_GITHUB_ACTIONS_TRIGGERS = frozenset({"scheduled", "manual", "dry_run"})


def _source_keys(value: str | None) -> list[str] | None:
    if not value:
        return None
    return [token.strip() for token in value.split(",") if token.strip()]


def resolve_requested_by(trigger_type: str) -> str:
    """Map CLI trigger provenance to property_pipeline_runs.requested_by."""

    return (
        "github_actions"
        if trigger_type in _GITHUB_ACTIONS_TRIGGERS
        else "local_cli"
    )


def exit_code_for_status(status: str | None) -> int:
    """Non-zero for failed and completed_with_errors so GHA surfaces partial failures."""

    return 0 if status == "completed" else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--trigger-type",
        choices=("scheduled", "manual", "local", "dry_run"),
        default="local",
    )
    parser.add_argument(
        "--source-keys",
        help="Comma-separated ready source keys; defaults to all ready sources",
    )
    parser.add_argument("--pipeline-run-id")
    parser.add_argument("--once", action="store_true", help="Compatibility flag; one run only")
    parser.add_argument("--dry-run", action="store_true", help="Scrape without import or paid AI")
    parser.add_argument(
        "--execute-live",
        action="store_true",
        help="Execute adapter, import, and budget-approved enrichment stages",
    )
    args = parser.parse_args()

    keys = _source_keys(args.source_keys)
    trigger_type = "dry_run" if args.dry_run else args.trigger_type
    client = create_labs_client()
    result = run_property_pipeline(
        client,
        trigger_type=trigger_type,
        source_keys=keys,
        pipeline_run_id=args.pipeline_run_id,
        dry_run=args.dry_run,
        requested_by=resolve_requested_by(args.trigger_type),
        execute_live=args.execute_live,
    )
    print(json.dumps({"ok": True, "run": result}, indent=2, default=str))
    return exit_code_for_status(result.get("status"))


if __name__ == "__main__":
    raise SystemExit(main())
