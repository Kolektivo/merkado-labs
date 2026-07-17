"""Source-neutral raw evidence helpers for listing pages.

Preserves listing-specific content while excluding page chrome.
Full HTML belongs in private object storage; queryable fields hold
cleaned text, structured evidence, checksums, and storage references.
"""

from __future__ import annotations

import hashlib
import html as html_lib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

TAG_RE = re.compile(r"<[^>]+>", re.DOTALL)
SCRIPT_STYLE_RE = re.compile(
    r"<(script|style|noscript|svg)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
BLOCK_CLOSE_RE = re.compile(
    r"</(p|div|li|h[1-6]|tr|section|article)>",
    re.IGNORECASE,
)
WS_RE = re.compile(r"[ \t]+")
MULTI_NL_RE = re.compile(r"\n{3,}")


@dataclass(frozen=True)
class RawSourceEvidence:
    """Queryable metadata + cleaned listing evidence for one fetch."""

    source_url: str
    source_key: str
    external_id: str
    fetched_at: datetime
    http_status: int
    content_type: str | None
    adapter_version: str
    response_checksum: str
    storage_path: str | None
    storage_bucket: str | None
    source_description: str | None
    source_description_html: str | None
    source_description_checksum: str | None
    cleaned_listing_text: str | None
    structured_data: dict[str, Any] = field(default_factory=dict)
    page_sections: dict[str, Any] = field(default_factory=dict)
    image_urls: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()

    def to_raw_payload(self) -> dict[str, Any]:
        """Serializable observation raw_payload (no full HTML blob)."""

        payload = asdict(self)
        payload["fetched_at"] = self.fetched_at.isoformat()
        payload["image_urls"] = list(self.image_urls)
        payload["warnings"] = list(self.warnings)
        return payload


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def decode_html_entities(value: str) -> str:
    """Decode HTML entities without collapsing whitespace."""

    return html_lib.unescape(value)


def html_to_preserved_text(fragment: str) -> str:
    """Convert an HTML fragment to readable text preserving paragraphs."""

    text = COMMENT_RE.sub("", fragment)
    text = SCRIPT_STYLE_RE.sub("", text)
    text = BR_RE.sub("\n", text)
    text = BLOCK_CLOSE_RE.sub("\n", text)
    text = re.sub(r"<(li|h[1-6])\b[^>]*>", "\n", text, flags=re.I)
    text = TAG_RE.sub("", text)
    text = decode_html_entities(text)
    lines = [WS_RE.sub(" ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    return MULTI_NL_RE.sub("\n\n", "\n".join(lines)).strip()


def extract_json_ld_blocks(html: str) -> list[dict[str, Any]]:
    """Return parsed JSON-LD objects when present and valid."""

    blocks: list[dict[str, Any]] = []
    pattern = re.compile(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(?P<body>.*?)</script>',
        re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(html):
        raw = match.group("body").strip()
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            blocks.append(parsed)
        elif isinstance(parsed, list):
            blocks.extend(item for item in parsed if isinstance(item, dict))
    return blocks


def strip_chrome_hints(text: str) -> str:
    """Drop common RE/MAX / portal chrome lines from cleaned text."""

    drop_prefixes = (
        "in an international environment like",
        "the information on this website is for general informational",
        "re/max bonbini makes no representation",
        "re/max bonbini can not be held liable",
        "cookie",
        "privacy policy",
        "follow us",
        "share this",
    )
    kept: list[str] = []
    for paragraph in re.split(r"\n{2,}", text):
        lowered = paragraph.casefold().strip()
        if any(lowered.startswith(prefix) for prefix in drop_prefixes):
            continue
        if "objects are listed in various currencies" in lowered:
            continue
        kept.append(paragraph.strip())
    return "\n\n".join(p for p in kept if p).strip()


def evidence_storage_path(
    *,
    source_key: str,
    external_id: str,
    checksum: str,
    extension: str = "html",
) -> str:
    """Deterministic private storage object path for one listing payload."""

    return f"{source_key}/{external_id}/{checksum}.{extension}"
