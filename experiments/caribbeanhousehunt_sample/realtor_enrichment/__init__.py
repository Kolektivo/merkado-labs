"""Adapter registry for original-realtor enrichment."""

from __future__ import annotations

from pathlib import Path

from .adapters.remax_bonbini import RemaxBonbiniAdapter
from .base import DomainAdapter, PolicyBlockedAdapter, detect_conflicts, select_adapter

DEFAULT_CACHE_DIR = Path(__file__).resolve().parent / "cache"


def registered_adapters(cache_dir: Path | None = None) -> list[DomainAdapter]:
    """Return concrete domain adapters ready for use."""

    cache = cache_dir or DEFAULT_CACHE_DIR
    return [RemaxBonbiniAdapter(cache_dir=cache)]


def all_adapters(cache_dir: Path | None = None) -> list[DomainAdapter]:
    """Return registered adapters plus the policy fallback."""

    return [*registered_adapters(cache_dir), PolicyBlockedAdapter()]


__all__ = [
    "DomainAdapter",
    "PolicyBlockedAdapter",
    "RemaxBonbiniAdapter",
    "all_adapters",
    "detect_conflicts",
    "registered_adapters",
    "select_adapter",
]
