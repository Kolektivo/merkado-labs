"""Tests for CHH amenity mapping and realtor attribution extraction."""

from __future__ import annotations

from experiments.caribbeanhousehunt_sample.chh_amenities import (
    CHH_AMENITY_LABELS,
    normalize_amenity_codes,
)
from experiments.caribbeanhousehunt_sample.create_snapshot import (
    EXTRACTOR_VERSION,
    build_index_record,
    canonical_realtor_url,
    realtor_domain_from_url,
)
from experiments.caribbeanhousehunt_sample.realtor_enrichment.base import (
    EnrichmentField,
    detect_conflicts,
)
from experiments.caribbeanhousehunt_sample.realtor_enrichment.robots import (
    RobotsDecision,
    robots_url_for_domain,
)


def test_amenity_labels_are_evidence_backed_only() -> None:
    amenities = normalize_amenity_codes([11, 3, 11, "6", "nope"])
    assert [row["code"] for row in amenities] == [3, 6, 11]
    assert amenities[0]["label"] is None
    assert amenities[0]["label_status"] == "unlabeled"
    assert amenities[1]["label"] == "Furnished"
    assert amenities[2]["label"] == "Swimming pool"
    assert amenities[1]["evidence"]
    assert 3 not in CHH_AMENITY_LABELS


def test_build_index_record_extracts_realtor_attribution() -> None:
    raw = {
        "urlid": 22008,
        "id": 1,
        "url_page": "https://Moretrealestate.com/en/properties/x?utm_source=chh",
        "realtor_name": "Moret Real Estate",
        "realtor_id": 49,
        "realtor_filtername": "moret",
        "status": "for rent",
        "property_type": "apartment",
        "bedrooms": "2",
        "floor_area": 90,
        "lot_area": 0.12,
        "neighborhood": "Jongbloed",
        "lat": 12.1,
        "lng": -68.9,
        "image_url": "abc.webp",
        "description": "A modern apartment.",
        "street": "Example Street",
        "house_number": "12",
        "resort": "Hippique Residences",
        "coordinates_source": "html_page",
        "amenity": [11, 6],
        "price_naf": 3350,
        "price_usd": None,
        "price_eur": None,
        "property_title": "Test",
    }
    record = build_index_record(raw)
    assert record["original_realtor_name"] == "Moret Real Estate"
    assert record["original_realtor_domain"] == "moretrealestate.com"
    assert record["original_realtor_external_id"] == "49"
    assert record["original_realtor_filter_slug"] == "moret"
    assert record["original_realtor_url"].startswith("https://")
    assert record["attribution_method"] == "chh_bulk_json"
    assert record["source_listing_status"] == "for rent"
    assert record["listing_type"] == "rent"
    assert record["lot_area_value"] == 0.12
    assert record["lot_area_unit"] is None
    assert record["description"] == "A modern apartment."
    assert record["resort"] == "Hippique Residences"
    assert {row["code"] for row in record["amenities"]} == {6, 11}
    assert record["field_provenance"]["original_realtor_name"]["aggregator_source"] == (
        "CaribbeanHouseHunt"
    )
    assert record["field_provenance"]["lot_area_value"]["unit_status"] == "unknown_not_claimed"
    assert record["data_completeness_score"] >= 80
    assert record["extractor_version"] == EXTRACTOR_VERSION
    assert EXTRACTOR_VERSION.startswith("0.3")


def test_original_url_validation_helpers() -> None:
    assert (
        canonical_realtor_url("https://Example.com/listing/?utm_source=x&keep=1")
        == "https://example.com/listing?keep=1"
    )
    assert realtor_domain_from_url("https://www.Example.com/a") == "www.example.com"
    assert realtor_domain_from_url("not-a-url") is None


def test_conflict_detection_records_disagreement() -> None:
    conflicts = detect_conflicts(
        {"bedrooms": 2, "floor_area_m2": 90},
        (
            EnrichmentField("bedrooms", 3, "rooms: 3"),
            EnrichmentField("title", "Villa"),
        ),
    )
    assert len(conflicts) == 1
    assert conflicts[0]["field_name"] == "bedrooms"
    assert conflicts[0]["resolution_status"] == "unresolved"


def test_robots_url_builder_and_blocked_decision_shape() -> None:
    assert robots_url_for_domain("century21numberone.com") == (
        "https://century21numberone.com/robots.txt"
    )
    decision = RobotsDecision(
        domain="example.com",
        robots_url="https://example.com/robots.txt",
        fetch_status="http_403",
        can_fetch=False,
        crawl_delay_seconds=None,
        notes="blocked",
    )
    assert decision.can_fetch is False
