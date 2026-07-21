"""Catalog-size anomaly gates for complete-source lifecycle safety."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CatalogAnomaly:
    source_key: str
    prior_count: int
    discovered_count: int
    anomalous: bool
    reason: str | None
    change_ratio: float | None

    def __bool__(self) -> bool:
        return self.anomalous


def evaluate_catalog_anomaly(
    source_key: str,
    prior_count: int,
    discovered_count: int,
    *,
    # 15% catches the obsolete KW 84-vs-~104 stale-cache false complete;
    # still allows small day-to-day listing churn.
    decrease_threshold: float = 0.15,
    increase_threshold: float = 0.50,
) -> CatalogAnomaly:
    """Flag material catalog changes before absence lifecycle processing."""

    prior = max(0, int(prior_count))
    discovered = max(0, int(discovered_count))
    if prior == 0:
        return CatalogAnomaly(source_key, prior, discovered, False, None, None)

    ratio = (discovered - prior) / prior
    anomalous = ratio <= -decrease_threshold or ratio >= increase_threshold
    reason = None

    # This source's complete baseline is five. A single listing movement is
    # expected and explicitly allowed; three or fewer must fail closed.
    if source_key == "monumentenzorg_curacao" and prior == 5:
        anomalous = discovered <= 3 or discovered >= 8

    if anomalous:
        direction = "decrease" if discovered < prior else "increase"
        reason = (
            f"catalog_{direction}:{prior}->{discovered} "
            f"({abs(ratio):.1%} change)"
        )
    return CatalogAnomaly(source_key, prior, discovered, anomalous, reason, ratio)
