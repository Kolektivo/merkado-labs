"""Inspect Moret detail fixture patterns."""

from __future__ import annotations

import re
from pathlib import Path

h = Path("tests/fixtures/moret_sample_detail.html").read_text(encoding="utf-8")
print("bytes", len(h))
title = re.search(r"<title[^>]*>([^<]+)", h, re.I)
print("title", title.group(1).strip() if title else None)
h1 = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.I | re.S)
print("h1", re.sub(r"<[^>]+>", "", h1.group(1)).strip() if h1 else None)

for label, pat in [
    ("price_span", r'class="[^"]*price[^"]*"[^>]*>[^<]{0,80}'),
    ("xcg_price", r"XCG\s*([\d.]+)"),
    ("post_id", r'data-postid=["\'](\d+)'),
    ("property_id", r'"property_id"\s*:\s*"?(\d+)'),
    ("bedrooms", r"(?:bedroom|slaapkamer)[^0-9]{0,40}(\d+)"),
    ("bathrooms", r"(?:bathroom|badkamer)[^0-9]{0,40}(\d+)"),
    ("status", r"(?:status|ribbon)[^<]{0,60}"),
]:
    ms = list(re.finditer(pat, h, re.I | re.S))
    print(label, "n=", len(ms), "first=", (ms[0].group(0)[:140] if ms else None))

for m in re.finditer(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', h, re.I | re.S
):
    print("JSONLD", m.group(1)[:400].replace("\n", " "))
