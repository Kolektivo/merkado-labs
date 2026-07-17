"""Polite HTTP recon for Sotheby's and Monumentenzorg (no bypass)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

UA = "MerkadoLabsResearch/0.1 (+local; recon only; no automation)"
OUT = Path("data/processed/source_recon_20260717.json")

TARGETS = {
    "monumentenzorg_robots": "https://www.monumentenzorg.cw/robots.txt",
    "monumentenzorg_home": "https://www.monumentenzorg.cw/",
    "monumentenzorg_alt": "https://monumentenzorgcuracao.com/",
    "sothebys_robots": "https://www.sothebysrealty.com/robots.txt",
    "sothebys_curacao_search": "https://www.sothebysrealty.com/eng/sales/curacao-cu",
    "sothebys_sitemap": "https://www.sothebysrealty.com/sitemap.xml",
}


def probe(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read(8000)
            return {
                "url": url,
                "status": resp.status,
                "content_type": resp.headers.get("Content-Type"),
                "bytes_preview": len(body),
                "preview": body[:400].decode("utf-8", "replace"),
                "server": resp.headers.get("Server"),
                "cf_ray": resp.headers.get("CF-RAY"),
            }
    except urllib.error.HTTPError as err:
        body = err.read(800) if err.fp else b""
        return {
            "url": url,
            "status": err.code,
            "error": str(err.reason),
            "preview": body[:400].decode("utf-8", "replace"),
            "headers": {k: err.headers.get(k) for k in ("Server", "CF-RAY", "Content-Type")},
        }
    except Exception as err:  # noqa: BLE001
        return {"url": url, "status": None, "error": str(err)}


def main() -> None:
    results = {key: probe(url) for key, url in TARGETS.items()}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    summary = {
        key: {"status": value.get("status"), "error": value.get("error")}
        for key, value in results.items()
    }
    print(json.dumps(summary, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
