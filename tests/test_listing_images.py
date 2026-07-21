"""Shared listing image gallery contract tests (no live network)."""

from __future__ import annotations

from merkado_labs.scrapers.images import (
    DEFAULT_GALLERY_SAFETY_CAP,
    build_gallery,
    canonicalize_image_url,
    image_identity_key,
    is_likely_contamination,
)


def test_dedupe_tracking_params_and_primary() -> None:
    urls = [
        "https://cdn.example.com/a.jpg?utm_source=x",
        "https://cdn.example.com/a.jpg",
        "https://cdn.example.com/b.jpg",
    ]
    gallery = build_gallery(urls, primary_url="https://cdn.example.com/b.jpg")
    assert gallery.primary_url == "https://cdn.example.com/b.jpg"
    assert gallery.urls[0] == "https://cdn.example.com/b.jpg"
    assert len(gallery.urls) == 2
    assert gallery.duplicates_removed >= 1


def test_contamination_and_invalid_filtered() -> None:
    urls = [
        "https://cdn.example.com/listing1.jpg",
        "https://cdn.example.com/agent-avatar.png",
        "https://cdn.example.com/company-logo.svg",
        "data:image/png;base64,aaa",
        "https://maps.googleapis.com/maps/api/staticmap?center=1,2",
    ]
    gallery = build_gallery(urls)
    assert gallery.urls == ["https://cdn.example.com/listing1.jpg"]
    assert gallery.contamination_removed >= 1
    assert gallery.invalid_removed >= 1


def test_safety_cap_warns() -> None:
    urls = [f"https://cdn.example.com/img{i}.jpg" for i in range(60)]
    gallery = build_gallery(urls, safety_cap=10)
    assert len(gallery.urls) == 10
    assert gallery.truncated is True
    assert any("gallery_truncated" in w for w in gallery.warnings)


def test_canonicalize_strips_utm_keeps_transform() -> None:
    raw = "http://CDN.Example.com/path/img.jpg?utm_campaign=test&w=800"
    canon = canonicalize_image_url(raw)
    assert canon.startswith("https://cdn.example.com/")
    assert "utm_campaign" not in canon
    assert "w=800" in canon


def test_canonicalize_decodes_html_entities() -> None:
    raw = "https://cdn.example.com/a.jpg?foo=1&#038;utm_source=x"
    canon = canonicalize_image_url(raw)
    assert "utm_source" not in canon
    assert "foo=1" in canon
    assert "&#038;" not in canon
    assert "&amp;" not in canon


def test_wordpress_size_suffix_identity() -> None:
    urls = [
        "https://site.example/wp-content/uploads/2024/01/living-300x200.jpg",
        "https://site.example/wp-content/uploads/2024/01/living.jpg",
        "https://site.example/wp-content/uploads/2024/01/living-835x540.jpg",
    ]
    gallery = build_gallery(urls)
    assert len(gallery.urls) == 1
    assert gallery.urls[0].endswith("/living.jpg")
    assert "-300x200" not in gallery.urls[0]


def test_cover_repeated_in_gallery() -> None:
    cover = "https://cdn.example.com/cover.jpg"
    gallery = build_gallery(
        [cover, "https://cdn.example.com/room.jpg", cover],
        primary_url=cover,
    )
    assert gallery.urls == [cover, "https://cdn.example.com/room.jpg"]
    assert gallery.primary_url == cover
    assert gallery.duplicates_removed >= 1


def test_remax_href_src_size_variants_collapse() -> None:
    """Every slide as href (1000x) + src (607x) must collapse to one URL."""

    urls = [
        "https://cdn.remax-abc.com/img/cache/11-1775162488-1000x667.jpg",
        "https://cdn.remax-abc.com/img/cache/11-1775162488-607x405.jpg",
        "https://cdn.remax-abc.com/img/cache/12-1775162489-1000x667.jpg",
        "https://cdn.remax-abc.com/img/cache/12-1775162490-607x405.jpg",  # +1s drift
    ]
    gallery = build_gallery(urls)
    assert len(gallery.urls) == 2
    assert "1000x667" in gallery.urls[0]
    assert "1000x667" in gallery.urls[1]
    assert gallery.duplicates_removed == 2


def test_remax_prefers_larger_when_primary_is_thumb() -> None:
    thumb = "https://cdn.remax-abc.com/img/cache/11-1775162488-607x405.jpg"
    full = "https://cdn.remax-abc.com/img/cache/11-1775162488-1000x667.jpg"
    gallery = build_gallery([full], primary_url=thumb)
    assert gallery.urls == [full]
    assert gallery.primary_url == full


def test_transform_query_variants_collapse_prefer_larger() -> None:
    urls = [
        "https://cdn.example.com/photo.jpg?w=400&h=300",
        "https://cdn.example.com/photo.jpg?w=800&h=600",
        "https://cdn.example.com/photo.jpg?w=400&h=300&q=60",
    ]
    gallery = build_gallery(urls)
    assert gallery.urls == ["https://cdn.example.com/photo.jpg?w=800&h=600"]
    assert gallery.duplicates_removed == 2


def test_transform_query_keeps_distinct_paths() -> None:
    urls = [
        "https://cdn.example.com/photo-a.jpg?w=800",
        "https://cdn.example.com/photo-b.jpg?w=800",
    ]
    gallery = build_gallery(urls)
    assert len(gallery.urls) == 2
    assert gallery.duplicates_removed == 0


def test_remax_empty_body_near_aspect_collapses() -> None:
    """CDN names with no image id: only collapse near-identical aspects."""

    urls = [
        "https://cdn.remax-abc.com/img/cache/-1761237153-1000x559.jpg",
        "https://cdn.remax-abc.com/img/cache/-1761237153-1000x561.jpg",
        "https://cdn.remax-abc.com/img/cache/-1761237153-1000x480.jpg",  # different aspect
    ]
    gallery = build_gallery(urls)
    assert len(gallery.urls) == 2
    assert "1000x561" in gallery.urls[0]  # larger area of the ~1.78 pair
    assert "1000x480" in gallery.urls[1]
    assert gallery.duplicates_removed == 1


def test_remax_empty_body_adjacent_timestamp_kept() -> None:
    """Do not merge empty-body photos across neighboring timestamps."""

    urls = [
        "https://cdn.remax-abc.com/img/cache/-1723103975-1000x563.jpg",
        "https://cdn.remax-abc.com/img/cache/-1723103976-1000x562.jpg",
    ]
    gallery = build_gallery(urls)
    assert len(gallery.urls) == 2
    assert gallery.duplicates_removed == 0


def test_url_query_tracking_variants_dedupe() -> None:
    urls = [
        "https://cdn.example.com/a.jpg?utm_source=newsletter",
        "https://cdn.example.com/a.jpg?fbclid=abc",
        "https://cdn.example.com/a.jpg",
    ]
    gallery = build_gallery(urls)
    assert gallery.urls == ["https://cdn.example.com/a.jpg"]


def test_logo_hint() -> None:
    assert is_likely_contamination("https://site.com/wp-content/uploads/logo.png")
    assert not is_likely_contamination(
        "https://site.com/wp-content/uploads/2024/01/living-room.jpg"
    )


def test_default_cap_constant() -> None:
    assert DEFAULT_GALLERY_SAFETY_CAP == 50


def test_idempotent_build_repeated_import() -> None:
    urls = [
        "https://cdn.remax-abc.com/img/cache/11-1775162488-1000x667.jpg",
        "https://cdn.remax-abc.com/img/cache/11-1775162488-607x405.jpg",
        "https://cdn.example.com/room.jpg?utm_medium=email",
        "https://cdn.example.com/room.jpg",
    ]
    first = build_gallery(urls)
    second = build_gallery(first.urls, primary_url=first.primary_url)
    third = build_gallery(second.urls, primary_url=second.primary_url)
    assert first.urls == second.urls == third.urls
    assert first.primary_url == second.primary_url == third.primary_url


def test_image_identity_key_remax_ignores_dimensions() -> None:
    a = "https://cdn.remax-abc.com/img/cache/11-1775162488-1000x667.jpg"
    b = "https://cdn.remax-abc.com/img/cache/11-1775162488-607x405.jpg"
    assert image_identity_key(a) == image_identity_key(b)
