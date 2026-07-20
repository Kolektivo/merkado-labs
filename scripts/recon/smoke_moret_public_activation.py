"""Phase 6: publishable-key public projection smoke for Moret activation."""

from __future__ import annotations

import json
import re
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data/processed/moret_public_activation_smoke.json"
FORBIDDEN = [
    "confidence",
    "needs_attention",
    "evidence_snippet",
    "token_usage",
    "cost_usd",
    "field_decisions",
    "prompt_version",
    "schema_version",
    "listing-raw-evidence",
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
    if "csaefdkpwukshtouyixg" not in url:
        raise SystemExit(f"Refusing non-Labs URL: {url}")
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def leaks(obj) -> list[str]:
    text = json.dumps(obj, default=str)
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
        "bathrooms,floor_area_m2,lot_area_value,source_display_name,"
        "listing_type,source_url,description,primary_image_url,"
        "source_listing_status,amenities&source_key=eq.moret_real_estate"
        "&order=external_id",
    )
    leak_hits = leaks(rows)
    sample = rows[:3] if rows else []
    from_price_samples = []
    for row in rows:
        attrs = row.get("public_attributes") or []
        if isinstance(attrs, str):
            attrs = json.loads(attrs)
        for attr in attrs if isinstance(attrs, list) else []:
            if "from" in str(attr.get("key", "")).lower() or "from" in str(
                attr.get("value", "")
            ).lower():
                from_price_samples.append(
                    {"external_id": row["external_id"], "attr": attr}
                )
    # also check description/title aren't leaking internals
    attribution_ok = all(
        (r.get("source_display_name") or "").lower().find("moret") >= 0 for r in rows
    )
    xcg_primary = all(r.get("benchmark_price_xcg") is not None for r in rows)
    has_original = all(
        r.get("original_price") is not None and r.get("original_currency") for r in rows
    )
    has_images = sum(1 for r in rows if r.get("primary_image_url"))
    has_desc = sum(1 for r in rows if r.get("description"))
    has_nb = sum(1 for r in rows if r.get("effective_neighbourhood"))
    has_source_url = sum(1 for r in rows if r.get("source_url"))

    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "phase": 6,
        "project_url_labs": "csaefdkpwukshtouyixg" in env["NEXT_PUBLIC_SUPABASE_URL"],
        "public_moret_count": len(rows),
        "expected_public_count": 71,
        "count_match": len(rows) == 71,
        "source_attribution_ok": attribution_ok,
        "xcg_primary_present": xcg_primary,
        "original_price_currency_present": has_original,
        "effective_neighbourhood_count": has_nb,
        "descriptions": has_desc,
        "images": has_images,
        "source_urls": has_source_url,
        "bedrooms_present": sum(1 for r in rows if r.get("bedrooms") is not None),
        "bathrooms_present": sum(1 for r in rows if r.get("bathrooms") is not None),
        "forbidden_leak_terms": leak_hits,
        "no_forbidden_leaks": not leak_hits,
        "from_price_public_attr_samples": from_price_samples[:5],
        "sample_listings": [
            {
                "id": r.get("id"),
                "external_id": r.get("external_id"),
                "title": r.get("title"),
                "listing_type": r.get("listing_type"),
                "benchmark_price_xcg": r.get("benchmark_price_xcg"),
                "original_price": r.get("original_price"),
                "original_currency": r.get("original_currency"),
                "effective_neighbourhood": r.get("effective_neighbourhood"),
                "effective_neighbourhood_provenance": r.get(
                    "effective_neighbourhood_provenance"
                ),
                "property_type": r.get("property_type") or r.get("effective_property_type"),
                "source_url": r.get("source_url"),
                "source_display_name": r.get("source_display_name"),
            }
            for r in sample
        ],
        "passed": len(rows) == 71
        and attribution_ok
        and xcg_primary
        and has_original
        and not leak_hits
        and has_desc == 71
        and has_images == 71
        and has_source_url == 71,
    }
    OUT.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "passed": payload["passed"],
                "public_moret_count": payload["public_moret_count"],
                "no_forbidden_leaks": payload["no_forbidden_leaks"],
            },
            indent=2,
        )
    )
    return 0 if payload["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
