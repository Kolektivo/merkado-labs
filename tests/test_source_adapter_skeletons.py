"""Contract tests for blocked / partial source adapters."""

from __future__ import annotations

from pathlib import Path

import pytest

from merkado_labs.scrapers.adapters.monumentenzorg_curacao import (
    ADAPTER_VERSION,
    MonumentenzorgCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.sothebys_curacao import SothebysCuracaoAdapter
from merkado_labs.scrapers.contracts import SourceRunOutcome
from tests.fixtures.monumentenzorg_html import DETAIL_VILLA_MARIA


def test_sothebys_adapter_exposes_identity_and_fails_safely() -> None:
    adapter = SothebysCuracaoAdapter()
    assert adapter.source_key == "sothebys_curacao"
    assert adapter.version == "0.1.2"
    record, snapshots = adapter.run_bounded(
        listing_urls=[], cache_dir=Path("data/raw/test"), dry_run=True, max_items=1
    )
    assert record.outcome == SourceRunOutcome.FAILURE
    assert snapshots == []
    assert record.metadata.get("complete_catalog") is False
    assert record.metadata.get("recon", {}).get("verdict") == "BLOCKED"


def test_sothebys_parser_is_explicitly_unimplemented() -> None:
    with pytest.raises(NotImplementedError):
        SothebysCuracaoAdapter().parse_listing_html(
            "",
            listing_url="https://www.sothebysrealty.com/eng/sales/curacao-cu/example",
            raw_sha256="a" * 64,
        )


def test_monumentenzorg_adapter_v020_parses_offline_fixture() -> None:
    adapter = MonumentenzorgCuracaoAdapter()
    assert adapter.source_key == "monumentenzorg_curacao"
    assert adapter.version == ADAPTER_VERSION == "0.2.0"
    snap = adapter.parse_listing_html(
        DETAIL_VILLA_MARIA,
        listing_url="https://monumentenzorg.cw/properties/villa-maria/",
        raw_sha256="b" * 64,
    )
    assert snap.external_id == "property-18650"
    assert snap.original_price is not None
    assert snap.original_price.currency == "ANG"
