"""Source-neutral complete-catalog adapter dispatch for ready Labs sources."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

from merkado_labs.pipeline.sources import CACHE_DIRS, READY_SOURCE_ORDER
from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    KellerWilliamsCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.monumentenzorg_curacao import (
    MonumentenzorgCuracaoAdapter,
)
from merkado_labs.scrapers.adapters.moret_real_estate import MoretRealEstateAdapter
from merkado_labs.scrapers.adapters.remax_curacao import RemaxCuracaoAdapter
from merkado_labs.scrapers.contracts import (
    AdapterListingSnapshot,
    SourceRunOutcome,
    SourceRunRecord,
)


def scrape_source(
    source_key: str,
    cache_dir: Path | str | None = None,
    dry_run: bool = False,
    prior_count: int | None = None,
) -> tuple[SourceRunRecord, list[AdapterListingSnapshot], dict[str, Any]]:
    """Run one complete, uncapped ready-source adapter catalog."""

    if source_key not in READY_SOURCE_ORDER:
        raise PermissionError(f"Source is not automation-ready: {source_key}")
    cache = Path(cache_dir) if cache_dir is not None else CACHE_DIRS[source_key]

    if source_key == "monumentenzorg_curacao":
        adapter = MonumentenzorgCuracaoAdapter(cache_dir=cache)
        record, snapshots, discovery = adapter.run_catalog(
            cache_dir=cache,
            dry_run=dry_run,
            honor_delay=True,
            use_cache=True,
            mode="complete",
        )
        return record, snapshots, {
            "discovery": discovery.as_dict(),
            "request_metrics": adapter.request_metrics.as_dict(),
        }

    if source_key == "moret_real_estate":
        adapter = MoretRealEstateAdapter(cache_dir=cache)
        record, snapshots, discovery = adapter.run_catalog(
            cache_dir=cache,
            dry_run=dry_run,
            honor_delay=True,
            use_cache=True,
        )
        return record, snapshots, {
            "discovery": {
                "termination_reason": discovery.termination_reason,
                "pagination_proven": discovery.pagination_proven,
                "complete_candidate": discovery.complete_candidate,
                "errors": list(discovery.errors),
                "index_pages": discovery.index_pages,
            },
            "request_metrics": adapter.request_metrics.as_dict(),
        }

    if source_key == "keller_williams_curacao":
        adapter = KellerWilliamsCuracaoAdapter(cache_dir=cache)
        record, snapshots, discovery = adapter.run_catalog(
            cache_dir=cache,
            dry_run=dry_run,
            honor_delay=True,
            use_cache=True,
            prior_catalog_count=prior_count,
        )
        return record, snapshots, {
            "discovery": {
                "complete": discovery.discovery_complete,
                "catalog_checksum": discovery.catalog_checksum,
                "categories_seen": sorted(discovery.categories_seen),
                "errors": list(discovery.errors),
                "warnings": list(discovery.warnings),
                "index_pages": discovery.index_pages,
            },
            "request_metrics": adapter.request_metrics.as_dict(),
        }

    adapter = RemaxCuracaoAdapter(cache_dir=cache)
    record, snapshots = adapter.run_bounded(
        cache_dir=cache,
        dry_run=dry_run,
        max_items=None,
        max_pages=None,
        discover=True,
        use_cache=True,
        honor_delay=True,
    )
    discovery_meta = dict(record.metadata.get("discovery") or {})
    # RE/MAX historically treated dry_run itself as a bounded scope. For this
    # source-neutral dispatcher, dry_run controls writes only; the uncapped
    # discovery can still prove a complete catalog.
    if (
        dry_run
        and discovery_meta.get("complete_catalog")
        and not discovery_meta.get("truncated")
        and record.error_count == 0
        and record.parsed_count == record.discovered_count
        and record.discovered_count > 0
    ):
        metadata = {
            **record.metadata,
            "bounded": False,
            "complete_catalog": True,
            "max_items": None,
            "max_pages": None,
        }
        record = replace(record, outcome=SourceRunOutcome.SUCCESS, metadata=metadata)
    return record, snapshots, {
        "discovery": discovery_meta,
        "request_metrics": record.metadata.get("request_metrics") or {},
    }
