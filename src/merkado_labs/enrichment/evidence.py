"""Evidence normalization and grounding against source listing text.

v3 expands EN/NL/ES/local synonym coverage for Curaçao real-estate copy and
adds negation and off-property ("nearby facility") awareness so evidence
grounding does not credit a claim that the source text actually contradicts
or that only describes the surrounding area.
"""

from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass

# Cap stored/graded evidence snippets so proposals stay compact (schema v3).
MAX_EVIDENCE_SNIPPET_LENGTH = 180

# Amenity keys that require a source synonym hit when the snippet is paraphrased.
# EN/NL/ES/local Curaçao real-estate terms. "terrasses" is intentionally left
# out of the terrace pattern below — it is a recurring non-canonical spelling
# that must stay a taxonomy-review case (see JC-003 canary), not auto-apply.
AMENITY_SYNONYM_PATTERNS: dict[str, re.Pattern[str]] = {
    "pool": re.compile(r"\b(swimming\s+)?pool\b|\bzwembad\b|\bpiscina\b", re.I),
    "parking": re.compile(
        r"\bparking\b|\bgarage\b|\bcarport\b|"
        r"\bparkeerplaats(en)?\b|\bparkeren\b",
        re.I,
    ),
    "garage": re.compile(r"\bgarage\b", re.I),
    "gated_community": re.compile(
        r"\bgated(\s+(community|resort|complex|entrance))?\b"
        r"|\bsecure\s+community\b"
        r"|\bcontrolled\s+access\b"
        r"|\bsurrounding\s+gate\b"
        r"|\bsecured\s+with\s+a\s+(surrounding\s+)?gate\b"
        r"|\bbeveiligd(e)?\s+(terrein|resort)\b"
        r"|\bafgesloten\s+(terrein|resort)\b"
        r"|\bbewaakte\s+toegang\b"
        r"|\b24\s*/\s*7\s+security\b.{0,40}\bcontrolled\s+entry\b"
        r"|\bcontrolled\s+entry\b.{0,40}\b24\s*/\s*7\s+security\b",
        re.I,
    ),
    "air_conditioning": re.compile(
        r"\bair\s*conditioning\b|\bairco\b|\ba/?c\b", re.I
    ),
    "garden": re.compile(r"\bgarden\b|\btuin\b", re.I),
    "balcony": re.compile(r"\bbalcon(y|ies)?\b|\bbalkon\b", re.I),
    # Canonical terrace forms including Dutch compounds (buitenterras),
    # patio/porch/veranda equivalents, and palapa outdoor terraces.
    # Never treat terra/terrain as terrace.
    "terrace": re.compile(
        r"\bterraces?\b"
        r"|\bterrasses\b"
        r"|\bbuiten\s*terras(?:sen)?\b"
        r"|\boverdekt(?:e)?\s+terras(?:sen)?\b"
        r"|\bterras(?:sen|se)?\b"
        r"|\bdakterras(?:sen)?\b"
        r"|\bpriv[eé]terras(?:sen)?\b"
        r"|\bachterpatio\b"
        r"|\bpatios?\b"
        r"|\bporch(?:es|e)?\b"
        r"|\bverandas?\b"
        r"|\bpalapa(\s+terrace|\s+terras)?\b"
        r"|\boutdoor\s+terrace\b"
        r"|\bcovered\s+(terrace|patio|porch|veranda)\b",
        re.I,
    ),
    "furnished": re.compile(
        r"\b(fully\s+|turn[\s-]?key\s+)?furnished\b"
        r"|\bunfurnished\b"
        r"|\bnot\s+furnished\b"
        r"|\b(volledig\s+)?gemeubileerd(?:e|en)?\b"
        r"|\bongemeubileerd(?:e|en)?\b"
        r"|\bniet\s+gemeubileerd(?:e|en)?\b",
        re.I,
    ),
    "sea_view": re.compile(
        r"\b(sea|ocean)\s+views?\b"
        r"|\bviews?\s+over\s+the\s+(caribbean\s+)?sea\b"
        r"|\bzeezicht\b"
        r"|\bpanoramisch(?:e)?\s+zeezicht\b"
        r"|\buitzicht\s+op\s+(de\s+)?zee\b",
        re.I,
    ),
    "solar_panels": re.compile(r"\bsolar(\s+panels?)?\b|\bzonnepanelen\b", re.I),
    "generator": re.compile(r"\bgenerator\b|\bnoodstroom\b", re.I),
    "water_heater": re.compile(
        r"\bwater\s+heater\b"
        r"|\bhot\s+water\b"
        r"|\bwarm\s+water\b"
        r"|\bwarmwater(boiler)?\b"
        r"|\bboiler\b|\bgeiser\b"
        r"|\bcalentador(\s+de\s+agua)?\b",
        re.I,
    ),
    "security_features": re.compile(
        r"\bsecurity\b|\bbeveiliging\b|\bseguridad\b|\balarm(\s+system)?\b|"
        r"\bcctv\b|\bcameras?\b|\bbewaking\b|\bbeveiligd\b|"
        r"\b24[\s-]?hour\s+security\b|\bguard(ed)?\b|"
        r"\belektrische\s+toegangspoort\b|\belectric\s+(access\s+)?gate\b",
        re.I,
    ),
    "appliance_inclusion": re.compile(
        r"\bappliances?\b|\bapparatuur\b|\belectrodom[eé]sticos\b|\bwhite\s+goods\b|"
        r"\bgasfornuis\b|\boven\b|\bkoelkast\b|\brefrigerator\b|\bstove\b",
        re.I,
    ),
    "waterfront": re.compile(
        r"\bwaterfront\b"
        r"|\bseafront\b"
        r"|\boceanfront\b"
        r"|\bbeach[\s-]?front\b"
        r"|\bwater['’]?\s*s\s+edge\b"
        r"|\bdirect\s+aan\s+(de\s+)?zee\b"
        r"|\bgelegen\s+aan\s+(de\s+)?zee\b"
        r"|\b(?:appartement|woning|villa|huis|pand)\s+aan\s+(de\s+)?zee\b"
        r"|\baan\s+(de\s+)?zee\b"
        r"|\bdirect\s+aan\s+het\s+water\b"
        r"|\baan\s+het\s+water\b",
        re.I,
    ),
    "pet_suitability": re.compile(
        r"\bpets?[_\s-]?allowed\b"
        r"|\bpets?\s+(are\s+)?(not\s+)?allowed\b"
        r"|\bhuisdieren?\b"
        r"|\b(niet\s+)?toegestaan\b",
        re.I,
    ),
    "living_room": re.compile(
        r"\bliving\s+rooms?\b|\bwoonkamer\b|\bliving\s+area\b", re.I
    ),
    "kitchen": re.compile(
        r"\bkitchen\b|\bkeuken\b|\bopen\s+keuken\b|\bopen[\s-]?plan\s+kitchen\b",
        re.I,
    ),
    "outdoor_kitchen": re.compile(
        r"\boutdoor\s+kitchen\b|\boutside\s+kitchen\b|\bside\s+kitchen\b|"
        r"\bbuitenkeuken\b",
        re.I,
    ),
    "gas_included": re.compile(
        r"\bgas\s+included\b|\binclusief\s+gas\b|\bgas\s+.*included\b",
        re.I,
    ),
    "garden_maintenance_included": re.compile(
        r"\bgarden\s+maintenance(\s+included)?\b|"
        r"\btuinonderhoud(\s+inbegrepen)?\b|"
        r"\bgarden\s+maintenance,\s+all\s+included\b",
        re.I,
    ),
}

# Explicitly rejected near-misses for terrace grounding.
TERRACE_FALSE_FRIENDS = re.compile(r"\b(terra|terrain|terracotta|terrazzo)\b", re.I)

# EN/NL/ES negation markers checked in the clause immediately before a match.
NEGATION_MARKERS = re.compile(
    r"\b(no|not|without|lacks?|excludes?|geen|zonder|sin|no\s+tiene|no\s+hay)\b",
    re.I,
)

# Phrases indicating the mention describes the surrounding area, not the
# property itself (nearby facilities must not ground property attributes).
OFF_PROPERTY_MARKERS = re.compile(
    r"\b(nearby|close\s+to|near\s+the|within\s+walking\s+distance|"
    r"walking\s+distance\s+to|"
    r"a\s+short\s+(walk|drive)|steps?\s+(from|away)|minutes?\s+(from|away)|"
    r"in\s+the\s+area|surrounding\s+area|"
    r"nabij|vlak\s+bij|dicht\s+bij)\b",
    re.I,
)

# Waterfront "near the sea/beach" language — proximity only, not waterfront.
WATERFRONT_NEARBY_ONLY = re.compile(
    r"\bnabij\s+(de\s+)?zee\b"
    r"|\bvlak\s+bij\s+(de\s+)?zee\b"
    r"|\bvlak\s+bij\s+het\s+strand\b"
    r"|\bdicht\s+bij\s+het\s+strand\b"
    r"|\bwalking\s+distance\s+to\s+the\s+beach\b"
    r"|\bclose\s+to\s+the\s+beach\b"
    r"|\bnear\s+the\s+sea\b"
    r"|\bnear\s+the\s+beach\b",
    re.I,
)

# Optional / negotiable furniture — must not auto-apply furnished=true.
FURNISHED_OPTIONAL_ONLY = re.compile(
    r"\boptioneel\s+gemeubileerd(?:e|en)?\b"
    r"|\bmeubels?\s+ter\s+overname\b"
    r"|\bfurniture\s+negotiable\b"
    r"|\bfurnished\s+optional\b"
    r"|\boptionally\s+furnished\b",
    re.I,
)

# Reviewed location-knowledge markers for gated_community (not direct source
# gate language). Matched against source corpus + evidence snippet.
# Product policy: Blue Bay / Blue Bay Resort is a controlled-access resort.
CURATED_GATED_LOCATION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\bblue\s+bay(?:\s+golf)?(?:\s*&?\s*beach)?(?:\s+resort)?\b",
        re.I,
    ),
)


def curated_gated_location_hit(text: str | None) -> bool:
    """True when reviewed location knowledge supports gated_community."""

    norm = normalize_evidence_text(text)
    if not norm:
        return False
    for pattern in CURATED_GATED_LOCATION_PATTERNS:
        for match in pattern.finditer(norm):
            if _match_is_negated(norm, match):
                continue
            if _match_is_off_property(norm, match):
                continue
            return True
    return False

# Marketing language that never counts as evidence on its own.
MARKETING_ONLY_TERMS = frozenset(
    {
        "yes",
        "no",
        "true",
        "false",
        "pool",
        "nice",
        "beautiful",
        "luxury",
        "stunning",
        "amazing",
        "must see",
        "unique opportunity",
    }
)


@dataclass(frozen=True)
class EvidenceGrounding:
    ok_for_auto_apply: bool
    ok_for_attention: bool
    reason: str
    normalization_warning: str | None = None
    normalized_snippet: str | None = None


def normalize_evidence_text(value: str | None) -> str:
    """Unicode/HTML/whitespace normalization for evidence matching."""

    if value is None:
        return ""
    text = html.unescape(str(value))
    text = unicodedata.normalize("NFKC", text)
    # Normalize common quote / bullet variants.
    for src, dst in (
        ("\u201c", '"'),
        ("\u201d", '"'),
        ("\u2018", "'"),
        ("\u2019", "'"),
        ("\u2022", " "),
        ("\u00b7", " "),
        ("\ufeff", ""),
    ):
        text = text.replace(src, dst)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def truncate_evidence_snippet(
    value: str | None, max_length: int = MAX_EVIDENCE_SNIPPET_LENGTH
) -> str | None:
    """Truncate on a word boundary, preserving the leading matched text."""

    if value is None:
        return None
    text = str(value).strip()
    if len(text) <= max_length:
        return text
    truncated = text[:max_length].rsplit(" ", 1)[0].rstrip(",.;: ")
    if not truncated:
        truncated = text[:max_length]
    return truncated + "\u2026"


def _strip_wrapping_quotes(value: str) -> str:
    text = value.strip()
    if len(text) >= 2 and text[0] in {'"', "'"} and text[-1] == text[0]:
        return text[1:-1].strip()
    return text


def material_normalization_changed(original: str, normalized: str) -> bool:
    compact_orig = re.sub(r"\s+", " ", original or "").strip()
    return compact_orig != normalized


def _clause_window(text: str, end_index: int, radius: int = 40) -> str:
    """Text immediately before a match, cut at the nearest sentence boundary."""

    start = max(0, end_index - radius)
    window = text[start:end_index]
    pieces = re.split(r"[.!?\n]", window)
    return pieces[-1] if pieces else window


def _match_is_negated(source_text: str, match: re.Match[str]) -> bool:
    return bool(NEGATION_MARKERS.search(_clause_window(source_text, match.start())))


def _match_is_off_property(source_text: str, match: re.Match[str]) -> bool:
    window = _clause_window(source_text, match.start(), radius=48)
    return bool(OFF_PROPERTY_MARKERS.search(window))


def _synonym_grounding_status(
    key: str, norm_source: str
) -> tuple[bool | None, bool, bool]:
    """Return (synonym_hit, all_matches_negated, all_matches_off_property).

    synonym_hit is None when the key has no known synonym pattern at all.
    """

    pattern = AMENITY_SYNONYM_PATTERNS.get(key)
    if pattern is None:
        return None, False, False
    matches = list(pattern.finditer(norm_source))
    if not matches:
        return False, False, False
    on_property_positive = False
    any_negated = False
    any_off_property = False
    for match in matches:
        negated = _match_is_negated(norm_source, match)
        off_property = (not negated) and _match_is_off_property(norm_source, match)
        if negated:
            any_negated = True
        elif off_property:
            any_off_property = True
        else:
            on_property_positive = True
    all_negated = any_negated and not on_property_positive and not any_off_property
    all_off_property = any_off_property and not on_property_positive and not any_negated
    return on_property_positive, all_negated, all_off_property


def ground_evidence(
    *,
    key: str,
    evidence_snippet: str | None,
    source_text: str | None,
) -> EvidenceGrounding:
    """Decide whether evidence supports auto-apply / attention / rejection."""

    if not evidence_snippet or not str(evidence_snippet).strip():
        return EvidenceGrounding(
            ok_for_auto_apply=False,
            ok_for_attention=False,
            reason="missing_evidence_snippet",
        )

    raw_snippet = str(evidence_snippet)
    norm_snippet = _strip_wrapping_quotes(normalize_evidence_text(raw_snippet))
    norm_source = normalize_evidence_text(source_text)
    warning = None
    if material_normalization_changed(raw_snippet, norm_snippet):
        warning = "evidence_normalization_changed_snippet"

    if len(norm_snippet) < 8:
        return EvidenceGrounding(
            ok_for_auto_apply=False,
            ok_for_attention=False,
            reason="evidence_too_short",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    if not norm_source:
        return EvidenceGrounding(
            ok_for_auto_apply=False,
            ok_for_attention=False,
            reason="missing_source_text",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    snippet_l = norm_snippet.casefold()
    source_l = norm_source.casefold()

    # Prefer exact normalized span (or a long quoted interior).
    exact = snippet_l in source_l
    if not exact:
        quoted = re.findall(r'"([^"]{8,})"', norm_snippet)
        exact = any(part.casefold() in source_l for part in quoted)

    # Token overlap for soft paraphrase support (attention only).
    tokens = [t for t in re.split(r"[^a-z0-9]+", snippet_l) if len(t) >= 5]
    token_hits = sum(1 for token in tokens if token in source_l) if tokens else 0
    paraphrased = (not exact) and tokens and token_hits >= min(3, max(1, len(tokens) // 3))

    synonym_hit, negated_only, off_property_only = _synonym_grounding_status(
        key, norm_source
    )

    # Proximity-to-sea language never proves waterfront, even with an exact span.
    if key == "waterfront":
        nearby_only = bool(WATERFRONT_NEARBY_ONLY.search(norm_source)) and (
            synonym_hit is not True
        )
        if nearby_only or (
            WATERFRONT_NEARBY_ONLY.search(norm_snippet)
            and synonym_hit is not True
        ):
            return EvidenceGrounding(
                ok_for_auto_apply=False,
                ok_for_attention=False,
                reason="waterfront_proximity_not_proven",
                normalization_warning=warning,
                normalized_snippet=norm_snippet,
            )

    # Optional / negotiable furniture is not automatic furnished=true.
    if key == "furnished" and FURNISHED_OPTIONAL_ONLY.search(norm_source):
        optional_spans = list(FURNISHED_OPTIONAL_ONLY.finditer(norm_source))
        hard_hits = list(
            AMENITY_SYNONYM_PATTERNS["furnished"].finditer(norm_source)
        )
        hard_positive = False
        for match in hard_hits:
            if _match_is_negated(norm_source, match):
                continue
            # Include the match itself so "optioneel gemeubileerd" is detected.
            window = norm_source[
                max(0, match.start() - 48) : min(len(norm_source), match.end() + 24)
            ]
            if FURNISHED_OPTIONAL_ONLY.search(window):
                continue
            hard_positive = True
            break
        if optional_spans and not hard_positive:
            return EvidenceGrounding(
                ok_for_auto_apply=False,
                ok_for_attention=True,
                reason="furnished_optional_or_negotiable",
                normalization_warning=warning,
                normalized_snippet=norm_snippet,
            )

    if key == "terrace":
        # Guard against terra/terrain-only contamination.
        if synonym_hit is False and TERRACE_FALSE_FRIENDS.search(norm_source):
            return EvidenceGrounding(
                ok_for_auto_apply=False,
                ok_for_attention=False,
                reason="terrace_false_friend_only",
                normalization_warning=warning,
                normalized_snippet=norm_snippet,
            )
        # Non-canonical spellings (e.g. terrasses) with exact span → attention,
        # not auto-apply, until taxonomy accepts the variant as first-class.
        if exact and synonym_hit is False:
            return EvidenceGrounding(
                ok_for_auto_apply=False,
                ok_for_attention=True,
                reason="terrace_variant_needs_attention",
                normalization_warning=warning,
                normalized_snippet=norm_snippet,
            )

    # Negation: the source explicitly denies the amenity the AI proposed.
    if negated_only:
        return EvidenceGrounding(
            ok_for_auto_apply=False,
            ok_for_attention=True,
            reason="negation_conflict_with_source",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    # Off-property: the only mentions describe the surrounding area.
    if off_property_only:
        return EvidenceGrounding(
            ok_for_auto_apply=False,
            ok_for_attention=False,
            reason="nearby_facility_not_property_attribute",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    if exact and (synonym_hit is not False):
        return EvidenceGrounding(
            ok_for_auto_apply=True,
            ok_for_attention=True,
            reason="evidence_span_in_source",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    if exact and synonym_hit is False:
        # Exact snippet exists but key synonym absent — mismatched / weak claim.
        # v4: reject as unsupported noise rather than queueing review.
        if key == "gated_community":
            if curated_gated_location_hit(norm_source) or curated_gated_location_hit(
                norm_snippet
            ):
                return EvidenceGrounding(
                    ok_for_auto_apply=True,
                    ok_for_attention=True,
                    reason="curated_location_knowledge_gated_community",
                    normalization_warning=warning,
                    normalized_snippet=norm_snippet,
                )
            return EvidenceGrounding(
                ok_for_auto_apply=False,
                ok_for_attention=False,
                reason="gated_without_gate_synonym_rejected",
                normalization_warning=warning,
                normalized_snippet=norm_snippet,
            )
        return EvidenceGrounding(
            ok_for_auto_apply=False,
            ok_for_attention=False,
            reason="snippet_present_synonym_missing",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    # Curated location knowledge can ground gated_community even when the model
    # snippet is a soft paraphrase of the resort name (exact span may miss).
    if key == "gated_community" and synonym_hit is not True:
        if curated_gated_location_hit(norm_source) or curated_gated_location_hit(
            norm_snippet
        ):
            return EvidenceGrounding(
                ok_for_auto_apply=True,
                ok_for_attention=True,
                reason="curated_location_knowledge_gated_community",
                normalization_warning=warning,
                normalized_snippet=norm_snippet,
            )

    if paraphrased and synonym_hit:
        # Synonym is present in source text and the snippet is a soft paraphrase
        # of that evidence — safe enough for amenity auto-apply once confidence
        # and other policy gates pass.
        return EvidenceGrounding(
            ok_for_auto_apply=True,
            ok_for_attention=True,
            reason="paraphrased_evidence_with_synonym",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    if synonym_hit and key in AMENITY_SYNONYM_PATTERNS:
        # Synonym exists but the model snippet does not ground to source text.
        # Keep as audit-only rejection noise, not an operational attention item.
        return EvidenceGrounding(
            ok_for_auto_apply=False,
            ok_for_attention=False,
            reason="synonym_without_grounded_snippet",
            normalization_warning=warning,
            normalized_snippet=norm_snippet,
        )

    return EvidenceGrounding(
        ok_for_auto_apply=False,
        ok_for_attention=False,
        reason="evidence_not_in_source",
        normalization_warning=warning,
        normalized_snippet=norm_snippet,
    )
