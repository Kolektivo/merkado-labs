"""Tests for RE/MAX source description and evidence extraction."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from merkado_labs.scrapers.adapters.remax_curacao import (
    RemaxCuracaoAdapter,
    extract_source_description,
)
from merkado_labs.scrapers.evidence import (
    decode_html_entities,
    html_to_preserved_text,
    sha256_text,
    strip_chrome_hints,
)

FIXTURE = Path(__file__).parent / "fixtures" / "remax_sample.html"


def test_html_entities_decoded() -> None:
    assert decode_html_entities("cura&ccedil;ao") == "curaçao"
    decoded = decode_html_entities("you&rsquo;ll")
    assert decoded.startswith("you")
    assert decoded.endswith("ll")
    assert "'" in decoded or "\u2019" in decoded
    assert "&rsquo;" not in decoded


def test_preserves_paragraphs_and_lists() -> None:
    html = "<p>First</p><p>Second<br />line</p><ul><li>A</li><li>B</li></ul>"
    text = html_to_preserved_text(html)
    assert "First" in text
    assert "Second" in text
    assert "line" in text
    assert "A" in text
    assert "\n" in text


def test_fixture_description_is_full_body_not_meta() -> None:
    html = FIXTURE.read_text(encoding="utf-8")
    text, source_html, sections = extract_source_description(html)
    assert sections["teaser_present"] is True
    assert sections["body_present"] is True
    assert sections["meta_fallback"] is False
    assert text is not None
    assert source_html is not None
    assert len(text) > 500
    assert "en-suite" in text
    assert "swimming pool" in text.casefold()
    # Meta SEO blurb alone is much shorter.
    assert "Large villa in Cas Grandi with apartment" not in text or len(text) > 200
    checksum = sha256_text(text)
    assert len(checksum) == 64


def test_chrome_and_currency_disclaimer_excluded() -> None:
    text = strip_chrome_hints(
        "Nice home.\n\n"
        "In an international environment like Curacao, objects are listed "
        "in various currencies."
    )
    assert "Nice home." in text
    assert "various currencies" not in text


def test_related_listing_noise_not_in_description() -> None:
    html = FIXTURE.read_text(encoding="utf-8")
    adapter = RemaxCuracaoAdapter()
    snap = adapter.parse_listing_html(
        html,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-sale/"
            "hs3080/spacious-fixer-upper-villa-in-cas-grandi.html"
        ),
        raw_sha256="b" * 64,
        observed_at=datetime(2026, 7, 16, tzinfo=UTC),
        http_status=200,
    )
    assert snap.adapter_version.startswith("0.4")
    assert snap.source_description is not None
    assert snap.source_description_checksum is not None
    assert snap.evidence_storage_path is not None
    assert "listing-raw-evidence" == snap.evidence_storage_bucket
    assert "Rick Seisveld" not in (snap.source_description or "")
    assert "no representation or warranty" not in (snap.source_description or "").casefold()
    assert snap.cleaned_listing_text is not None
    assert snap.structured_evidence.get("description_sections", {}).get("body_present")


def test_parse_fixture_listing_is_public_priced() -> None:
    html = FIXTURE.read_text(encoding="utf-8")
    adapter = RemaxCuracaoAdapter()
    snapshot = adapter.parse_listing_html(
        html,
        listing_url=(
            "https://www.realestate-curacao.com/en/homes/homes-for-sale/"
            "hs3080/spacious-fixer-upper-villa-in-cas-grandi.html"
        ),
        raw_sha256="b" * 64,
        observed_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    assert snapshot.external_id == "hs3080"
    assert snapshot.has_positive_price
    assert snapshot.description and len(snapshot.description) > 500
