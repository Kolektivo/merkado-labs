"""Public-safe effective attribute projection helpers.

Mirrors the consumer contract used by ``public_property_listings`` and the
Labs Browse / Passport TypeScript layer. Internal proposal, evidence,
confidence, and cost fields are never included.
"""

from __future__ import annotations

from typing import Any

from merkado_labs.enrichment.fields import ATTRIBUTE_DISPLAY_LABELS, normalize_attribute_key
from merkado_labs.enrichment.neighbourhood import (
    resolve_effective_neighbourhood,
)

PUBLIC_ATTRIBUTE_ALLOWLIST: frozenset[str] = frozenset(
    {
        "pool",
        "pool_subtype",
        "furnished",
        "parking",
        "parking_spaces",
        "garage",
        "gated_community",
        "air_conditioning",
        "garden",
        "terrace",
        "balcony",
        "sea_view",
        "waterfront",
        "solar_panels",
        "generator",
        "water_heater",
        "security_features",
        "appliance_inclusion",
        "accessibility",
        "pet_suitability",
        "living_room",
        "kitchen",
        "outdoor_kitchen",
        "gas_included",
        "garden_maintenance_included",
    }
)

PUBLIC_ATTRIBUTE_FILTER_KEYS: tuple[str, ...] = (
    "furnished",
    "gated_community",
    "parking",
    "air_conditioning",
)

PUBLIC_NEIGHBOURHOOD_PROVENANCE_LABELS = {
    "source": "From source",
    "map": "Matched from map",
    "ai_extracted": "Extracted from listing text",
    "unavailable": "Not specified",
}


PUBLIC_DISPLAY_DESCRIPTION_KEYS: tuple[str, ...] = (
    "display_overview",
    "display_layout",
    "display_location",
    "display_highlights",
    "display_practical",
)

PUBLIC_DISPLAY_TITLE_KEY = "display_title"
PUBLIC_DISPLAY_SUMMARY_KEY = "display_summary"


def _coerce_public_value(raw: Any) -> tuple[Any, str] | None:
    if raw is None or raw == "" or raw == "unknown":
        return None
    if isinstance(raw, bool):
        return raw, "boolean"
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        return raw, "number"
    if isinstance(raw, str):
        lowered = raw.strip().lower()
        if lowered in {"true", "present"}:
            return True, "boolean"
        if lowered in {"false", "explicitly_absent"}:
            return False, "boolean"
        try:
            if "." in lowered:
                return float(lowered), "number"
            return int(lowered), "number"
        except ValueError:
            return raw.strip(), "text"
    return None


def project_public_attributes(proposal: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Return allowlisted auto-applied attributes without private fields."""

    if not proposal:
        return []
    decisions = {
        normalize_attribute_key(str(item.get("key") or "")): item
        for item in (proposal.get("field_decisions") or [])
        if isinstance(item, dict)
    }
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in proposal.get("applied_attributes") or []:
        if not isinstance(item, dict):
            continue
        key = normalize_attribute_key(str(item.get("key") or ""))
        if key not in PUBLIC_ATTRIBUTE_ALLOWLIST or key in seen:
            continue
        decision = decisions.get(key) or {}
        if decision.get("final_status") != "auto_applied":
            continue
        coerced = _coerce_public_value(item.get("effective_value"))
        if coerced is None:
            continue
        value, value_type = coerced
        seen.add(key)
        out.append(
            {
                "key": key,
                "display_label": ATTRIBUTE_DISPLAY_LABELS.get(
                    key, key.replace("_", " ").title()
                ),
                "value": value,
                "value_type": value_type,
                "subtype": item.get("subtype") or item.get("pool_subtype"),
            }
        )
    return sorted(out, key=lambda row: row["key"])


def public_ai_neighbourhood_candidate(proposal: dict[str, Any] | None) -> str | None:
    """High-confidence grounded AI neighbourhood usable only for gap-fill."""

    if not proposal:
        return None
    best: tuple[float, str] | None = None
    for item in proposal.get("field_decisions") or []:
        if not isinstance(item, dict):
            continue
        if item.get("key") != "neighbourhood_candidate":
            continue
        if item.get("final_status") != "auto_applied":
            continue
        reasons = set(item.get("reasons") or [])
        if "source_conflict" in reasons or "title_description_conflict" in reasons:
            continue
        conf = item.get("confidence")
        snippet = item.get("evidence_snippet")
        value = str(item.get("proposed_value") or "").strip()
        if not value or conf is None or float(conf) < 0.85 or not snippet:
            continue
        score = float(conf)
        if best is None or score > best[0]:
            best = (score, value)
    return best[1] if best else None


def _auto_applied_field(proposal: dict[str, Any] | None, key: str) -> Any:
    if not proposal:
        return None
    for item in proposal.get("field_decisions") or []:
        if not isinstance(item, dict):
            continue
        if str(item.get("key") or "") != key:
            continue
        if item.get("final_status") != "auto_applied":
            continue
        value = item.get("resulting_effective", item.get("proposed_value"))
        if value not in (None, "", []):
            return value
    return None


def project_public_display_title(proposal: dict[str, Any] | None) -> str | None:
    """Return auto-applied English display_title when present."""

    value = _auto_applied_field(proposal, PUBLIC_DISPLAY_TITLE_KEY)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def project_public_display_summary(proposal: dict[str, Any] | None) -> str | None:
    """Return auto-applied English display_summary when present."""

    value = _auto_applied_field(proposal, PUBLIC_DISPLAY_SUMMARY_KEY)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def project_public_display_description(proposal: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return only auto-applied, public display-description blocks."""

    if not proposal:
        return None
    decisions = {
        str(item.get("key")): item
        for item in proposal.get("field_decisions") or []
        if isinstance(item, dict) and item.get("final_status") == "auto_applied"
    }
    out: dict[str, Any] = {}
    # Public presentation layer is English; keep language marker for consumers.
    if project_public_display_title(proposal) or project_public_display_summary(proposal):
        out["language"] = "en"
    else:
        source_lang = proposal.get("source_language")
        if isinstance(source_lang, str) and source_lang.strip():
            out["language"] = source_lang.strip()
    for key in PUBLIC_DISPLAY_DESCRIPTION_KEYS:
        decision = decisions.get(key)
        if not decision:
            continue
        value = decision.get("resulting_effective", decision.get("proposed_value"))
        if value not in (None, "", []):
            out[key.removeprefix("display_")] = value
    return out or None


def resolve_public_effective_neighbourhood(
    *,
    source_name: str | None,
    map_name: str | None,
    proposal: dict[str, Any] | None,
) -> dict[str, Any]:
    ai_name = public_ai_neighbourhood_candidate(proposal)
    effective = resolve_effective_neighbourhood(
        source_name=source_name,
        map_name=map_name,
        ai_candidate_name=ai_name,
        ai_candidate_confidence=0.85 if ai_name else None,
        ai_evidence_grounded=True,
    )
    return {
        "name": effective.name,
        "provenance": effective.provenance.value,
        "label": PUBLIC_NEIGHBOURHOOD_PROVENANCE_LABELS.get(
            effective.provenance.value, effective.label
        ),
    }


def assert_public_payload_is_safe(payload: dict[str, Any]) -> None:
    """Raise AssertionError when private enrichment fields leak publicly."""

    forbidden_keys = {
        "confidence",
        "evidence_snippet",
        "supporting_evidence",
        "token_usage",
        "tokens",
        "api_request_id",
        "prompt_version",
        "schema_version",
        "input_checksum",
        "field_decisions",
        "applied_attributes",
        "run_audit",
        "model",
        "cost_usd",
        "raw_html",
    }
    serialized = str(payload).lower()
    for key in forbidden_keys:
        if key in payload:
            raise AssertionError(f"private key leaked in public payload: {key}")
        # Confidence/evidence must not appear nested under public_attributes.
    for attr in payload.get("public_attributes") or []:
        if not isinstance(attr, dict):
            continue
        for key in ("confidence", "evidence", "evidence_snippet", "reasons"):
            if key in attr:
                raise AssertionError(f"private attribute field leaked: {key}")
    for needle in ("token_usage", "cost_usd", "supporting_evidence"):
        if needle in serialized:
            raise AssertionError(f"private marker present in public payload: {needle}")
