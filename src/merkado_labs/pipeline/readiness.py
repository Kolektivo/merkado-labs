"""Source readiness for Labs Data Operations and the automation foundation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from merkado_labs.pipeline.sources import READY_SOURCE_ORDER

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
        adapter_version="0.3.1",
        readiness="ready",
        listing_count_expected=84,
        catalog_status="complete",
        current_issue=None,
        primary_action="Refresh & enrich",
        blocker_kind=None,
        allows_full_refresh=True,
        allows_lifecycle_absence=True,
        notes=(
            "Full catalog imported and Terra-enriched. Automatic daily refresh "
            "enabled at 06:00 Curaçao (cron 0 10 * * * UTC)."
        ),
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
            "Terra-v3 initial backfill complete (220/220). "
            "Daily automation enabled at 06:00 Curaçao. Normal Refresh & enrich "
            "bills new/changed only; "
            "any future full re-enrichment still requires separate approval."
        ),
        primary_action="Refresh & enrich",
        blocker_kind=None,
        allows_full_refresh=True,
        allows_lifecycle_absence=True,
        notes=(
            "Adapter v0.4.1 deterministic import applied (offline, manual). "
            "Coordinate coverage 199/220; point-in-polygon 193; Terra-v3 "
            "initial backfill complete (220/220). Normal Refresh & enrich "
            "bills new/changed only. Daily cron 0 10 * * * UTC enabled."
        ),
    ),
    "moret_real_estate": SourceReadiness(
        source_key="moret_real_estate",
        display_name="Moret Real Estate",
        adapter_version="0.2.0",
        readiness="ready",
        listing_count_expected=71,
        catalog_status="complete",
        current_issue=(
            "First complete catalog established (71). Terra-v3 initial backfill "
            "complete (71/71). Normal Refresh & enrich remains new/changed only. "
            "Daily automation enabled at 06:00 Curaçao."
        ),
        primary_action="Refresh & enrich",
        blocker_kind=None,
        allows_full_refresh=True,
        allows_lifecycle_absence=True,
        notes=(
            "Adapter v0.2.0 activated 2026-07-20: offline complete import 66 insert / "
            "5 update; public eligible 71; Terra-v3 initial backfill complete "
            "(canary + remaining 66; cumulative ~USD 1.94). "
            "Normal Refresh & enrich bills new/changed only. Daily cron enabled."
        ),
    ),
    "monumentenzorg_curacao": SourceReadiness(
        source_key="monumentenzorg_curacao",
        display_name="Monumentenzorg Curaçao",
        adapter_version="0.2.0",
        readiness="ready",
        listing_count_expected=5,
        catalog_status="complete",
        current_issue=(
            "First complete catalog established (5). Terra-v3 initial backfill "
            "complete (5/5). Coordinates 0/5 (source has none). Normal Refresh & "
            "enrich remains new/changed only. Daily automation enabled at 06:00 Curaçao."
        ),
        primary_action="Refresh & enrich",
        blocker_kind=None,
        allows_full_refresh=True,
        allows_lifecycle_absence=True,
        notes=(
            "Adapter v0.2.0 activated 2026-07-20: offline complete import 5/5; "
            "public eligible 2; Terra-v3 initial backfill complete "
            "(canary 2 + remaining 3; cumulative ~USD 0.06). "
            "Heritage /our_property/ CPT remains out of scope. "
            "Normal Refresh & enrich bills new/changed only. Daily cron enabled."
        ),
    ),
    "sothebys_curacao": SourceReadiness(
        source_key="sothebys_curacao",
        display_name="Sotheby's International Realty",
        adapter_version="0.1.2",
        readiness="blocked",
        listing_count_expected=None,
        catalog_status="access_route_under_investigation",
        current_issue=(
            "BLOCKED (2026-07-20 recon): affiliate TLS expired/mismatched; "
            "www.sothebysrealty.com inventory/office/robots/sitemap return HTTP 202 "
            "WAF/challenge; app.sir.com/curacaosir is an office shell without catalog "
            "HTML. Approved public route or partner feed/API still required."
        ),
        primary_action="Blocked",
        blocker_kind="waf_restriction",
        allows_full_refresh=False,
        allows_lifecycle_absence=False,
        notes=(
            "Not Ready. Verdict BLOCKED — no complete legitimate public catalog route. "
            "No WAF bypass, no browser automation, no verify=False. Next: official "
            "affiliate feed/export or Anywhere partner API with written approval."
        ),
    ),
}


def resolve_source_readiness(source_key: str) -> SourceReadiness:
    key = (source_key or "").strip()
    if key not in SOURCE_READINESS:
        raise ValueError(f"Unknown property source_key: {source_key!r}")
    return SOURCE_READINESS[key]


def ready_source_keys() -> list[str]:
    return [
        key
        for key in READY_SOURCE_ORDER
        if SOURCE_READINESS[key].readiness == "ready"
        and SOURCE_READINESS[key].allows_full_refresh
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

    candidates = source_keys or list(READY_SOURCE_ORDER)
    ready = []
    for key in candidates:
        info = resolve_source_readiness(key)
        if info.readiness == "ready" and info.allows_full_refresh:
            ready.append(key)
    requested = set(ready)
    return [key for key in READY_SOURCE_ORDER if key in requested]


def assert_labs_project_ref(project_ref: str) -> str:
    ref = (project_ref or "").strip()
    if ref == FORBIDDEN_PROJECT_REF:
        raise PermissionError("Production project is forbidden")
    if ref != LABS_PROJECT_REF:
        raise PermissionError(f"Refusing non-Labs project ref {ref!r}")
    return ref
