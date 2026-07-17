"""Bounded Moret recon fetch for fixtures (manual only)."""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

INDEX = "https://moretrealestate.com/properties/"
OUT_DIR = Path("tests/fixtures")
UA = "MerkadoLabsResearch/0.1 (+local; recon only)"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8", "replace")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index_html = fetch(INDEX)
    (OUT_DIR / "moret_sample_index.html").write_text(index_html[:150_000], encoding="utf-8")
    links = re.findall(
        r'href=["\'](https?://(?:www\.)?moretrealestate\.com/[^"\']+)["\']',
        index_html,
        flags=re.I,
    )
    # Prefer property detail paths, skip nav/wp assets
    detail = []
    for link in links:
        low = link.lower()
        if any(x in low for x in ("/wp-", "/category", "/tag/", "#", "mailto:", "javascript:")):
            continue
        if "/property" in low or "/en/" in low or "/nl/" in low or "/properties/" in low:
            if low.rstrip("/") != INDEX.rstrip("/") and link not in detail:
                detail.append(link)
    print("index_bytes", len(index_html), "candidate_links", len(detail))
    print("sample_links", detail[:12])
    if detail:
        detail_html = fetch(detail[0])
        (OUT_DIR / "moret_sample_detail.html").write_text(detail_html[:150_000], encoding="utf-8")
        print("detail", detail[0], "bytes", len(detail_html))
        title = re.search(r"<title[^>]*>([^<]+)", detail_html, re.I)
        print("title", title.group(1).strip() if title else None)


if __name__ == "__main__":
    main()
