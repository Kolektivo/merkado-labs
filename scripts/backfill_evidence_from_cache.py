"""Upload cached HTML evidence for KW/Moret listings missing Storage objects."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from merkado_labs.scrapers.http_cache import _cache_key  # noqa: E402
from merkado_labs.scrapers.import_pipeline import create_labs_client  # noqa: E402
from merkado_labs.scrapers.raw_storage import upload_raw_html  # noqa: E402

CACHE_DIRS = {
    "keller_williams_curacao": Path("data/raw/keller_williams_curacao/cache"),
    "moret_real_estate": Path("data/raw/moret_real_estate/cache"),
}


def main() -> int:
    client = create_labs_client()
    uploaded = 0
    missing_cache = 0
    for source_key, cache_dir in CACHE_DIRS.items():
        print("cache_dir", cache_dir, "exists", cache_dir.exists())
        if cache_dir.exists():
            print("files", len(list(cache_dir.glob("*"))))
        src = (
            client.table("property_sources")
            .select("id")
            .eq("source_key", source_key)
            .single()
            .execute()
            .data
        )
        rows = (
            client.table("property_listings")
            .select("id,external_id,source_url")
            .eq("property_source_id", src["id"])
            .execute()
            .data
            or []
        )
        for row in rows:
            key = _cache_key(row["source_url"])
            body_path = cache_dir / f"{key}.html"
            meta_path = cache_dir / f"{key}.meta.json"
            if not body_path.exists():
                missing_cache += 1
                continue
            meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
            checksum = meta.get("sha256") or hashlib.sha256(body_path.read_bytes()).hexdigest()
            upload_raw_html(
                source_key=source_key,
                external_id=row["external_id"],
                checksum=checksum,
                html_bytes=body_path.read_bytes(),
                client=client,
            )
            uploaded += 1
            print(f"uploaded {source_key}:{row['external_id']}")
    print(json.dumps({"uploaded": uploaded, "missing_cache": missing_cache}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
