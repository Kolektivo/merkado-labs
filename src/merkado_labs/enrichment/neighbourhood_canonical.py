"""Safe neighbourhood display canonicalization for Merkado Labs.

Preserves original source / map / AI evidence strings elsewhere. This module
only produces a canonical *display* name for filters, cards, URLs, and public
detail. It never merges property assets.

Keep in sync with:
`apps/labs-dashboard/src/lib/domain/neighbourhood-aliases.ts`
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

CanonicalReason = Literal[
    "exact_alias",
    "suffix_strip",
    "passthrough",
    "generic",
    "uncertain",
]

# Island-only mentions — not a real neighbourhood for filters/display.
# Keys are accent-stripped (see normalize_neighbourhood_key).
_GENERIC_KEYS = frozenset(
    {
        "curacao",
        "curacao island",
        "island",
        "netherlands antilles",
        "dutch caribbean",
    }
)

_ISLAND_SUFFIX_DISPLAY_RE = re.compile(
    r"(?:\s+(?:[Cc]ura(?:ç|c)ao|[Ii]sland))+$",
)

# Punctuation noise collapsed for comparison keys (display keeps original accents).
_PUNCT_RE = re.compile(r"[&/\\|+,;:]+")
_DOT_RE = re.compile(r"\.")
_QUOTE_RE = re.compile(r"[\"'`´]")
_WS_RE = re.compile(r"\s+")
_ISLAND_SUFFIX_KEY_RE = re.compile(r"(?:\s+(?:curacao|island))+$")

# Ambiguous multi-place or resort forms — do not invent a merge target.
_UNCERTAIN_KEY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bvista\s+royal\b.*\bjan\s+thiel\b"),
    re.compile(r"\bjan\s+thiel\b.*\bvista\s+royal\b"),
    re.compile(r"\bcas\s+abou\s+resort\b"),
)

# Reviewed SAFE aliases: normalized_key → canonical display name.
# Include raw duplicate forms (with and without island suffix) after key norm.
# DO NOT map Brakkeput Abou / Mei Mei / Ariba → Brakkeput.
# DO NOT map Cas Abou Resort → Cas Abou.
# DO NOT map Salinja Abou / Salinja Ariba / Saliña Ariba → Saliña.
# Mirrors SAFE_NEIGHBOURHOOD_ALIASES in neighbourhood-aliases.ts — keep in sync.
SAFE_NEIGHBOURHOOD_ALIASES: dict[str, str] = {
    # Explicit Labs duplicates with island suffix
    "bottelier curacao": "Bottelier",
    "brakkeput curacao": "Brakkeput",
    "cas grandi curacao": "Cas Grandi",
    "sun valley curacao": "Sun Valley",
    "toni kunchi curacao": "Toni Kunchi",
    "jan thiel curacao": "Jan Thiel",
    "piscadera curacao": "Piscadera",
    "otrobanda curacao": "Otrobanda",
    "jan sofat curacao": "Jan Sofat",
    "mahaai curacao": "Mahaai",
    "mambo beach curacao": "Mambo Beach",
    "willemstad curacao": "Willemstad",
    "zuikertuintje curacao": "Zuikertuintje",
    "mundo nobo curacao": "Mundo Nobo",
    "seru loraweg curacao": "Seru Loraweg",
    "blauwbaai curacao": "Blue Bay",
    "blue bay curacao": "Blue Bay",
    # Saliña spelling variants (accent / j / bare / island suffix)
    "salina": "Saliña",
    "salinja": "Saliña",
    "salina curacao": "Saliña",
    "salinja curacao": "Saliña",
    # Marie Pampoen spelling variants (incl. dual-label source form)
    "marie pompoen": "Marie Pampoen",
    "marie pompoen curacao": "Marie Pampoen",
    "marie pampoen": "Marie Pampoen",
    "marie pampoen curacao": "Marie Pampoen",
    "marie pampoen marie pompoen": "Marie Pampoen",
    "marie pampoen marie pompoen curacao": "Marie Pampoen",
    # St. Joris spelling variants
    "st joris": "Sint Joris",
    "st joris curacao": "Sint Joris",
    "sint joris": "Sint Joris",
    "sint joris curacao": "Sint Joris",
    # Blue Bay resort marketing variants
    "blue bay resort": "Blue Bay",
    "blue bay resort curacao": "Blue Bay",
    "blue bay golf beach resort": "Blue Bay",
    "blue bay golf beach resort curacao": "Blue Bay",
    "blue bay golf and beach resort": "Blue Bay",
    "blue bay golf and beach resort curacao": "Blue Bay",
}


@dataclass(frozen=True)
class CanonicalNeighbourhood:
    """Canonical display resolution for one neighbourhood string."""

    original: str | None
    normalized_key: str
    canonical_display: str | None
    reason: CanonicalReason
    confidence: float
    safe: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "original": self.original,
            "normalized_key": self.normalized_key,
            "canonical_display": self.canonical_display,
            "reason": self.reason,
            "confidence": self.confidence,
            "safe": self.safe,
        }


def _strip_accents(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _clean_raw(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _fold_key_core(value: str, *, strip_island_suffix: bool) -> str:
    text = unicodedata.normalize("NFKC", value.strip())
    text = text.casefold()
    text = _strip_accents(text)
    text = _PUNCT_RE.sub(" ", text)
    text = _DOT_RE.sub(" ", text)
    text = _QUOTE_RE.sub("", text)
    text = _WS_RE.sub(" ", text).strip()
    if strip_island_suffix:
        text = _ISLAND_SUFFIX_KEY_RE.sub("", text).strip()
    return text


def normalize_neighbourhood_key(value: str | None) -> str:
    """Comparison key: NFKC, casefold, accents stripped, noise collapsed, suffix removed.

    Display accents are intentionally *not* preserved here — use
    ``canonicalize_neighbourhood(...).canonical_display`` for UI labels.
    """

    cleaned = _clean_raw(value)
    if cleaned is None:
        return ""
    return _fold_key_core(cleaned, strip_island_suffix=True)


def _pre_suffix_key(value: str) -> str:
    """Normalized key without stripping the island suffix (for alias lookup)."""

    return _fold_key_core(value, strip_island_suffix=False)


def _strip_island_suffix_display(value: str) -> str | None:
    stripped = _ISLAND_SUFFIX_DISPLAY_RE.sub("", value.strip()).strip()
    stripped = _WS_RE.sub(" ", stripped).strip(" ,-/")
    if not stripped or stripped == value.strip():
        return None
    return stripped


def _is_uncertain_key(key: str) -> bool:
    if not key:
        return False
    return any(pattern.search(key) for pattern in _UNCERTAIN_KEY_PATTERNS)


def canonicalize_neighbourhood(value: str | None) -> CanonicalNeighbourhood:
    """Map a neighbourhood string to a safe canonical display name.

    Never merges distinct districts (e.g. Brakkeput Abou) into a parent name.
    Uncertain multi-place strings keep their original text and ``safe=False``.
    """

    original = _clean_raw(value)
    if original is None:
        return CanonicalNeighbourhood(
            original=None,
            normalized_key="",
            canonical_display=None,
            reason="generic",
            confidence=1.0,
            safe=True,
        )

    raw_key = normalize_neighbourhood_key(original)
    pre_key = _pre_suffix_key(original)

    if not raw_key or raw_key in _GENERIC_KEYS or pre_key in _GENERIC_KEYS:
        return CanonicalNeighbourhood(
            original=original,
            normalized_key=raw_key or pre_key,
            canonical_display=None,
            reason="generic",
            confidence=1.0,
            safe=True,
        )

    if _is_uncertain_key(raw_key) or _is_uncertain_key(pre_key):
        return CanonicalNeighbourhood(
            original=original,
            normalized_key=raw_key,
            canonical_display=original,
            reason="uncertain",
            confidence=0.35,
            safe=False,
        )

    for key in (pre_key, raw_key):
        alias = SAFE_NEIGHBOURHOOD_ALIASES.get(key)
        if alias:
            return CanonicalNeighbourhood(
                original=original,
                normalized_key=normalize_neighbourhood_key(alias),
                canonical_display=alias,
                reason="exact_alias",
                confidence=1.0,
                safe=True,
            )

    stripped_display = _strip_island_suffix_display(original)
    if stripped_display:
        stripped_key = normalize_neighbourhood_key(stripped_display)
        if not stripped_key or stripped_key in _GENERIC_KEYS:
            return CanonicalNeighbourhood(
                original=original,
                normalized_key=raw_key,
                canonical_display=None,
                reason="generic",
                confidence=1.0,
                safe=True,
            )
        if stripped_key in SAFE_NEIGHBOURHOOD_ALIASES:
            alias = SAFE_NEIGHBOURHOOD_ALIASES[stripped_key]
            return CanonicalNeighbourhood(
                original=original,
                normalized_key=normalize_neighbourhood_key(alias),
                canonical_display=alias,
                reason="exact_alias",
                confidence=1.0,
                safe=True,
            )
        # Only the island/country suffix was removed — keep the remainder as
        # display (Brakkeput Abou Curacao → Brakkeput Abou, not Brakkeput).
        return CanonicalNeighbourhood(
            original=original,
            normalized_key=raw_key,
            canonical_display=stripped_display,
            reason="suffix_strip",
            confidence=0.92,
            safe=True,
        )

    return CanonicalNeighbourhood(
        original=original,
        normalized_key=raw_key,
        canonical_display=original,
        reason="passthrough",
        confidence=1.0,
        safe=True,
    )


def canonical_display_name(value: str | None) -> str | None:
    """Convenience: canonical display string, or None when generic/unavailable."""

    return canonicalize_neighbourhood(value).canonical_display


def canonical_comparison_key(value: str | None) -> str:
    """Comparison key for filter matching after safe display canonicalization."""

    result = canonicalize_neighbourhood(value)
    if result.canonical_display:
        return normalize_neighbourhood_key(result.canonical_display)
    return result.normalized_key


def neighbourhood_keys_match(left: str | None, right: str | None) -> bool:
    """True when both sides canonicalize to the same non-empty comparison key."""

    left_key = canonical_comparison_key(left)
    right_key = canonical_comparison_key(right)
    if not left_key or not right_key:
        return False
    return left_key == right_key
