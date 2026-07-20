"""Local analysis of KW catalog dry-run cache (no network, no DB)."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.scrapers.adapters.keller_williams_curacao import (  # noqa: E402
    KellerWilliamsCuracaoAdapter,
)

CACHE = ROOT / "data/raw/keller_williams_curacao/cache"
DRY_RUN = ROOT / "data/processed/kw_catalog_dry_run.json"


def main() -> None:
    data = json.loads(DRY_RUN.read_text(encoding="utf-8"))
    listings = data["listings"]
    adapter = KellerWilliamsCuracaoAdapter()
    snaps = []
    for item in listings:
        url = item["url"]
        key = hashlib.sha256(url.encode()).hexdigest()
        html = (CACHE / f"{key}.html").read_text(encoding="utf-8", errors="replace")
        snaps.append(
            adapter.parse_listing_html(html, listing_url=url, raw_sha256=item["raw_sha256"])
        )
    n = len(snaps)
    fields = {
        "external_id": lambda s: s.external_id,
        "title": lambda s: s.title,
        "listing_type": lambda s: s.listing_type,
        "source_status": lambda s: s.source_status,
        "lifecycle": lambda s: s.lifecycle_hint,
        "original_price": lambda s: s.original_price,
        "location_text": lambda s: s.location_text,
        "neighbourhood_text": lambda s: s.neighbourhood_text,
        "bedrooms": lambda s: s.bedrooms,
        "bathrooms": lambda s: s.bathrooms,
        "floor_area_m2": lambda s: s.floor_area_m2,
        "lot_area_value": lambda s: s.lot_area_value,
        "property_type": lambda s: s.property_type,
        "description": lambda s: s.description,
        "images": lambda s: s.image_urls,
        "latitude": lambda s: s.latitude,
        "longitude": lambda s: s.longitude,
        "amenities": lambda s: s.amenities,
        "source_listed_at": lambda s: s.source_listed_at,
    }
    print("CURRENT PARSER COVERAGE")
    for name, fn in fields.items():
        pop = sum(1 for s in snaps if fn(s))
        print(f"{name:24} {pop:3}/{n} ({100 * pop / n:5.1f}%)")

    feat_keys: Counter[str] = Counter()
    for s in snaps:
        for key in (s.structured_evidence or {}).get("features", {}):
            feat_keys[key] += 1
    print("FEATURE KEYS", feat_keys.most_common())
    print("warnings", Counter(w for s in snaps for w in s.warnings).most_common(30))
    print("locations", Counter(s.location_text for s in snaps).most_common())
    print("bedrooms", Counter(s.bedrooms for s in snaps).most_common())
    print("bathrooms", Counter(s.bathrooms for s in snaps).most_common())
    print("no_price", [s.external_id for s in snaps if not s.has_positive_price])
    print(
        "unknown_lifecycle",
        [
            (s.external_id, s.source_status)
            for s in snaps
            if s.lifecycle_hint and s.lifecycle_hint.value == "unknown"
        ],
    )

    # Raw HTML signals
    feat_labels: Counter[str] = Counter()
    agent_names: Counter[str] = Counter()
    coords = 0
    half = 0
    full = 0
    beds = 0
    for item in listings:
        url = item["url"]
        key = hashlib.sha256(url.encode()).hexdigest()
        html = (CACHE / f"{key}.html").read_text(encoding="utf-8", errors="replace")
        if re.search(r"latLng:\s*\{\s*lat:\s*(-?\d+\.\d+)\s*,\s*lng:\s*(-?\d+\.\d+)", html):
            coords += 1
        if re.search(r"(?i)<td[^>]*>\s*Full bathrooms\s*<", html):
            full += 1
        if re.search(r"(?i)<td[^>]*>\s*Half bathrooms\s*<", html):
            half += 1
        if re.search(r"(?i)<td[^>]*>\s*Bedrooms\s*<", html):
            beds += 1
        m = re.search(r"card-agent__name[^>]*>(.*?)</div>", html, re.I | re.S)
        if m:
            name = re.sub(r"<[^>]+>", "", m.group(1))
            name = re.sub(r"\s+", " ", name).strip()
            if name:
                agent_names[name] += 1
        for row in re.finditer(
            r"<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>",
            html,
            re.I | re.S,
        ):
            lab = re.sub(r"<[^>]+>", "", row.group(1))
            lab = re.sub(r"\s+", " ", lab).strip()
            if lab and len(lab) < 40:
                feat_labels[lab] += 1
    print("raw_coords", coords, "beds_rows", beds, "full", full, "half", half)
    print("agents", agent_names.most_common())
    print("feat_labels", feat_labels.most_common(40))

    # Category from discovery index pages is not on listings; derive from URL path.
    cats: Counter[str] = Counter()
    for item in listings:
        path = item["url"]
        if "/for-rent/" in path:
            cats["rent"] += 1
        elif "/for-sale/" in path:
            cats["sale_typed"] += 1
        else:
            cats["sale_untyped_or_legacy"] += 1
    print("url_shape", cats)
    # Use discovery categories_seen + listing membership from dry run discovery index
    # Approximate via listing_type in JSON.
    print("listing_type", Counter(i.get("listing_type") for i in listings))


if __name__ == "__main__":
    main()
