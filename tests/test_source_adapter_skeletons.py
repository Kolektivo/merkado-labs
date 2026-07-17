"""Contract tests for blocked / recon-only source adapters."""

from __future__ import annotations

from pathlib import Path

import pytest

from merkado_labs.scrapers.adapters.monumentenzorg_curacao import (
    MonumentenzorgCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.sothebys_curacao import SothebysCuracaoAdapter
from merkado_labs.scrapers.contracts import SourceRunOutcome


@pytest.mark.parametrize(
    ("adapter", "source_key"),
    [
        (MonumentenzorgCuracaoAdapter(), "monumentenzorg_curacao"),
        (SothebysCuracaoAdapter(), "sothebys_curacao"),
    ],
)
def test_blocked_adapters_expose_identity_and_fail_safely(adapter, source_key: str) -> None:
    assert adapter.source_key == source_key
    record, snapshots = adapter.run_bounded(
        listing_urls=[], cache_dir=Path("data/raw/test"), dry_run=True, max_items=1
    )
    assert record.outcome == SourceRunOutcome.FAILURE
    assert snapshots == []


def test_sothebys_parser_is_explicitly_unimplemented() -> None:
    with pytest.raises(NotImplementedError):
        SothebysCuracaoAdapter().parse_listing_html(
            "",
            listing_url="https://www.sothebysrealty.com/eng/sales/curacao-cu/example",
            raw_sha256="a" * 64,
        )


def test_monumentenzorg_fixture_parser_works_offline() -> None:
    html = """
    <html><body><h1>Heritage House</h1>
    <p>Price ANG 450.000</p>
    </body></html>
    """
    snap = MonumentenzorgCuracaoAdapter().parse_listing_html(
        html,
        listing_url="https://www.monumentenzorg.cw/listings/heritage-house",
        raw_sha256="b" * 64,
    )
    assert snap.external_id == "heritage-house"
    assert snap.original_price is not None
    assert snap.original_price.currency == "ANG"
    assert "live_access_blocked_ssl_or_dns" in snap.warnings
