"""Inspect cached app.sir.com/curacaosir HTML for public catalog signals."""

from __future__ import annotations

import json
import re
from pathlib import Path

SRC = Path("data/raw/sothebys_recon_20260720/net_app_sir_office.bin")
OUT = Path("data/processed/sothebys_recon_20260720/app_sir_office_inspect.json")


def main() -> None:
    body = SRC.read_text(encoding="utf-8", errors="replace")
    hrefs = re.findall(r"""href=["']([^"']+)["']""", body, re.I)
    scripts = re.findall(r"""<script[^>]+src=["']([^"']+)["']""", body, re.I)
    titles = re.findall(r"<title[^>]*>(.*?)</title>", body, re.I | re.S)
    metas = [
        m
        for m in re.findall(r"<meta[^>]+>", body, re.I)
        if any(k in m.lower() for k in ("description", "og:", "canonical", "robots"))
    ]
    json_ld = re.findall(
        r"""<script[^>]*type=["']application/ld\+json["'][^>]*>(.*?)</script>""",
        body,
        re.I | re.S,
    )
    # Extract absolute/relative URLs that look inventory-related
    inventoryish = [
        h
        for h in hrefs
        if any(
            tok in h.lower()
            for tok in (
                "sale",
                "rent",
                "listing",
                "property",
                "home",
                "inventory",
                "search",
                "curacao",
                "cuw",
            )
        )
    ]
    # Look for embedded config / API hints without calling them
    api_hints = sorted(
        set(
            re.findall(
                r"""https?://[^\s"'<>]+(?:api|graphql|feed|sitemap)[^\s"'<>]*""",
                body,
                re.I,
            )
        )
    )
    token_counts = {
        pat: body.lower().count(pat)
        for pat in (
            "listing",
            "property",
            "for sale",
            "for rent",
            "inventory",
            "api",
            "graphql",
            "curacao",
            "curaçao",
            "cuw",
            "mls",
            "sothebysrealty.com",
        )
    }
    report = {
        "bytes": len(body.encode("utf-8", errors="replace")),
        "titles": [t.strip() for t in titles],
        "metas": metas[:30],
        "href_count": len(hrefs),
        "hrefs": hrefs,
        "inventoryish_hrefs": inventoryish,
        "script_srcs": scripts,
        "json_ld_count": len(json_ld),
        "json_ld_previews": [j.strip()[:800] for j in json_ld[:5]],
        "api_hints": api_hints[:40],
        "token_counts": token_counts,
        "body_preview": body[:1500],
        "has_noscript_listings": bool(
            re.search(r"noscript.*?listing|listing.*?noscript", body, re.I | re.S)
        ),
        "looks_like_spa_shell": (
            "<div id=\"root\"" in body.lower()
            or "<div id=\"app\"" in body.lower()
            or "window.__" in body
            or body.count("<a ") < 5
        ),
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in (
        "bytes", "titles", "href_count", "inventoryish_hrefs", "script_srcs",
        "json_ld_count", "api_hints", "token_counts", "looks_like_spa_shell",
        "has_noscript_listings",
    )}, indent=2, ensure_ascii=False))
    print("WROTE", OUT)


if __name__ == "__main__":
    main()
