"""Shared source-neutral listing image gallery contract.

Normalizes, deduplicates, and caps gallery URLs without downloading binaries.
Image updates are independent from listing lifecycle.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

DEFAULT_GALLERY_SAFETY_CAP = 50

# Query params that are safe to strip for deduplication / display.
_TRACKING_QUERY_KEYS = frozenset(
    {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "fbclid",
        "gclid",
        "mc_cid",
        "mc_eid",
    }
)

_CONTAMINATION_HINTS = re.compile(
    r"("
    r"logo|avatar|icon|favicon|sprite|placeholder|spacer|"
    r"map[_-]?pin|staticmap|googleusercontent\.com/maps|"
    r"/our_property/|agent[_-]?photo|broker[_-]?photo"
    r")",
    re.I,
)

_IMAGE_EXT = re.compile(r"\.(jpe?g|png|webp|gif)(?:$|\?)", re.I)


@dataclass(frozen=True)
class ListingImage:
    original_url: str
    canonical_url: str
    display_url: str
    position: int
    is_primary: bool
    image_type: str | None = None
    source_provenance: str = "listing_gallery"
    content_hash: str | None = None
    warning: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "original_url": self.original_url,
            "canonical_url": self.canonical_url,
            "display_url": self.display_url,
            "position": self.position,
            "is_primary": self.is_primary,
            "image_type": self.image_type,
            "source_provenance": self.source_provenance,
            "content_hash": self.content_hash,
            "warning": self.warning,
        }


@dataclass
class GalleryResult:
    images: list[ListingImage] = field(default_factory=list)
    truncated: bool = False
    safety_cap: int = DEFAULT_GALLERY_SAFETY_CAP
    duplicates_removed: int = 0
    invalid_removed: int = 0
    contamination_removed: int = 0
    warnings: list[str] = field(default_factory=list)

    @property
    def urls(self) -> list[str]:
        return [img.display_url for img in self.images]

    @property
    def primary_url(self) -> str | None:
        for img in self.images:
            if img.is_primary:
                return img.display_url
        return self.images[0].display_url if self.images else None

    def as_dict(self) -> dict[str, Any]:
        return {
            "images": [img.as_dict() for img in self.images],
            "urls": self.urls,
            "primary_url": self.primary_url,
            "truncated": self.truncated,
            "safety_cap": self.safety_cap,
            "duplicates_removed": self.duplicates_removed,
            "invalid_removed": self.invalid_removed,
            "contamination_removed": self.contamination_removed,
            "warnings": list(self.warnings),
        }


def canonicalize_image_url(url: str) -> str:
    """Normalize scheme/host/path and strip safe tracking query params."""

    raw = (url or "").strip()
    if raw.startswith("//"):
        raw = "https:" + raw
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return raw
    query = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.casefold() not in _TRACKING_QUERY_KEYS
    ]
    # Prefer https for public CDNs.
    scheme = "https" if parsed.scheme == "http" else parsed.scheme
    return urlunparse(
        (
            scheme,
            parsed.netloc.casefold(),
            parsed.path,
            "",
            urlencode(query, doseq=True),
            "",
        )
    )


def is_likely_contamination(url: str) -> bool:
    return bool(_CONTAMINATION_HINTS.search(url or ""))


def is_plausible_image_url(url: str) -> bool:
    text = (url or "").strip()
    if not text:
        return False
    if text.startswith("data:"):
        return False
    parsed = urlparse(text if "://" in text or text.startswith("//") else f"https://{text}")
    if parsed.scheme not in {"http", "https", ""} and not text.startswith("//"):
        return False
    if not parsed.netloc and not text.startswith("//"):
        return False
    # Allow CDN paths without extensions (RE/MAX style) when host looks like media.
    if _IMAGE_EXT.search(text):
        return True
    host = parsed.netloc.casefold()
    return any(
        token in host
        for token in ("cdn.", "img.", "images.", "media.", "storage", "uploads")
    )


def build_gallery(
    urls: Sequence[str] | None,
    *,
    primary_url: str | None = None,
    safety_cap: int = DEFAULT_GALLERY_SAFETY_CAP,
    source_provenance: str = "listing_gallery",
) -> GalleryResult:
    """Build an ordered, deduplicated gallery from raw extracted URLs."""

    result = GalleryResult(safety_cap=max(1, int(safety_cap)))
    ordered: list[str] = []
    if primary_url:
        ordered.append(str(primary_url))
    for url in urls or ():
        if url:
            ordered.append(str(url))

    seen: set[str] = set()
    kept: list[str] = []
    for raw in ordered:
        candidate = raw.strip()
        if not candidate:
            result.invalid_removed += 1
            continue
        if candidate.startswith("//"):
            candidate = "https:" + candidate
        if not is_plausible_image_url(candidate):
            result.invalid_removed += 1
            continue
        if is_likely_contamination(candidate):
            result.contamination_removed += 1
            continue
        canonical = canonicalize_image_url(candidate)
        if canonical in seen:
            result.duplicates_removed += 1
            continue
        seen.add(canonical)
        kept.append(canonical)

    if len(kept) > result.safety_cap:
        result.truncated = True
        result.warnings.append(
            f"gallery_truncated_at_{result.safety_cap}"
        )
        kept = kept[: result.safety_cap]

    images: list[ListingImage] = []
    for index, url in enumerate(kept):
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
        images.append(
            ListingImage(
                original_url=url,
                canonical_url=url,
                display_url=url,
                position=index,
                is_primary=index == 0,
                source_provenance=source_provenance,
                content_hash=digest,
                warning=(
                    "truncated"
                    if result.truncated and index == result.safety_cap - 1
                    else None
                ),
            )
        )
    result.images = images
    return result
