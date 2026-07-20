"""Probe KW cached HTML for agent/coords/amenities patterns."""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data/raw/keller_williams_curacao/cache"
DRY_RUN = ROOT / "data/processed/kw_catalog_dry_run.json"


def main() -> None:
    data = json.loads(DRY_RUN.read_text(encoding="utf-8"))
    agent_names: Counter[str] = Counter()
    miss_coords: list[str] = []
    amenity_hits = 0
    for item in data["listings"]:
        url = item["url"]
        key = hashlib.sha256(url.encode()).hexdigest()
        html = (CACHE / f"{key}.html").read_text(encoding="utf-8", errors="replace")
        m = re.search(
            r'class=["\']card-agent__name["\'][^>]*>'
            r"(.*?)"
            r'</div>\s*<div class=["\']card-agent__position',
            html,
            re.I | re.S,
        )
        if m:
            name = re.sub(r"<[^>]+>", "", m.group(1))
            name = re.sub(r"\s+", " ", name).strip()
            if name:
                agent_names[name] += 1
        if not re.search(r"latLng:\s*\{\s*lat:\s*(-?\d+\.\d+)", html):
            miss_coords.append(item["external_id"])
        if re.search(r'id=["\']amenities["\']', html, re.I):
            amenity_hits += 1
        elif re.search(r"(?i)class=[\"'][^\"']*amenities", html):
            amenity_hits += 1

    print("agents", len(agent_names), agent_names.most_common())
    print("no_coords", miss_coords)
    print("amenity_section_hits", amenity_hits)

    # Sample first listing land/build/type/options
    item = data["listings"][0]
    key = hashlib.sha256(item["url"].encode()).hexdigest()
    html = (CACHE / f"{key}.html").read_text(encoding="utf-8", errors="replace")
    print("sample", item["external_id"])
    print(
        "type",
        re.search(r"page-property-details__type[^>]*>([^<]+)<", html).group(1).strip()
        if re.search(r"page-property-details__type[^>]*>([^<]+)<", html)
        else None,
    )
    print("options", re.findall(r"option__value[^>]*>([^<]+)", html)[:12])
    print(
        "coords",
        re.search(
            r"latLng:\s*\{\s*lat:\s*(-?\d+\.\d+)\s*,\s*lng:\s*(-?\d+\.\d+)", html
        ).groups()
        if re.search(r"latLng:\s*\{\s*lat:\s*(-?\d+\.\d+)\s*,\s*lng:\s*(-?\d+\.\d+)", html)
        else None,
    )
    # Look near map for other amenity lists
    for label in ("Garage", "Pool", "Garden", "Airco", "Furnished", "Parking"):
        print(label, len(re.findall(label, html, re.I)))


if __name__ == "__main__":
    main()
