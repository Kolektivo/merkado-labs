"""Build KW attribute candidate report from local catalog + cache (no network/AI)."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from merkado_labs.enrichment.attributes import write_attribute_candidate_report  # noqa: E402
from merkado_labs.scrapers.adapters.keller_williams_curacao import (  # noqa: E402
    KellerWilliamsCuracaoAdapter,
)


def _cache_body(url: str, cache_dir: Path) -> tuple[bytes, str] | None:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    path = cache_dir / f"{key}.html"
    if not path.exists():
        # Dry-run may store under content sha instead of URL sha.
        return None
    body = path.read_bytes()
    return body, hashlib.sha256(body).hexdigest()


def main() -> int:
    catalog_path = Path("data/processed/kw_catalog_dry_run.json")
    cache_dir = Path("data/raw/keller_williams_curacao/cache")
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    listings = catalog.get("listings") or []
    adapter = KellerWilliamsCuracaoAdapter(cache_dir=cache_dir)

    # Index cache by content sha for dry-run raw_sha256 joins.
    by_sha: dict[str, Path] = {}
    for path in cache_dir.glob("*.html"):
        body = path.read_bytes()
        by_sha[hashlib.sha256(body).hexdigest()] = path

    enriched: list[dict] = []
    parsed = 0
    for item in listings:
        row = dict(item)
        url = str(item.get("url") or item.get("source_url") or "")
        body: bytes | None = None
        sha = str(item.get("raw_sha256") or "")
        cached = _cache_body(url, cache_dir) if url else None
        if cached:
            body, sha = cached
        elif sha and sha in by_sha:
            body = by_sha[sha].read_bytes()
        if body and url:
            try:
                snap = adapter.parse_listing_html(
                    body.decode("utf-8", errors="replace"),
                    listing_url=url,
                    raw_sha256=sha or hashlib.sha256(body).hexdigest(),
                )
                row["description"] = snap.description or snap.cleaned_listing_text
                row["title"] = snap.title or row.get("title")
                row["structured_evidence"] = snap.structured_evidence
                row["amenities"] = list(snap.amenities)
                parsed += 1
            except Exception:  # noqa: BLE001
                pass
        enriched.append(row)

    payload = write_attribute_candidate_report(
        enriched,
        json_path=Path("data/processed/kw_attribute_candidates.json"),
        md_path=Path("data/processed/kw_attribute_candidates.md"),
    )
    print(
        json.dumps(
            {
                "listings": len(enriched),
                "parsed_from_cache": parsed,
                "candidates": payload["attribute_count"],
                "auto_schema_creation": False,
                "auto_filter_creation": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
