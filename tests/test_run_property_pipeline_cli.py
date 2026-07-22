"""Regression tests for scripts/run_property_pipeline.py CLI contracts."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run_property_pipeline.py"


def _load_cli():
    spec = importlib.util.spec_from_file_location("run_property_pipeline_cli", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_scheduled_and_manual_requested_by_is_github_actions() -> None:
    cli = _load_cli()
    assert cli.resolve_requested_by("scheduled") == "github_actions"
    assert cli.resolve_requested_by("manual") == "github_actions"
    assert cli.resolve_requested_by("dry_run") == "github_actions"
    assert cli.resolve_requested_by("local") == "local_cli"


def test_exit_code_non_zero_for_completed_with_errors() -> None:
    cli = _load_cli()
    assert cli.exit_code_for_status("completed") == 0
    assert cli.exit_code_for_status("completed_with_errors") == 1
    assert cli.exit_code_for_status("failed") == 1
    assert cli.exit_code_for_status(None) == 1
