"""Flexible property attributes and local candidate frequency analysis.

Attributes live in a JSON bag — never auto-promoted to DB columns or filters.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from merkado_labs.enrichment.fields import (
    ATTRIBUTE_DISPLAY_LABELS,
    ATTRIBUTE_SYNONYMS,
    CANONICAL_ATTRIBUTE_KEYS,
    normalize_attribute_key,
)
from merkado_labs.enrichment.values import (
    AutoApplyStatus,
    LayeredAttribute,
    ValueProvenance,
    ValueType,
)

# Phrase patterns for local (non-AI) candidate discovery from descriptions.
_DETECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("pool", re.compile(r"\b(swimming\s+)?pool\b|\bzwembad\b", re.I)),
    (
        "furnished",
        re.compile(
            r"\b(fully\s+|turn[\s-]?key\s+)?furnished\b"
            r"|\b(volledig\s+)?gemeubileerd(?:e|en)?\b",
            re.I,
        ),
    ),
    (
        "parking_spaces",
        re.compile(
            r"\b(\d+)\s*(parking\s+spaces?|parkings?|car\s+ports?)\b",
            re.I,
        ),
    ),
    ("parking", re.compile(r"\bparking\b|\bcarport\b|\bcar\s+port\b", re.I)),
    ("garage", re.compile(r"\bgarage\b", re.I)),
    (
        "gated_community",
        re.compile(
            r"\bgated(\s+(community|resort|complex|entrance))?\b"
            r"|\bcontrolled\s+access\b"
            r"|\bbeveiligd(e)?\s+(terrein|resort)\b"
            r"|\bafgesloten\s+(terrein|resort)\b"
            r"|\bbewaakte\s+toegang\b",
            re.I,
        ),
    ),
    (
        "air_conditioning",
        re.compile(r"\bair\s*conditioning\b|\bairco\b|\ba/?c\b", re.I),
    ),
    (
        "sea_view",
        re.compile(
            r"\b(sea|ocean)\s+views?\b"
            r"|\bzeezicht\b"
            r"|\buitzicht\s+op\s+(de\s+)?zee\b",
            re.I,
        ),
    ),
    ("garden", re.compile(r"\bgarden\b|\btuin\b", re.I)),
    ("balcony", re.compile(r"\bbalcony\b|\bbalkon\b", re.I)),
    (
        "terrace",
        re.compile(r"\bterraces?\b|\bterras\b|\bterrasse\b|\bterrassen\b", re.I),
    ),
    ("solar_panels", re.compile(r"\bsolar(\s+panels?)?\b|\bzonnepanelen\b", re.I)),
    ("generator", re.compile(r"\bgenerator\b|\bnoodstroom\b", re.I)),
    ("water_heater", re.compile(r"\bwater\s+heater\b|\bboiler\b", re.I)),
    (
        "waterfront",
        re.compile(
            r"\bwaterfront\b|\bseafront\b|\boceanfront\b|\bbeach[\s-]?front\b"
            r"|\b(?:appartement|woning|villa|huis)\s+aan\s+(de\s+)?zee\b"
            r"|\bdirect\s+aan\s+(de\s+)?zee\b"
            r"|\baan\s+(de\s+)?zee\b"
            r"|\baan\s+het\s+water\b",
            re.I,
        ),
    ),
    ("pet_suitability", re.compile(r"\bpets?\s+(allowed|welcome|friendly)\b", re.I)),
]

# Terms that look like amenities but are too noisy for filters.
_NOISY_TERMS = frozenset(
    {
        "beautiful",
        "luxury",
        "stunning",
        "unique",
        "must see",
        "investment",
        "opportunity",
    }
)


@dataclass
class AttributeCandidate:
    key: str
    display_label: str
    frequency: int = 0
    source_coverage: int = 0
    ai_coverage: int = 0
    common_raw_terms: list[str] = field(default_factory=list)
    normalization_confidence: float = 0.0
    conflict_count: int = 0
    # display_only | possible_future_filter | ignore_noisy | needs_taxonomy_decision
    recommendation: str = "display_only"
    useful_as_filter: bool = False
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "display_label": self.display_label,
            "frequency": self.frequency,
            "source_coverage": self.source_coverage,
            "ai_coverage": self.ai_coverage,
            "common_raw_terms": self.common_raw_terms,
            "normalization_confidence": self.normalization_confidence,
            "conflict_count": self.conflict_count,
            "recommendation": self.recommendation,
            "useful_as_filter": self.useful_as_filter,
            "notes": self.notes,
        }


def extract_local_attribute_hits(text: str) -> dict[str, dict[str, Any]]:
    """Deterministic phrase hits from listing text (no OpenAI)."""

    hits: dict[str, dict[str, Any]] = {}
    if not text:
        return hits
    for key, pattern in _DETECTION_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        value: Any = True
        if key == "parking_spaces" and match.lastindex:
            try:
                value = int(match.group(1))
            except (TypeError, ValueError):
                value = True
                key = "parking"
        # Avoid double-counting parking when spaces already found.
        if key == "parking" and "parking_spaces" in hits:
            continue
        hits[key] = {
            "value": value,
            "evidence": match.group(0),
            "raw_term": match.group(0).lower(),
        }
    return hits


def build_layered_attribute(
    *,
    key: str,
    source_value: Any = None,
    ai_value: Any = None,
    effective_value: Any = None,
    evidence: str | None = None,
    confidence: float | None = None,
    provenance: ValueProvenance = ValueProvenance.EMPTY,
    review_status: AutoApplyStatus = AutoApplyStatus.NOT_EVALUATED,
    value_type: ValueType | None = None,
) -> LayeredAttribute:
    normalized = normalize_attribute_key(key)
    if value_type is None:
        if isinstance(effective_value if effective_value is not None else ai_value, bool):
            value_type = ValueType.BOOLEAN
        elif isinstance(effective_value if effective_value is not None else ai_value, (int, float)):
            value_type = ValueType.NUMBER
        else:
            value_type = ValueType.TEXT
    return LayeredAttribute(
        key=normalized,
        display_label=ATTRIBUTE_DISPLAY_LABELS.get(
            normalized, normalized.replace("_", " ").title()
        ),
        value_type=value_type,
        source_value=source_value,
        ai_value=ai_value,
        effective_value=effective_value,
        evidence=evidence,
        confidence=confidence,
        provenance=provenance,
        review_status=review_status,
    )


def recommend_candidate(
    *,
    key: str,
    frequency: int,
    listing_count: int,
    normalization_confidence: float,
    noisy: bool,
) -> tuple[str, bool, list[str]]:
    notes: list[str] = []
    if noisy or key not in CANONICAL_ATTRIBUTE_KEYS:
        if key not in CANONICAL_ATTRIBUTE_KEYS:
            return (
                "needs_taxonomy_decision",
                False,
                ["Not in canonical attribute taxonomy; keep flexible."],
            )
        return "ignore_noisy", False, ["Noisy marketing language."]

    coverage = frequency / listing_count if listing_count else 0.0
    if coverage >= 0.25 and normalization_confidence >= 0.8:
        notes.append("Frequent and well-normalized; may become a browse filter later.")
        return "possible_future_filter", True, notes
    if coverage >= 0.08:
        notes.append("Useful on listing detail; do not auto-create filters.")
        return "display_only", False, notes
    notes.append("Low frequency; keep as display-only if evidenced.")
    return "display_only", False, notes


def analyze_attribute_candidates(
    listings: list[dict[str, Any]],
    *,
    text_key: str = "description",
) -> list[AttributeCandidate]:
    """Build frequency report from listing dicts with text / structured fields."""

    listing_count = len(listings)
    freq: Counter[str] = Counter()
    source_cov: Counter[str] = Counter()
    raw_terms: dict[str, Counter[str]] = defaultdict(Counter)
    conflicts = Counter()

    for row in listings:
        text_parts = [
            str(row.get(text_key) or ""),
            str(row.get("title") or ""),
            str(row.get("cleaned_listing_text") or ""),
        ]
        # structured_evidence may carry feature lists
        structured = row.get("structured_evidence") or {}
        if isinstance(structured, dict):
            for feat in structured.get("features") or structured.get("amenities") or []:
                if isinstance(feat, str):
                    text_parts.append(feat)
                elif isinstance(feat, dict):
                    text_parts.append(str(feat.get("label") or feat.get("name") or ""))
        blob = "\n".join(p for p in text_parts if p)
        hits = extract_local_attribute_hits(blob)
        for key, hit in hits.items():
            freq[key] += 1
            source_cov[key] += 1
            raw_terms[key][str(hit.get("raw_term") or key)] += 1

        # Source structured neighbourhood / location are not attributes here.
        for amenity in row.get("amenities") or []:
            if isinstance(amenity, dict):
                label = str(amenity.get("label") or amenity.get("key") or "")
                if label.lower() in _NOISY_TERMS:
                    continue
                key = normalize_attribute_key(label)
                if key:
                    freq[key] += 1
                    source_cov[key] += 1
                    raw_terms[key][label.lower()] += 1

    candidates: list[AttributeCandidate] = []
    for key, count in freq.most_common():
        synonym_targets = set(ATTRIBUTE_SYNONYMS.values())
        noisy = key in _NOISY_TERMS or (
            key not in CANONICAL_ATTRIBUTE_KEYS and key not in synonym_targets
        )
        if key in CANONICAL_ATTRIBUTE_KEYS:
            noisy = False
        norm_conf = 0.95 if key in CANONICAL_ATTRIBUTE_KEYS else 0.4
        recommendation, useful, notes = recommend_candidate(
            key=key,
            frequency=count,
            listing_count=listing_count,
            normalization_confidence=norm_conf,
            noisy=noisy,
        )
        candidates.append(
            AttributeCandidate(
                key=key,
                display_label=ATTRIBUTE_DISPLAY_LABELS.get(
                    key, key.replace("_", " ").title()
                ),
                frequency=count,
                source_coverage=source_cov[key],
                ai_coverage=0,
                common_raw_terms=[t for t, _ in raw_terms[key].most_common(8)],
                normalization_confidence=norm_conf,
                conflict_count=conflicts[key],
                recommendation=recommendation,
                useful_as_filter=useful,
                notes=notes,
            )
        )
    return candidates


def write_attribute_candidate_report(
    listings: list[dict[str, Any]],
    *,
    json_path: Path,
    md_path: Path,
) -> dict[str, Any]:
    candidates = analyze_attribute_candidates(listings)
    payload = {
        "listing_count": len(listings),
        "attribute_count": len(candidates),
        "auto_schema_creation": False,
        "auto_filter_creation": False,
        "candidates": [c.as_dict() for c in candidates],
        "notes": [
            "Generated locally from catalog text/features; no OpenAI calls.",
            "Do not create database columns or browse filters from frequency alone.",
        ],
    }
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# KW attribute candidates",
        "",
        f"Listings analyzed: {len(listings)}",
        "",
        "No automatic schema or filter creation.",
        "",
        "| Attribute | Frequency | Recommendation | Useful as filter | Common terms |",
        "|---|---:|---|---|---|",
    ]
    for c in candidates:
        terms = ", ".join(c.common_raw_terms[:5]) or "—"
        lines.append(
            f"| {c.display_label} (`{c.key}`) | {c.frequency} | {c.recommendation} | "
            f"{'yes' if c.useful_as_filter else 'no'} | {terms} |"
        )
    lines.extend(
        [
            "",
            "## Guidance",
            "",
            "- **display_only**: show on listing detail when evidenced",
            "- **possible_future_filter**: candidate for a later product decision",
            "- **ignore_noisy**: marketing language; do not promote",
            "- **needs_taxonomy_decision**: unknown key; keep in flexible bag",
            "",
        ]
    )
    md_path.write_text("\n".join(lines), encoding="utf-8")
    return payload
