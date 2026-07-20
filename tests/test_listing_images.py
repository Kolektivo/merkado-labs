"""Shared listing image gallery contract tests (no live network)."""

from __future__ import annotations

from merkado_labs.scrapers.images import (
    DEFAULT_GALLERY_SAFETY_CAP,
    build_gallery,
    canonicalize_image_url,
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


def test_canonicalize_strips_utm() -> None:
    raw = "http://CDN.Example.com/path/img.jpg?utm_campaign=test&w=800"
    canon = canonicalize_image_url(raw)
    assert canon.startswith("https://cdn.example.com/")
    assert "utm_campaign" not in canon
    assert "w=800" in canon


def test_logo_hint() -> None:
    assert is_likely_contamination("https://site.com/wp-content/uploads/logo.png")
    assert not is_likely_contamination(
        "https://site.com/wp-content/uploads/2024/01/living-room.jpg"
    )


def test_default_cap_constant() -> None:
    assert DEFAULT_GALLERY_SAFETY_CAP == 50


def test_idempotent_build() -> None:
    urls = [
        "https://cdn.example.com/1.jpg",
        "https://cdn.example.com/2.jpg",
        "https://cdn.example.com/1.jpg",
    ]
    first = build_gallery(urls)
    second = build_gallery(first.urls, primary_url=first.primary_url)
    assert first.urls == second.urls
    assert first.primary_url == second.primary_url
