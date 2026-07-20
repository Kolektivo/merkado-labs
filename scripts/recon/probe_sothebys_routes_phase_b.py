"""Phase B: global Sotheby's network routes for Curaçao (no WAF bypass)."""

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
    "request unsuccessful",
)


def is_challenge(status: int | None, body: bytes, headers: dict) -> tuple[bool, str | None]:
    text = body[:6000].decode("utf-8", "replace").lower() if body else ""
    if status in (401, 403, 202):
        return True, f"http_{status}"
    for marker in CHALLENGE_MARKERS:
        if marker in text:
            return True, f"marker:{marker}"
    # empty body on robots/HTML endpoints often indicates interstitial
    ctype = (headers.get("Content-Type") or "").lower()
    if status == 200 and len(body) == 0 and "text" in ctype:
        return True, "empty_body"
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
                for k in (
                    "Server",
                    "CF-RAY",
                    "Content-Type",
                    "Location",
                    "x-amz-cf-id",
                    "x-cache",
                    "via",
                )
            }
            entry.update(
                {
                    "status": resp.status,
                    "final_url": resp.geturl(),
                    "headers": headers,
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest() if body else None,
                    "preview": body[:700].decode("utf-8", "replace"),
                }
            )
            chal, reason = is_challenge(resp.status, body, headers)
            entry["challenge"] = chal
            entry["challenge_reason"] = reason
            safe = label.replace("/", "_")
            if chal:
                (OUT / f"{safe}.challenge.txt").write_text(
                    f"status={resp.status}\nreason={reason}\n"
                    f"final={entry.get('final_url')}\n"
                    f"headers={json.dumps(headers)}\n"
                    f"preview=\n{entry['preview'][:1000]}",
                    encoding="utf-8",
                )
            else:
                (OUT / f"{safe}.bin").write_bytes(body)
                meta = dict(entry)
                (OUT / f"{safe}.meta.json").write_text(
                    json.dumps(meta, indent=2), encoding="utf-8"
                )
    except HTTPError as err:
        body = err.read(5000) if err.fp else b""
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
                "preview": body[:700].decode("utf-8", "replace"),
            }
        )
        chal, reason = is_challenge(err.code, body, headers)
        entry["challenge"] = chal
        entry["challenge_reason"] = reason
        safe = label.replace("/", "_")
        (OUT / f"{safe}.challenge.txt").write_text(
            f"status={err.code}\nreason={reason}\npreview=\n{entry['preview'][:1000]}",
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
    n = [0]

    # Distinct official network routes only — one attempt each.
    targets = [
        ("net_robots", "https://www.sothebysrealty.com/robots.txt"),
        ("net_sitemap", "https://www.sothebysrealty.com/sitemap.xml"),
        ("net_office_curacaosir", "https://www.sothebysrealty.com/curacaosir/eng"),
        ("net_office_curacaosir_https", "https://www.sothebysrealty.com/curacaosir/eng/"),
        ("net_sales_cr_cuw", "https://www.sothebysrealty.com/eng/sales/cr-cuw"),
        ("net_sales_curacao_cu", "https://www.sothebysrealty.com/eng/sales/curacao-cu"),
        ("net_rentals_cr_cuw", "https://www.sothebysrealty.com/eng/rentals/cr-cuw"),
        ("net_office_search", "https://www.sothebysrealty.com/eng/associates/office/curacao"),
        ("net_app_sir_office", "https://app.sir.com/curacaosir"),
        ("net_apex_sales_cr_cuw", "https://sothebysrealty.com/eng/sales/cr-cuw"),
    ]

    for label, url in targets:
        probe(url, label, results, n)

    (REPORT / "phase_b.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("REQ_COUNT", n[0])
    print("WROTE", REPORT / "phase_b.json")


if __name__ == "__main__":
    main()
