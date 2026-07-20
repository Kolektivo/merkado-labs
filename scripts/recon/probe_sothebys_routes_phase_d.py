"""Phase D: final bounded official probes (feeds/terms/alternate paths)."""

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
DELAY = 2.1
CTX = ssl.create_default_context(cafile=certifi.where())


def is_challenge(status: int | None, body: bytes) -> tuple[bool, str | None]:
    text = body[:6000].decode("utf-8", "replace").lower() if body else ""
    if status in (401, 403, 202):
        return True, f"http_{status}"
    for marker in (
        "cf-browser-verification",
        "challenge-platform",
        "just a moment",
        "attention required",
        "cf-challenge",
        "enable javascript and cookies",
        "captcha",
        "access denied",
    ):
        if marker in text:
            return True, f"marker:{marker}"
    return False, None


def probe(url: str, label: str, results: list, n: list[int]) -> dict:
    if n[0] > 0:
        time.sleep(DELAY)
    n[0] += 1
    req = Request(url, headers={"User-Agent": UA}, method="GET")
    entry: dict = {"label": label, "url": url, "request_n": n[0]}
    try:
        with urlopen(req, timeout=35, context=CTX) as resp:
            body = resp.read()
            headers = {
                k: resp.headers.get(k)
                for k in ("Server", "CF-RAY", "Content-Type", "Location")
            }
            entry.update(
                {
                    "status": resp.status,
                    "final_url": resp.geturl(),
                    "headers": headers,
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest() if body else None,
                    "preview": body[:500].decode("utf-8", "replace"),
                }
            )
            chal, reason = is_challenge(resp.status, body)
            entry["challenge"] = chal
            entry["challenge_reason"] = reason
            safe = label.replace("/", "_")
            if chal:
                (OUT / f"{safe}.challenge.txt").write_text(
                    f"status={resp.status}\nreason={reason}\npreview=\n{entry['preview']}",
                    encoding="utf-8",
                )
            else:
                (OUT / f"{safe}.bin").write_bytes(body)
                (OUT / f"{safe}.meta.json").write_text(
                    json.dumps(entry, indent=2), encoding="utf-8"
                )
    except HTTPError as err:
        body = err.read(3000) if err.fp else b""
        entry.update(
            {
                "status": err.code,
                "error": str(err.reason),
                "bytes": len(body),
                "preview": body[:500].decode("utf-8", "replace"),
            }
        )
        chal, reason = is_challenge(err.code, body)
        entry["challenge"] = chal
        entry["challenge_reason"] = reason
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
    n = [0]
    targets = [
        ("net_terms", "https://www.sothebysrealty.com/eng/terms-of-use"),
        ("net_privacy", "https://www.sothebysrealty.com/eng/privacy-policy"),
        ("net_rss", "https://www.sothebysrealty.com/eng/rss"),
        ("net_feeds", "https://www.sothebysrealty.com/feeds"),
        ("sir_broker_id_path", "https://app.sir.com/180-b-83973-20079517"),
        ("net_country_curacao", "https://www.sothebysrealty.com/eng/sales/curacao"),
        ("net_region_caribbean", "https://www.sothebysrealty.com/eng/sales/caribbean"),
    ]
    for label, url in targets:
        probe(url, label, results, n)
    (REPORT / "phase_d.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("REQ_COUNT", n[0])
    print("WROTE", REPORT / "phase_d.json")


if __name__ == "__main__":
    main()
