"""Source readiness for Data Operations (manual pipelines only)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ReadinessVerdict = Literal["ready", "partial", "blocked"]

PIPELINE_STAGES = (
    "preflight",
    "scraping",
    "validation",
    "import",
    "location",
    "ai_enrichment",
    "verification",
)

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
FORBIDDEN_PROJECT_REF = "jkrfyvukhhsapoivntms"


@dataclass(frozen=True)
class SourceReadiness:
    source_key: str
    display_name: str
    adapter_version: str
    readiness: ReadinessVerdict
    listing_count_expected: int | None
    catalog_status: str
    current_issue: str | None
    primary_action: str
    blocker_kind: str | None
    allows_full_refresh: bool
    allows_lifecycle_absence: bool
    notes: str


SOURCE_READINESS: dict[str, SourceReadiness] = {
    "keller_williams_curacao": SourceReadiness(
        source_key="keller_williams_curacao",
        display_name="Keller Williams Curaçao",
        adapter_version="0.3.0",
        readiness="ready",
        listing_count_expected=84,
        catalog_status="complete",
        current_issue=None,
        primary_action="Refresh & enrich",
        blocker_kind=None,
        allows_full_refresh=True,
        allows_lifecycle_absence=True,
        notes="Full catalog imported; Terra-enriched; manual/unscheduled.",
    ),
    "remax_curacao": SourceReadiness(
        source_key="remax_curacao",
        display_name="RE/MAX Curaçao",
        adapter_version="0.4.1",
        readiness="ready",
        listing_count_expected=220,
        catalog_status="complete",
        current_issue=(
            "Adapter v0.4.1 active (220 listings; coordinates 199/220; "
            "map neighbourhood 193 inferred / 6 outside polygons). "
            "Manual/unscheduled. Normal Refresh & enrich bills new/changed only; "
            "initial ~215 Terra backfill needs separate approval."
        ),
        primary_action="Refresh & enrich",
        blocker_kind=None,
        allows_full_refresh=True,
        allows_lifecycle_absence=True,
        notes=(
            "Adapter v0.4.1 deterministic import applied (offline, manual). "
            "Coordinate coverage 199/220; point-in-polygon 193; Terra canary 5/5. "
            "Initial never-enriched Terra backfill is not part of Refresh & enrich."
        ),
    ),
    "moret_real_estate": SourceReadiness(
        source_key="moret_real_estate",
        display_name="Moret Real Estate",
        adapter_version="0.1.1",
        readiness="partial",
        listing_count_expected=5,
        catalog_status="bounded_sample",
        current_issue="Full catalog not proven; only five-listing sample imported",
        primary_action="Continue setup",
        blocker_kind=None,
        allows_full_refresh=False,
        allows_lifecycle_absence=False,
        notes="Expand after catalog completeness QA; no missing/removed on partial.",
    ),
    "monumentenzorg_curacao": SourceReadiness(
        source_key="monumentenzorg_curacao",
        display_name="Monumentenzorg Curaçao",
        adapter_version="0.1.1",
        readiness="blocked",
        listing_count_expected=None,
        catalog_status="blocked",
        current_issue="SSL/DNS failure; partner or official feed needed",
        primary_action="Blocked",
        blocker_kind="ssl_dns_failure",
        allows_full_refresh=False,
        allows_lifecycle_absence=False,
        notes="Do not bypass SSL/DNS. Fixture parser only until access restored.",
    ),
    "sothebys_curacao": SourceReadiness(
        source_key="sothebys_curacao",
        display_name="Sotheby's International Realty",
        adapter_version="0.1.1",
        readiness="blocked",
        listing_count_expected=None,
        catalog_status="blocked",
        current_issue="WAF / access controls block automated fetch (HTTP 202)",
        primary_action="Blocked",
        blocker_kind="waf_restriction",
        allows_full_refresh=False,
        allows_lifecycle_absence=False,
        notes="Official feed or approved access required. No WAF bypass.",
    ),
}


def resolve_source_readiness(source_key: str) -> SourceReadiness:
    key = (source_key or "").strip()
    if key not in SOURCE_READINESS:
        raise ValueError(f"Unknown property source_key: {source_key!r}")
    return SOURCE_READINESS[key]


def ready_source_keys() -> list[str]:
    return [
        item.source_key
        for item in SOURCE_READINESS.values()
        if item.readiness == "ready" and item.allows_full_refresh
    ]


def assert_can_enqueue_full_refresh(source_key: str) -> SourceReadiness:
    info = resolve_source_readiness(source_key)
    if info.readiness == "blocked":
        raise PermissionError(
            f"{info.display_name} is blocked: {info.current_issue}"
        )
    if info.readiness == "partial" or not info.allows_full_refresh:
        raise PermissionError(
            f"{info.display_name} is partial — continue setup; "
            "full Refresh & enrich is not allowed until the catalog is proven."
        )
    return info


def filter_run_all_ready(source_keys: list[str] | None = None) -> list[str]:
    """Exclude partial and blocked sources automatically."""

    candidates = source_keys or list(SOURCE_READINESS.keys())
    ready = []
    for key in candidates:
        info = resolve_source_readiness(key)
        if info.readiness == "ready" and info.allows_full_refresh:
            ready.append(key)
    return ready


def assert_labs_project_ref(project_ref: str) -> str:
    ref = (project_ref or "").strip()
    if ref == FORBIDDEN_PROJECT_REF:
        raise PermissionError("Production project is forbidden")
    if ref != LABS_PROJECT_REF:
        raise PermissionError(f"Refusing non-Labs project ref {ref!r}")
    return ref
