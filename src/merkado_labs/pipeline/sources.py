"""Approved source order and schedule metadata for the Labs property pipeline."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

READY_SOURCE_ORDER = (
    "monumentenzorg_curacao",
    "moret_real_estate",
    "keller_williams_curacao",
    "remax_curacao",
)

CACHE_DIRS = {
    source_key: Path("data/raw") / source_key / "cache"
    for source_key in READY_SOURCE_ORDER
}

CURACAO_TZ = "America/Curacao"
DAILY_CRON_UTC = "0 10 * * *"  # Enabled: 10:00 UTC / 06:00 America/Curacao.


def ordered_ready_keys(source_keys: Iterable[str] | None = None) -> list[str]:
    """Return allowed ready sources in deterministic, duplicate-free order."""

    if source_keys is None:
        return list(READY_SOURCE_ORDER)
    requested = {str(key).strip() for key in source_keys if str(key).strip()}
    unknown = requested - set(READY_SOURCE_ORDER)
    if unknown:
        raise ValueError(f"Sources are not automation-ready: {sorted(unknown)}")
    return [key for key in READY_SOURCE_ORDER if key in requested]
