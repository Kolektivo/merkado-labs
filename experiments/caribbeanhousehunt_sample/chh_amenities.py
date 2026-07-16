"""CHH amenity code mapping from public map UI evidence only."""

from __future__ import annotations

from typing import Any

# Labels observed on caribbeanhousehunt.com map filter HTML (EN).
# Codes 2, 3, 5, 7, 10, 12, 17 appear in bulk data but have no public UI label.
CHH_AMENITY_LABELS: dict[int, str] = {
    1: "Waterfront",
    4: "Scenic view",
    6: "Furnished",
    8: "Solar panels",
    9: "Deep well",
    11: "Swimming pool",
    13: "Outdoor kitchen/bbq",
    14: "Garage / carport",
    15: "High ceilings",
    16: "Porch / balcony",
    18: "Home office",
    19: "Guest apartment",
    20: "Sea view",
    21: "Pets allowed",
    22: "Short term rental permitted",
}

AMENITY_EVIDENCE = (
    "CHH map filter checkbox labels on /curacao/map/ "
    "(experiments/caribbeanhousehunt_recon/evidence/map-page.html)"
)


def normalize_amenity_codes(raw_amenities: Any) -> list[dict[str, Any]]:
    """Map CHH amenity codes to evidence-backed labels; never invent names."""

    if not isinstance(raw_amenities, list):
        return []
    seen: set[int] = set()
    result: list[dict[str, Any]] = []
    for item in raw_amenities:
        try:
            code = int(item)
        except (TypeError, ValueError):
            continue
        if code in seen:
            continue
        seen.add(code)
        label = CHH_AMENITY_LABELS.get(code)
        result.append(
            {
                "code": code,
                "label": label,
                "label_status": "mapped" if label is not None else "unlabeled",
                "evidence": AMENITY_EVIDENCE if label is not None else None,
            }
        )
    return sorted(result, key=lambda row: row["code"])


def amenity_labels(amenities: list[dict[str, Any]]) -> list[str]:
    """Return only labels that have public evidence."""

    return [str(row["label"]) for row in amenities if row.get("label")]
