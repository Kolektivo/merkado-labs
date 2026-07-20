import hashlib
import json
from pathlib import Path

from merkado_labs.scrapers.adapters.keller_williams_curacao import (
    KellerWilliamsCuracaoAdapter,
    load_neighbourhood_lexicon,
)

dry = json.loads(Path("data/processed/kw_catalog_dry_run.json").read_text(encoding="utf-8"))
cache = Path("data/raw/keller_williams_curacao/cache")
adapter = KellerWilliamsCuracaoAdapter()
lex = load_neighbourhood_lexicon()
for eid in ["RL-42", "RL-44", "ZK2423", "ZK2611"]:
    item = next(x for x in dry["listings"] if x["external_id"] == eid)
    key = hashlib.sha256(item["url"].encode()).hexdigest()
    html = (cache / f"{key}.html").read_text(encoding="utf-8", errors="replace")
    snap = adapter.parse_listing_html(
        html, listing_url=item["url"], raw_sha256="0" * 64, neighbourhood_lexicon=lex
    )
    print(
        eid,
        "lat",
        snap.latitude,
        "lng",
        snap.longitude,
        "loc",
        snap.location_text,
        "nbh",
        snap.neighbourhood_text,
    )
