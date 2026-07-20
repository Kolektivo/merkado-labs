from merkado_labs.pipeline.change_hash import (
    compute_enrichment_input_hash,
    compute_image_membership_hash,
)


def test_operational_fields_and_image_order_do_not_change_enrichment_hash() -> None:
    base = {
        "description": "A bright home",
        "amenities": [{"key": "pool", "value": True}],
        "source_neighbourhood_text": "Jan Thiel",
        "property_type": "villa",
        "bedrooms": 3,
        "image_urls": ["b.jpg", "a.jpg"],
        "updated_at": "2026-07-20T00:00:00Z",
        "pipeline_run_id": "run-1",
    }
    changed = {
        **base,
        "image_urls": ["c.jpg", "a.jpg"],
        "updated_at": "2026-07-21T00:00:00Z",
        "pipeline_run_id": "run-2",
    }
    assert compute_enrichment_input_hash(base) == compute_enrichment_input_hash(changed)


def test_meaningful_fields_change_enrichment_hash() -> None:
    base = {"description": "A bright home", "bedrooms": 3}
    assert compute_enrichment_input_hash(base) != compute_enrichment_input_hash(
        {**base, "bedrooms": 4}
    )


def test_gallery_membership_hash_is_order_insensitive() -> None:
    assert compute_image_membership_hash(["b", "a", "a"]) == compute_image_membership_hash(
        ["a", "b"]
    )
    assert compute_image_membership_hash(["a"]) != compute_image_membership_hash(["b"])
