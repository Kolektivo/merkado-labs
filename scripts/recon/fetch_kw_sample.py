"""One-off KW sample fetch for fixture creation (manual recon only)."""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path

URL = "https://kw-curacao.com/listings/2-bedroom-condo-seaview-JC-0027"
OUT = Path("tests/fixtures/kw_sample_detail.html")


def main() -> None:
    req = urllib.request.Request(
        URL,
        headers={"User-Agent": "MerkadoLabsResearch/0.1 (+local; recon only)"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        html = resp.read().decode("utf-8", "replace")
        status = resp.status
    OUT.write_text(html[:120_000], encoding="utf-8")
    title = re.search(r"<title[^>]*>([^<]+)", html, re.I)
    print("status", status, "len", len(html))
    print("title", title.group(1).strip() if title else None)
    print("wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
