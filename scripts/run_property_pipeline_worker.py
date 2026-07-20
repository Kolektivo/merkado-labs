"""Claim and process one queued manual Property Data Operations run.

Never scheduled. Safe default does not launch live catalog crawls or paid AI.

Examples:
  python scripts/run_property_pipeline_worker.py --once
  python scripts/run_property_pipeline_worker.py --once --execute-live
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.pipeline.worker import run_once  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.kw_import_preview import (  # noqa: E402
    LABS_PROJECT_REF,
    assert_labs_project_ref,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process at most one queued run then exit",
    )
    parser.add_argument(
        "--execute-live",
        action="store_true",
        help=(
            "Allow live scrape/import/AI stages. Default is orchestration-safe: "
            "progress updates without launching a full catalog crawl or paid AI."
        ),
    )
    args = parser.parse_args()
    if not args.once:
        raise SystemExit("Only --once is supported (no schedules / no daemon loop)")

    ref = assert_labs_project_ref()
    if ref != LABS_PROJECT_REF:
        raise SystemExit(f"Refusing non-Labs project {ref!r}")

    client = create_labs_client()
    result = run_once(client, execute_live=bool(args.execute_live))
    if result is None:
        print(json.dumps({"ok": True, "message": "No queued pipeline runs"}))
        return 0
    print(json.dumps({"ok": True, "run": result}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
