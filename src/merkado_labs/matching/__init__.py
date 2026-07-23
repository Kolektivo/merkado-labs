"""Deterministic Property Search Request matching (Labs preview).

Rules-based only. No AI, no email delivery, no billing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal

SCORING_VERSION = "rules_v1"

TransactionType = Literal["sale", "rent", "either"]


@dataclass(frozen=True)
class SearchRequestProfile:
    """Normalized search criteria used by the matcher."""

    transaction_type: TransactionType | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    price_currency: str = "XCG"
    min_bedrooms: float | None = None
    min_bathrooms: float | None = None
    min_floor_area_m2: Decimal | None = None
    property_types: tuple[str, ...] = ()
    preferred_neighbourhoods: tuple[str, ...] = ()
    excluded_neighbourhoods: tuple[str, ...] = ()
    must_haves: tuple[str, ...] = ()
    preferences: tuple[str, ...] = ()
    dealbreakers: tuple[str, ...] = ()


@dataclass(frozen=True)
class ListingMatchCandidate:
    """Minimal listing facts for deterministic matching."""

    listing_id: str
    external_id: str
    listing_type: str | None
    property_type: str | None
    status: str | None
    public_eligible: bool
    benchmark_price_xcg: Decimal | None
    bedrooms: float | None
    bathrooms: float | None
    floor_area_m2: Decimal | None
    neighbourhood_text: str | None
    amenities: tuple[str, ...] = ()
    title: str | None = None


@dataclass(frozen=True)
class MatchResult:
    listing_id: str
    hard_pass: bool
    match_score: float
    match_reasons: list[str] = field(default_factory=list)
    trade_offs: list[str] = field(default_factory=list)
    evidence: dict[str, Any] = field(default_factory=dict)
    scoring_version: str = SCORING_VERSION


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _amenity_codes(amenities: tuple[str, ...]) -> set[str]:
    return {_norm(a) for a in amenities if a}


def _neighbourhood_matches(text: str | None, needles: tuple[str, ...]) -> bool:
    hay = _norm(text)
    if not hay:
        return False
    return any(_norm(n) and _norm(n) in hay for n in needles)


def score_listing(
    request: SearchRequestProfile,
    listing: ListingMatchCandidate,
) -> MatchResult:
    """Score one listing against a search request.

    Hard filters exclude clearly unsuitable listings (hard_pass=False, score=0).
    Soft preferences raise the score with explainable reasons/trade-offs.
    """

    reasons: list[str] = []
    trade_offs: list[str] = []
    evidence: dict[str, Any] = {
        "listing_external_id": listing.external_id,
        "benchmark_price_xcg": (
            str(listing.benchmark_price_xcg) if listing.benchmark_price_xcg is not None else None
        ),
        "neighbourhood_text": listing.neighbourhood_text,
        "status": listing.status,
        "public_eligible": listing.public_eligible,
    }

    if not listing.public_eligible or _norm(listing.status) != "active":
        return MatchResult(
            listing_id=listing.listing_id,
            hard_pass=False,
            match_score=0.0,
            match_reasons=[],
            trade_offs=["Listing is not publicly eligible or not active."],
            evidence=evidence,
        )

    if request.excluded_neighbourhoods and _neighbourhood_matches(
        listing.neighbourhood_text, request.excluded_neighbourhoods
    ):
        return MatchResult(
            listing_id=listing.listing_id,
            hard_pass=False,
            match_score=0.0,
            trade_offs=["Neighbourhood is in the excluded list."],
            evidence=evidence,
        )

    if request.transaction_type and request.transaction_type != "either":
        lt = _norm(listing.listing_type)
        wanted = request.transaction_type
        if lt and lt not in {wanted, f"for_{wanted}", f"homes_for_{wanted}"}:
            # Accept common aliases
            aliases = {
                "sale": {"sale", "buy", "for-sale", "for_sale", "homes-for-sale"},
                "rent": {"rent", "rental", "for-rent", "for_rent", "homes-for-rent"},
            }
            if lt not in aliases.get(wanted, set()):
                return MatchResult(
                    listing_id=listing.listing_id,
                    hard_pass=False,
                    match_score=0.0,
                    trade_offs=[
                        f"Transaction type {listing.listing_type!r} "
                        f"does not match {wanted}."
                    ],
                    evidence=evidence,
                )

    price = listing.benchmark_price_xcg
    if request.min_price is not None and price is not None and price < request.min_price:
        return MatchResult(
            listing_id=listing.listing_id,
            hard_pass=False,
            match_score=0.0,
            trade_offs=["Asking benchmark is below the requested minimum."],
            evidence=evidence,
        )
    if request.max_price is not None and price is None:
        # Trustworthy XCG required — cannot falsely pass a budget filter.
        return MatchResult(
            listing_id=listing.listing_id,
            hard_pass=False,
            match_score=0.0,
            trade_offs=[
                "No reliable XCG price available to check against the budget."
            ],
            evidence=evidence,
        )
    if request.max_price is not None and price is not None and price > request.max_price:
        return MatchResult(
            listing_id=listing.listing_id,
            hard_pass=False,
            match_score=0.0,
            trade_offs=["Asking benchmark exceeds the requested maximum."],
            evidence=evidence,
        )

    if request.min_bedrooms is not None:
        if listing.bedrooms is None:
            trade_offs.append("Bedroom count unknown.")
        elif listing.bedrooms < request.min_bedrooms:
            return MatchResult(
                listing_id=listing.listing_id,
                hard_pass=False,
                match_score=0.0,
                trade_offs=["Fewer bedrooms than requested."],
                evidence=evidence,
            )

    if request.min_bathrooms is not None:
        if listing.bathrooms is None:
            trade_offs.append("Bathroom count unknown.")
        elif listing.bathrooms < request.min_bathrooms:
            return MatchResult(
                listing_id=listing.listing_id,
                hard_pass=False,
                match_score=0.0,
                trade_offs=["Fewer bathrooms than requested."],
                evidence=evidence,
            )

    if request.min_floor_area_m2 is not None:
        if listing.floor_area_m2 is None:
            trade_offs.append("Floor area unknown.")
        elif listing.floor_area_m2 < request.min_floor_area_m2:
            return MatchResult(
                listing_id=listing.listing_id,
                hard_pass=False,
                match_score=0.0,
                trade_offs=["Floor area below requested minimum."],
                evidence=evidence,
            )

    if request.property_types:
        pt = _norm(listing.property_type)
        wanted_types = {_norm(t) for t in request.property_types}
        if pt and not any(w in pt or pt in w for w in wanted_types):
            return MatchResult(
                listing_id=listing.listing_id,
                hard_pass=False,
                match_score=0.0,
                trade_offs=[f"Property type {listing.property_type!r} not in requested types."],
                evidence=evidence,
            )

    # Required locations are a hard filter when provided.
    if request.preferred_neighbourhoods:
        if not listing.neighbourhood_text:
            return MatchResult(
                listing_id=listing.listing_id,
                hard_pass=False,
                match_score=0.0,
                trade_offs=[
                    "Location is not listed, so it cannot meet the area requirement."
                ],
                evidence=evidence,
            )
        if not _neighbourhood_matches(
            listing.neighbourhood_text, request.preferred_neighbourhoods
        ):
            return MatchResult(
                listing_id=listing.listing_id,
                hard_pass=False,
                match_score=0.0,
                trade_offs=["Not in one of the required locations."],
                evidence=evidence,
            )

    amenity_set = _amenity_codes(listing.amenities)
    for must in request.must_haves:
        token = _norm(must)
        if token and token not in amenity_set and token not in _norm(listing.title):
            # Soft-fail must-haves when amenities are sparse: treat as trade-off
            trade_offs.append(f"Must-have not evidenced: {must}.")

    for deal in request.dealbreakers:
        token = _norm(deal)
        if token and (token in amenity_set or token in _norm(listing.title)):
            return MatchResult(
                listing_id=listing.listing_id,
                hard_pass=False,
                match_score=0.0,
                trade_offs=[f"Dealbreaker present: {deal}."],
                evidence=evidence,
            )

    score = 0.35
    reasons.append("Meets core requirements.")

    if price is not None and request.max_price is not None:
        score += 0.15
        reasons.append("Within requested maximum XCG budget.")
    if request.min_bedrooms is not None and listing.bedrooms is not None:
        score += 0.1
        reasons.append(f"Has at least {request.min_bedrooms:g} bedrooms.")
    if request.preferred_neighbourhoods:
        score += 0.2
        reasons.append("Located in a required neighbourhood.")
    else:
        score += 0.05

    for must in request.must_haves:
        token = _norm(must)
        if token and (token in amenity_set or token in _norm(listing.title)):
            score += 0.06
            reasons.append(f"Includes required feature: {must}.")
        elif token:
            score = max(0.0, score - 0.04)

    for pref in request.preferences:
        token = _norm(pref)
        if token and (token in amenity_set or token in _norm(listing.title)):
            score += 0.05
            reasons.append(f"Preference evidenced: {pref}.")
        elif token:
            trade_offs.append(f"Preference not evidenced: {pref}.")

    score = float(min(1.0, round(score, 4)))
    return MatchResult(
        listing_id=listing.listing_id,
        hard_pass=True,
        match_score=score,
        match_reasons=reasons,
        trade_offs=trade_offs,
        evidence=evidence,
    )


def rank_listings(
    request: SearchRequestProfile,
    listings: list[ListingMatchCandidate],
    *,
    limit: int = 25,
) -> list[MatchResult]:
    """Return hard-passing matches sorted by score descending."""

    scored = [score_listing(request, listing) for listing in listings]
    passing = [m for m in scored if m.hard_pass]
    passing.sort(key=lambda m: m.match_score, reverse=True)
    return passing[:limit]


def what_fits_me_to_request(
    *,
    budget_max_xcg: Decimal | None,
    min_bedrooms: float | None,
    preferred_neighbourhoods: list[str] | None,
    renovation_willingness: str | None,
    transaction_type: TransactionType = "sale",
) -> SearchRequestProfile:
    """Map a short guided intake into a draft search profile."""

    prefs: list[str] = []
    if renovation_willingness in {"none", "light"}:
        prefs.append("move-in ready")
    elif renovation_willingness in {"moderate", "major"}:
        prefs.append("renovation candidate")

    return SearchRequestProfile(
        transaction_type=transaction_type,
        max_price=budget_max_xcg,
        min_bedrooms=min_bedrooms,
        preferred_neighbourhoods=tuple(preferred_neighbourhoods or ()),
        preferences=tuple(prefs),
    )
