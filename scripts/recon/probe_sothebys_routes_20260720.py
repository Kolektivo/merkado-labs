"""Bounded polite recon for Sotheby's Curaçao official routes.

No WAF bypass, no browser automation, no proxies, no verify=False.
Sequential requests with >=2s delay. Max 60 requests.
"""

from __future__ import annotations

import hashlib
import json
import ssl
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import certifi

UA = "MerkadoLabs-PropertyAdapter/0.1 (+https://github.com/merkado; research)"
OUT = Path("data/raw/sothebys_recon_20260720")
REPORT = Path("data/processed/sothebys_recon_20260720")
MAX_REQUESTS = 60
DELAY_SECONDS = 2.1

CHALLENGE_MARKERS = (
    "cf-browser-verification",
    "challenge-platform",
    "just a moment",
    "attention required",
    "cf-challenge",
    "enable javascript and cookies",
    "captcha",
    "access denied",
    "pardon our interruption",
)

CTX = ssl.create_default_context(cafile=certifi.where())


def is_challenge(status: int | None, body: bytes, headers: dict) -> tuple[bool, str | None]:
    text = body[:4000].decode("utf-8", "replace").lower() if body else ""
    server = (headers.get("Server") or "").lower()
    if status in (401, 403):
        return True, f"http_{status}"
    if status == 202:
        return True, "http_202"
    for marker in CHALLENGE_MARKERS:
        if marker in text:
            return True, f"marker:{marker}"
    if "cloudflare" in server and status not in (200, 301, 302, 303, 307, 308):
        return True, "cloudflare_non_200"
    return False, None


def probe(url: str, label: str, results: list, counters: dict, *, save: bool = True) -> dict:
    if counters["n"] >= MAX_REQUESTS:
        entry = {"label": label, "url": url, "skipped": True, "reason": "max_requests"}
        results.append(entry)
        print(json.dumps(entry))
        return entry
    if counters["n"] > 0:
        time.sleep(DELAY_SECONDS)
    counters["n"] += 1
    req = Request(url, headers={"User-Agent": UA}, method="GET")
    entry: dict = {"label": label, "url": url, "request_n": counters["n"]}
    try:
        with urlopen(req, timeout=30, context=CTX) as resp:
            body = resp.read()
            headers = {
                k: resp.headers.get(k)
                for k in ("Server", "CF-RAY", "Content-Type", "Location", "x-robots-tag")
            }
            entry.update(
                {
                    "status": resp.status,
                    "final_url": resp.geturl(),
                    "headers": headers,
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(),
                    "preview": body[:500].decode("utf-8", "replace"),
                }
            )
            chal, reason = is_challenge(resp.status, body, headers)
            entry["challenge"] = chal
            entry["challenge_reason"] = reason
            if save:
                safe = label.replace("/", "_")
                if chal:
                    (OUT / f"{safe}.challenge.txt").write_text(
                        f"status={resp.status}\nreason={reason}\npreview=\n{entry['preview'][:800]}",
                        encoding="utf-8",
                    )
                else:
                    (OUT / f"{safe}.bin").write_bytes(body)
                    (OUT / f"{safe}.meta.json").write_text(
                        json.dumps(entry, indent=2), encoding="utf-8"
                    )
    except HTTPError as err:
        body = err.read(4000) if err.fp else b""
        headers = (
            {k: err.headers.get(k) for k in ("Server", "CF-RAY", "Content-Type")}
            if err.headers
            else {}
        )
        entry.update(
            {
                "status": err.code,
                "error": str(err.reason),
                "headers": headers,
                "bytes": len(body),
                "preview": body[:500].decode("utf-8", "replace"),
            }
        )
        chal, reason = is_challenge(err.code, body, headers)
        entry["challenge"] = chal
        entry["challenge_reason"] = reason
        if save:
            safe = label.replace("/", "_")
            (OUT / f"{safe}.challenge.txt").write_text(
                f"status={err.code}\nreason={reason}\npreview=\n{entry['preview'][:800]}",
                encoding="utf-8",
            )
    except (URLError, TimeoutError, OSError) as err:
        entry.update({"status": None, "error": repr(err), "challenge": False})
    results.append(entry)
    print(
        json.dumps(
            {
                k: entry.get(k)
                for k in (
                    "label",
                    "status",
                    "challenge",
                    "challenge_reason",
                    "final_url",
                    "bytes",
                    "error",
                )
            },
            ensure_ascii=False,
        )
    )
    return entry


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    REPORT.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    counters = {"n": 0}

    phase_a = [
        ("aff_apex", "https://curacaosothebysrealty.com/"),
        ("aff_www", "https://www.curacaosothebysrealty.com/"),
        ("aff_robots", "https://curacaosothebysrealty.com/robots.txt"),
        ("aff_www_robots", "https://www.curacaosothebysrealty.com/robots.txt"),
        ("aff_sitemap", "https://curacaosothebysrealty.com/sitemap.xml"),
        ("aff_www_sitemap", "https://www.curacaosothebysrealty.com/sitemap.xml"),
        ("aff_sitemap_index", "https://curacaosothebysrealty.com/sitemap_index.xml"),
        ("aff_wp_sitemap", "https://curacaosothebysrealty.com/wp-sitemap.xml"),
        ("aff_properties", "https://curacaosothebysrealty.com/properties/"),
        ("aff_listings", "https://curacaosothebysrealty.com/listings/"),
        ("aff_for_sale", "https://curacaosothebysrealty.com/for-sale/"),
        ("aff_buy", "https://curacaosothebysrealty.com/buy/"),
        ("aff_rent", "https://curacaosothebysrealty.com/rent/"),
        ("aff_search", "https://curacaosothebysrealty.com/search/"),
    ]

    for label, url in phase_a:
        probe(url, label, results, counters)

    (REPORT / "phase_a.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("REQ_COUNT", counters["n"])
    print("WROTE", REPORT / "phase_a.json")


if __name__ == "__main__":
    main()
