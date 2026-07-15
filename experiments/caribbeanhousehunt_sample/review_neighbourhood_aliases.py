"""Generate deterministic neighbourhood-alias candidates for human review."""

from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from typing import Any
from urllib.parse import urlparse

from merkado_labs.config import Settings

LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
PAGE_SIZE = 500


def verify_labs_project(settings: Settings) -> str:
    """Return the allowlisted Labs URL or stop before database access."""

    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError(f"Refusing database access outside Labs ref {LABS_PROJECT_REF!r}.")
    if settings.supabase_url is None:
        raise RuntimeError("SUPABASE_URL is required.")
    url = str(settings.supabase_url).rstrip("/")
    parsed = urlparse(url)
    expected_host = f"{LABS_PROJECT_REF}.supabase.co"
    if parsed.scheme != "https" or parsed.hostname != expected_host:
        raise RuntimeError(f"Refusing database access outside Labs host {expected_host!r}.")
    return url


def verify_before_write(settings: Settings) -> None:
    """Re-check the allowlisted project immediately before a write."""

    verify_labs_project(settings)


def batches(values: list[Any], size: int = 100) -> Iterable[list[Any]]:
    """Yield bounded API batches."""

    for start in range(0, len(values), size):
        yield values[start : start + size]


def fetch_all(query: Any) -> list[dict[str, Any]]:
    """Fetch a PostgREST query without accepting its row cap."""

    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        page = query.range(start, start + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


@dataclass(frozen=True)
class NeighbourhoodStats:
    """A neighbourhood name and the evidence available for comparison."""

    id: str
    name: str
    listing_count: int
    coordinate_count: int
    latitude_min: float | None
    latitude_max: float | None
    longitude_min: float | None
    longitude_max: float | None
    latitude_mean: float | None
    longitude_mean: float | None


@dataclass(frozen=True)
class AliasCandidate:
    """One deterministic source-to-canonical review proposal."""

    source_neighbourhood_id: str
    source_name: str
    canonical_neighbourhood_id: str
    canonical_name: str
    status: str
    match_method: str
    confidence: float
    notes: str
    classification: str
    source_listing_count: int
    canonical_listing_count: int
    centroid_distance_km: float | None


def parse_args() -> argparse.Namespace:
    """Parse review options."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Generate without database writes.")
    return parser.parse_args()


def formatting_key(value: str) -> str:
    """Normalize case, accents, punctuation, and whitespace only."""

    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    )
    words = re.sub(r"[^a-z0-9]+", " ", ascii_value.casefold())
    return " ".join(words.split())


def tokens(value: str) -> tuple[str, ...]:
    """Return deterministic comparison tokens."""

    return tuple(formatting_key(value).split())


def centroid_distance_km(left: NeighbourhoodStats, right: NeighbourhoodStats) -> float | None:
    """Calculate haversine distance between available listing centroids."""

    if (
        left.latitude_mean is None
        or left.longitude_mean is None
        or right.latitude_mean is None
        or right.longitude_mean is None
    ):
        return None
    latitude_1, latitude_2 = map(math.radians, (left.latitude_mean, right.latitude_mean))
    delta_latitude = latitude_2 - latitude_1
    delta_longitude = math.radians(right.longitude_mean - left.longitude_mean)
    haversine = (
        math.sin(delta_latitude / 2) ** 2
        + math.cos(latitude_1)
        * math.cos(latitude_2)
        * math.sin(delta_longitude / 2) ** 2
    )
    return 6371.0088 * 2 * math.asin(math.sqrt(haversine))


def choose_canonical(values: list[NeighbourhoodStats]) -> NeighbourhoodStats:
    """Prefer the best-evidenced and least-punctuated display name."""

    return sorted(
        values,
        key=lambda item: (
            -item.listing_count,
            len(re.findall(r"[^\w\s]", item.name, flags=re.UNICODE)),
            len(item.name),
            item.name.casefold(),
        ),
    )[0]


def exact_candidates(
    neighbourhoods: list[NeighbourhoodStats],
) -> tuple[list[AliasCandidate], set[str]]:
    """Approve only names equal after formatting normalization."""

    grouped: defaultdict[str, list[NeighbourhoodStats]] = defaultdict(list)
    for neighbourhood in neighbourhoods:
        grouped[formatting_key(neighbourhood.name)].append(neighbourhood)

    candidates: list[AliasCandidate] = []
    involved: set[str] = set()
    for group in grouped.values():
        if len(group) < 2:
            continue
        canonical = choose_canonical(group)
        involved.update(item.id for item in group)
        for source in group:
            if source.id == canonical.id:
                continue
            distance = centroid_distance_km(source, canonical)
            candidates.append(
                AliasCandidate(
                    source_neighbourhood_id=source.id,
                    source_name=source.name,
                    canonical_neighbourhood_id=canonical.id,
                    canonical_name=canonical.name,
                    status="approved",
                    match_method="exact_formatting",
                    confidence=1.0,
                    notes=(
                        "Equal after case, accent, punctuation, and whitespace normalization; "
                        "no geographic or semantic inference used."
                    ),
                    classification="exact_trivial",
                    source_listing_count=source.listing_count,
                    canonical_listing_count=canonical.listing_count,
                    centroid_distance_km=round(distance, 3) if distance is not None else None,
                )
            )
    return candidates, involved


def semantic_relation(left: NeighbourhoodStats, right: NeighbourhoodStats) -> tuple[float, bool]:
    """Return spelling similarity and whether one token set contains the other."""

    left_key = formatting_key(left.name)
    right_key = formatting_key(right.name)
    similarity = SequenceMatcher(None, left_key, right_key).ratio()
    left_tokens = set(left_key.split())
    right_tokens = set(right_key.split())
    containment = bool(left_tokens and right_tokens) and (
        left_tokens < right_tokens or right_tokens < left_tokens
    )
    return similarity, containment


def pending_candidates(
    neighbourhoods: list[NeighbourhoodStats],
    exact_involved: set[str],
) -> tuple[list[AliasCandidate], set[str]]:
    """Propose one strongest non-exact candidate per source, always pending."""

    options: defaultdict[str, list[tuple[float, AliasCandidate]]] = defaultdict(list)
    related: set[str] = set()
    for index, left in enumerate(neighbourhoods):
        for right in neighbourhoods[index + 1 :]:
            if left.id in exact_involved or right.id in exact_involved:
                continue
            left_key = formatting_key(left.name)
            right_key = formatting_key(right.name)
            if (
                re.fullmatch(r"[a-z] section", left_key)
                and re.fullmatch(r"[a-z] section", right_key)
                and left_key != right_key
            ):
                continue
            similarity, containment = semantic_relation(left, right)
            distance = centroid_distance_km(left, right)
            if not containment and similarity < 0.82:
                continue
            if distance is None or distance > 10:
                continue

            canonical = choose_canonical([left, right])
            source = right if canonical.id == left.id else left
            if source.listing_count == canonical.listing_count:
                canonical, source = sorted(
                    (left, right), key=lambda item: (len(item.name), item.name.casefold())
                )
            close = distance <= 2
            likely = close and (containment or similarity >= 0.86)
            classification = "likely_alias" if likely else "ambiguous"
            method = "name_and_coordinates" if likely else "ambiguous_name_or_geography"
            confidence = (
                min(0.94, 0.68 + similarity * 0.18 + max(0, 2 - distance) * 0.04)
                if likely
                else min(0.79, 0.48 + similarity * 0.2 + max(0, 10 - distance) * 0.01)
            )
            reason = (
                f"name similarity={similarity:.3f}; token_containment={containment}; "
                f"centroid_distance_km={distance:.3f}. "
                "Pending because this requires geographic or semantic judgment."
            )
            candidate = AliasCandidate(
                source_neighbourhood_id=source.id,
                source_name=source.name,
                canonical_neighbourhood_id=canonical.id,
                canonical_name=canonical.name,
                status="pending",
                match_method=method,
                confidence=round(confidence, 3),
                notes=reason,
                classification=classification,
                source_listing_count=source.listing_count,
                canonical_listing_count=canonical.listing_count,
                centroid_distance_km=round(distance, 3),
            )
            score = (1 if likely else 0) + similarity - distance / 100
            options[source.id].append((score, candidate))
            related.update((left.id, right.id))

    candidates = [
        sorted(values, key=lambda item: (-item[0], item[1].canonical_name.casefold()))[0][1]
        for values in options.values()
    ]
    return sorted(candidates, key=lambda item: item.source_name.casefold()), related


def generate_candidates(
    neighbourhoods: list[NeighbourhoodStats],
) -> tuple[list[AliasCandidate], list[str]]:
    """Generate safe exact approvals and pending review candidates."""

    exact, exact_involved = exact_candidates(neighbourhoods)
    pending, semantic_involved = pending_candidates(neighbourhoods, exact_involved)
    involved = exact_involved | semantic_involved
    clearly_distinct = sorted(
        item.name for item in neighbourhoods if item.id not in involved
    )
    return sorted(exact + pending, key=lambda item: item.source_name.casefold()), clearly_distinct


def to_stats(
    neighbourhood_rows: list[dict[str, Any]], listing_rows: list[dict[str, Any]]
) -> list[NeighbourhoodStats]:
    """Aggregate listing counts and coordinate ranges by stored neighbourhood."""

    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    for listing in listing_rows:
        if listing.get("neighbourhood_id"):
            grouped[str(listing["neighbourhood_id"])].append(listing)

    values = []
    for row in neighbourhood_rows:
        listings = grouped[str(row["id"])]
        coordinates = [
            (float(item["latitude"]), float(item["longitude"]))
            for item in listings
            if item.get("latitude") is not None and item.get("longitude") is not None
        ]
        latitudes = [point[0] for point in coordinates]
        longitudes = [point[1] for point in coordinates]
        values.append(
            NeighbourhoodStats(
                id=str(row["id"]),
                name=str(row["name"]),
                listing_count=len(listings),
                coordinate_count=len(coordinates),
                latitude_min=min(latitudes) if latitudes else None,
                latitude_max=max(latitudes) if latitudes else None,
                longitude_min=min(longitudes) if longitudes else None,
                longitude_max=max(longitudes) if longitudes else None,
                latitude_mean=sum(latitudes) / len(latitudes) if latitudes else None,
                longitude_mean=sum(longitudes) / len(longitudes) if longitudes else None,
            )
        )
    return values


def persist_candidates(
    client: Any,
    settings: Settings,
    candidates: list[AliasCandidate],
    existing_source_ids: set[str],
) -> int:
    """Insert only new candidates so reruns never overwrite human review."""

    payloads = [
        {
            "source_neighbourhood_id": item.source_neighbourhood_id,
            "canonical_neighbourhood_id": item.canonical_neighbourhood_id,
            "status": item.status,
            "match_method": item.match_method,
            "confidence": item.confidence,
            "notes": item.notes,
        }
        for item in candidates
        if item.source_neighbourhood_id not in existing_source_ids
    ]
    for payload_batch in batches(payloads):
        verify_before_write(settings)
        client.table("neighbourhood_aliases").insert(payload_batch).execute()
    return len(payloads)


def main() -> None:
    """Audit names and optionally store deterministic review candidates."""

    args = parse_args()
    settings = Settings()
    url = verify_labs_project(settings)
    if settings.supabase_secret_key is None:
        raise RuntimeError("SUPABASE_SECRET_KEY is required for alias review.")

    from supabase import create_client

    client = create_client(url, settings.supabase_secret_key.get_secret_value())
    neighbourhood_rows = fetch_all(client.table("neighbourhoods").select("id,name"))
    listing_rows = fetch_all(
        client.table("property_listings").select(
            "neighbourhood_id,latitude,longitude"
        )
    )
    neighbourhoods = to_stats(neighbourhood_rows, listing_rows)
    candidates, clearly_distinct = generate_candidates(neighbourhoods)
    existing = fetch_all(
        client.table("neighbourhood_aliases").select("source_neighbourhood_id,status")
    )
    existing_source_ids = {str(row["source_neighbourhood_id"]) for row in existing}

    classifications = Counter(item.classification for item in candidates)
    statuses = Counter(item.status for item in candidates)
    summary: dict[str, Any] = {
        "project_ref": LABS_PROJECT_REF,
        "dry_run": args.dry_run,
        "neighbourhood_records": len(neighbourhoods),
        "candidate_alias_count": len(candidates),
        "automatically_approved_exact_variants": statuses["approved"],
        "pending_candidates": statuses["pending"],
        "rejected_candidates": sum(row["status"] == "rejected" for row in existing),
        "classifications": dict(sorted(classifications.items())),
        "clearly_distinct_count": len(clearly_distinct),
        "clearly_distinct_neighbourhoods": clearly_distinct,
        "candidates": [asdict(item) for item in candidates],
    }
    if not args.dry_run:
        summary["inserted_candidates"] = persist_candidates(
            client, settings, candidates, existing_source_ids
        )
    print(json.dumps(summary, indent=2, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    main()
