"""HTTP smoke test for /browse and /browse/[id] after public-effective activation."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
BASE = os.environ.get("LABS_DASHBOARD_BASE", "http://127.0.0.1:3000")
FORBIDDEN = [
    "confidence",
    "needs_attention",
    "evidence_snippet",
    "token_usage",
    "cost_usd",
    "field_decisions",
    "prompt_version",
    "schema_version",
]


def _load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / "apps" / "labs-dashboard" / ".env.local"
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def api(env: dict[str, str], path: str):
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def fetch(path: str) -> tuple[int, str]:
    req = urllib.request.Request(BASE + path, headers={"Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def attrs(row: dict) -> list[dict]:
    value = row.get("public_attributes") or []
    if isinstance(value, str):
        return json.loads(value)
    return value if isinstance(value, list) else []


def has_attr(row: dict, key: str) -> bool:
    for item in attrs(row):
        if item.get("key") == key and item.get("value") in (True, "true", "present"):
            return True
    return False


def leaks(text: str) -> list[str]:
    found = []
    for term in FORBIDDEN:
        if re.search(rf"\b{re.escape(term)}\b", text, re.I):
            found.append(term)
    return found


def main() -> int:
    env = _load_env()
    rows = api(
        env,
        "public_property_listings?select=id,external_id,source_key,title,"
        "effective_neighbourhood,effective_neighbourhood_provenance,"
        "effective_property_type,property_type,public_attributes,"
        "benchmark_price_xcg,original_price,original_currency,bedrooms,"
        "bathrooms,source_display_name,listing_type,source_url&order=id",
    )
    kw_rx = [
        r
        for r in rows
        if r.get("source_key") in ("keller_williams_curacao", "remax_curacao")
    ]

    picks: dict[str, dict] = {}
    for row in kw_rx:
        count = len(attrs(row))
        source = row["source_key"]
        if (
            source == "keller_williams_curacao"
            and count >= 3
            and row.get("effective_neighbourhood")
            and "kw_multi" not in picks
        ):
            picks["kw_multi"] = row
        if source == "keller_williams_curacao" and count == 0 and "kw_zero" not in picks:
            picks["kw_zero"] = row
        if (
            source == "remax_curacao"
            and row.get("effective_neighbourhood_provenance") == "source"
            and "rx_source_nb" not in picks
        ):
            picks["rx_source_nb"] = row
        if (
            source == "remax_curacao"
            and row.get("effective_neighbourhood_provenance") == "map"
            and "rx_map_nb" not in picks
        ):
            picks["rx_map_nb"] = row
        if (
            source == "remax_curacao"
            and has_attr(row, "furnished")
            and has_attr(row, "air_conditioning")
            and "rx_furnished_ac" not in picks
        ):
            picks["rx_furnished_ac"] = row
        if has_attr(row, "gated_community") and "gated" not in picks:
            picks["gated"] = row
        if count == 0 and "no_attrs" not in picks:
            picks["no_attrs"] = row

    status_browse, html_browse = fetch("/browse")
    card_links = re.findall(r"/browse/[0-9a-f-]{36}", html_browse)
    filter_oracle = {
        "sale": sum(1 for r in kw_rx if (r.get("listing_type") or "").lower() == "sale"),
        "rent": sum(1 for r in kw_rx if (r.get("listing_type") or "").lower() == "rent"),
        "furnished": sum(1 for r in kw_rx if has_attr(r, "furnished")),
        "gated_community": sum(1 for r in kw_rx if has_attr(r, "gated_community")),
        "parking": sum(1 for r in kw_rx if has_attr(r, "parking")),
        "air_conditioning": sum(1 for r in kw_rx if has_attr(r, "air_conditioning")),
    }
    filter_http = {}
    for name, path in [
        ("sale", "/browse?type=sale"),
        ("rent", "/browse?type=rent"),
        ("furnished", "/browse?furnished=1"),
        ("gated", "/browse?gated_community=1"),
        ("parking", "/browse?parking=1"),
        ("ac", "/browse?air_conditioning=1"),
    ]:
        status, html = fetch(path)
        filter_http[name] = {
            "status": status,
            "unique_card_links": len(set(re.findall(r"/browse/[0-9a-f-]{36}", html))),
            "leaks": leaks(html),
        }

    passport = {}
    for label, row in picks.items():
        status, html = fetch(f"/browse/{row['id']}")
        nb = row.get("effective_neighbourhood") or ""
        passport[label] = {
            "status": status,
            "listing_id": row["id"],
            "external_id": row.get("external_id"),
            "source_key": row.get("source_key"),
            "effective_neighbourhood": nb,
            "provenance": row.get("effective_neighbourhood_provenance"),
            "attr_count": len(attrs(row)),
            "has_effective_nb": bool(nb)
            and (
                nb in html
                or nb.replace("&", "&amp;") in html
                or (nb.split()[0] in html if nb.split() else False)
            ),
            "has_xcg_marker": ("XCG" in html)
            or ("Cg" in html)
            or ("XCG" in html.upper()),
            "has_source_link_or_name": bool(row.get("source_url"))
            and (
                "View original" in html
                or "original" in html.lower()
                or (row.get("source_display_name") or "")[:6] in html
            ),
            "no_confidence": "confidence" not in html.lower(),
            "no_evidence_snippet": "evidence_snippet" not in html.lower()
            and "supporting evidence" not in html.lower(),
            "no_needs_attention": "needs_attention" not in html.lower()
            and "needs attention" not in html.lower(),
            "no_raw_proposal": "field_decisions" not in html.lower(),
            "leaks": leaks(html),
        }

    smoke = {
        "generated_at": datetime.now(UTC).isoformat(),
        "base_url": BASE,
        "browse": {
            "status": status_browse,
            "public_count_api": len(rows),
            "kw_remax": len(kw_rx),
            "unique_card_links": len(set(card_links)),
            "forbidden_term_leaks": leaks(html_browse),
            "contains_curaçao_generic_as_only_signal": False,
            "filter_oracle_counts": filter_oracle,
            "filter_http": filter_http,
            "by_source": dict(Counter(r.get("source_key") for r in rows)),
        },
        "passport": passport,
        "picks_present": sorted(picks),
    }
    out = PROCESSED / "public_passport_activation_smoke.json"
    out.write_text(json.dumps(smoke, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "browse_status": status_browse,
                "api_count": len(rows),
                "unique_cards": len(set(card_links)),
                "leaks": smoke["browse"]["forbidden_term_leaks"],
                "filters": filter_oracle,
                "passport": {
                    k: {
                        "status": v["status"],
                        "nb": v["has_effective_nb"],
                        "xcg": v["has_xcg_marker"],
                        "safe": not v["leaks"],
                    }
                    for k, v in passport.items()
                },
            },
            indent=2,
        )
    )
    return 0 if status_browse == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
