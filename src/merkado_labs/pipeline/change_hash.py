"""Canonical enrichment-input hash contract shared by pipeline selection paths.

Versioned contract ``enrichment_input_hash_v1``:

Includes:
- normalized source description / features / neighbourhood
- relevant source property facts
- map/AI effective neighbourhood when used by the prompt
- prompt + schema versions
- hash contract version

Excludes:
- observation / import / run timestamps and IDs
- image ordering and URL query/size variants
- cache / raw snapshot metadata
- policy decisions, accepted AI output, display description
- tokens / cost / review state
- volatile serializer ordering (dict keys sorted; feature order normalized)

Callers must use this module (or ``compute_input_checksum`` via the same
``EnrichmentInput``) for selection, prompt payload identity, stored hashes,
post-import invalidation, dry-run, scheduled, and manual pipelines.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any

HASH_CONTRACT_VERSION = "enrichment_input_hash_v1"


def _normalize(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): _normalize(item)
            for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))
        }
    if isinstance(value, set | frozenset):
        return sorted((_normalize(item) for item in value), key=lambda item: repr(item))
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        normalized = [_normalize(item) for item in value]
        return sorted(normalized, key=lambda item: json.dumps(item, sort_keys=True, default=str))
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, str):
        return " ".join(value.split())
    if value is False:
        return False
    if value is True:
        return True
    if value is None:
        return None
    return value


def _listing_to_enrichment_input(listing: Mapping[str, Any]):
    """Build EnrichmentInput without importing jobs at module import time."""

    from merkado_labs.enrichment.jobs import listing_to_enrichment_input

    row = dict(listing)
    if "id" not in row:
        row["id"] = row.get("external_id") or "hash-preview"
    if "external_id" not in row:
        row["external_id"] = str(row.get("id") or "hash-preview")
    return listing_to_enrichment_input(row)


def compute_semantic_source_checksum(listing: Mapping[str, Any]) -> str:
    """Hash semantic source/prompt inputs excluding prompt/schema versions.

    Used for zero-cost prompt/schema migration: when this matches a prior
    successful Terra proposal checksum (or its semantic twin), AI is skipped.
    """

    from merkado_labs.enrichment import compute_input_checksum

    return compute_input_checksum(_listing_to_enrichment_input(listing))


def compute_enrichment_input_hash(listing: Mapping[str, Any]) -> str:
    """Canonical selection hash including contract + prompt/schema versions."""

    from merkado_labs.enrichment import (
        PROMPT_VERSION,
        SCHEMA_VERSION,
        semantic_checksum_content,
    )

    enrichment_input = _listing_to_enrichment_input(listing)
    payload = {
        "hash_contract_version": HASH_CONTRACT_VERSION,
        "prompt_version": enrichment_input.prompt_version or PROMPT_VERSION,
        "schema_version": enrichment_input.schema_version or SCHEMA_VERSION,
        "semantic": semantic_checksum_content(enrichment_input),
    }
    encoded = json.dumps(
        _normalize(payload),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def compute_image_membership_hash(image_urls: Sequence[str] | None) -> str:
    """Hash sorted unique gallery URLs for tracking, separate from AI selection."""

    urls = sorted({str(url).strip() for url in image_urls or () if str(url).strip()})
    return hashlib.sha256(
        json.dumps(urls, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
