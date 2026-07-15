"""Local Streamlit inspector for the bounded CaribbeanHouseHunt sample."""

from __future__ import annotations

import html
import json
from collections import Counter
from pathlib import Path
from typing import Any

import streamlit as st

from merkado_labs.config import Settings

BASE_DIR = Path(__file__).resolve().parent
LISTINGS_PATH = BASE_DIR / "data" / "normalized" / "listings.json"
RAW_PATH = BASE_DIR / "data" / "raw" / "listings-sample.json"
QUALITY_PATH = BASE_DIR / "data-quality.json"
SNAPSHOT_HEALTH_PATH = BASE_DIR / "snapshot-health.json"
LABS_PROJECT_REF = "csaefdkpwukshtouyixg"
KEY_QUALITY_FIELDS = (
    "price",
    "floor_area_m2",
    "neighbourhood",
    "latitude",
    "longitude",
    "source_listing_id",
)


@st.cache_data
def load_local_artifacts() -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    """Load local evidence used for fallback and detailed inspection."""

    listings = json.loads(LISTINGS_PATH.read_text(encoding="utf-8"))
    raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
    quality = json.loads(QUALITY_PATH.read_text(encoding="utf-8"))
    for listing in listings:
        listing["external_id_status"] = "provisional"
        listing["property_asset_id"] = None
        listing["observation_count"] = 1
        listing["price_observation_count"] = int(listing.get("price") is not None)
    return listings, raw, quality


@st.cache_data(ttl=60)
def load_supabase_listings() -> list[dict[str, Any]]:
    """Read normalized listing rows through the Labs anonymous policy."""

    settings = Settings()
    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError("Supabase project ref is not the Labs ref.")
    if settings.supabase_url is None or settings.supabase_publishable_key is None:
        raise RuntimeError("Supabase inspector settings are incomplete.")
    url = str(settings.supabase_url).rstrip("/")
    if url != f"https://{LABS_PROJECT_REF}.supabase.co":
        raise RuntimeError("Supabase URL is not the Labs project.")

    from supabase import create_client

    client = create_client(url, settings.supabase_publishable_key.get_secret_value())
    rows = (
        client.table("property_listings")
        .select(
            "id,property_asset_id,external_id,external_id_status,source_url,"
            "original_realtor_url,listing_type,property_type,title,current_price,currency,"
            "bedrooms,floor_area_m2,latitude,longitude,primary_image_url,status,"
            "first_seen_at,last_seen_at,observation_count,price_observation_count,"
            "source:property_sources(name),neighbourhood:neighbourhoods(name)"
        )
        .order("external_id", desc=True)
        .limit(12)
        .execute()
        .data
    )
    listings: list[dict[str, Any]] = []
    for row in rows:
        source = row.pop("source", None) or {}
        neighbourhood = row.pop("neighbourhood", None) or {}
        row["source"] = source.get("name")
        row["neighbourhood"] = neighbourhood.get("name")
        row["source_listing_id"] = row["external_id"]
        row["price"] = row.pop("current_price")
        row["observed_at"] = row.get("last_seen_at")
        listings.append(row)
    return listings


@st.cache_data(ttl=60)
def load_supabase_market_signals() -> list[dict[str, Any]]:
    """Read normalized market signals and evidence through anonymous policies."""

    settings = Settings()
    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError("Supabase project ref is not the Labs ref.")
    if settings.supabase_url is None or settings.supabase_publishable_key is None:
        raise RuntimeError("Supabase inspector settings are incomplete.")
    url = str(settings.supabase_url).rstrip("/")
    if url != f"https://{LABS_PROJECT_REF}.supabase.co":
        raise RuntimeError("Supabase URL is not the Labs project.")

    from supabase import create_client

    client = create_client(url, settings.supabase_publishable_key.get_secret_value())
    return (
        client.table("market_signals")
        .select(
            "id,signal_type,period_start,period_end,currency,unit,sample_size,"
            "average_value,median_value,minimum_value,maximum_value,calculated_at,"
            "calculation_version,quality_status,neighbourhood:neighbourhoods(name),"
            "evidence:signal_evidence(observed_price,floor_area_m2,calculated_value,"
            "listing:property_listings(external_id,title,source_url,original_realtor_url))"
        )
        .eq("signal_type", "monthly_rent_per_m2")
        .order("period_start", desc=True)
        .order("sample_size", desc=True)
        .execute()
        .data
        or []
    )


def create_labs_service_client() -> tuple[Any, Settings]:
    """Create a server-only Labs client without exposing its credential."""

    settings = Settings()
    if settings.supabase_project_ref != LABS_PROJECT_REF:
        raise RuntimeError("Supabase project ref is not the Labs ref.")
    if settings.supabase_url is None or settings.supabase_secret_key is None:
        raise RuntimeError("Labs server-side settings are incomplete.")
    url = str(settings.supabase_url).rstrip("/")
    if url != f"https://{LABS_PROJECT_REF}.supabase.co":
        raise RuntimeError("Supabase URL is not the Labs project.")

    from supabase import create_client

    return create_client(url, settings.supabase_secret_key.get_secret_value()), settings


@st.cache_data(ttl=30)
def load_neighbourhood_review() -> list[dict[str, Any]]:
    """Load alias candidates and aggregate source/canonical listing evidence."""

    client, _ = create_labs_service_client()
    aliases = (
        client.table("neighbourhood_aliases")
        .select(
            "id,status,match_method,confidence,notes,"
            "source:neighbourhoods!source_neighbourhood_id(id,name),"
            "canonical:neighbourhoods!canonical_neighbourhood_id(id,name)"
        )
        .order("status")
        .order("confidence", desc=True)
        .execute()
        .data
        or []
    )
    listings = (
        client.table("property_listings")
        .select("neighbourhood_id,latitude,longitude")
        .range(0, 1999)
        .execute()
        .data
        or []
    )
    by_neighbourhood: dict[str, list[dict[str, Any]]] = {}
    for listing in listings:
        identifier = listing.get("neighbourhood_id")
        if identifier:
            by_neighbourhood.setdefault(str(identifier), []).append(listing)

    for alias in aliases:
        for role in ("source", "canonical"):
            neighbourhood = alias.get(role) or {}
            rows = by_neighbourhood.get(str(neighbourhood.get("id")), [])
            coordinates = [
                (float(row["latitude"]), float(row["longitude"]))
                for row in rows
                if row.get("latitude") is not None and row.get("longitude") is not None
            ]
            latitudes = [point[0] for point in coordinates]
            longitudes = [point[1] for point in coordinates]
            alias[f"{role}_listing_count"] = len(rows)
            alias[f"{role}_coordinate_range"] = (
                f"{min(latitudes):.5f}–{max(latitudes):.5f}, "
                f"{min(longitudes):.5f}–{max(longitudes):.5f}"
                if coordinates
                else "Unavailable"
            )
    return aliases


@st.cache_data(ttl=30)
def load_pilot_contract_assessments() -> list[dict[str, Any]]:
    """Load private pilot assessment results with server-side credentials."""

    client, _ = create_labs_service_client()
    return (
        client.table("contract_market_assessments")
        .select(
            "id,contract_rent_per_m2,benchmark_value,benchmark_method,difference_percent,"
            "classification,evidence_quality,calculation_version,assessed_at,"
            "contract:rental_contracts(neighbourhood:neighbourhoods(name)),"
            "signal:market_signals(median_value,average_value,sample_size,quality_status,"
            "period_start,period_end,calculation_version,"
            "evidence:signal_evidence(observed_price,floor_area_m2,calculated_value,"
            "listing:property_listings(external_id,title,source_url,original_realtor_url)))"
        )
        .eq("calculation_version", "contract-v1")
        .order("assessed_at", desc=True)
        .execute()
        .data
        or []
    )


def update_neighbourhood_alias_status(alias_id: str, status: str) -> None:
    """Apply one explicit human review decision using server-side credentials."""

    if status not in {"approved", "rejected"}:
        raise ValueError("Review status must be approved or rejected.")
    client, settings = create_labs_service_client()
    # Re-check the ref immediately before this database write.
    if (
        settings.supabase_project_ref != LABS_PROJECT_REF
        or settings.supabase_url is None
        or str(settings.supabase_url).rstrip("/")
        != f"https://{LABS_PROJECT_REF}.supabase.co"
    ):
        raise RuntimeError("Refusing neighbourhood review write outside Labs.")
    client.table("neighbourhood_aliases").update({"status": status}).eq(
        "id", alias_id
    ).execute()


@st.cache_data
def load_snapshot_health() -> dict[str, Any] | None:
    """Load the latest local snapshot comparison when available."""

    if not SNAPSHOT_HEALTH_PATH.exists():
        return None
    value = json.loads(SNAPSHOT_HEALTH_PATH.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else None


def distinct_values(listings: list[dict[str, Any]], field: str) -> list[str]:
    """Return sorted non-empty filter values."""

    return sorted({str(item[field]) for item in listings if item.get(field) is not None})


def apply_presence_filter(
    listings: list[dict[str, Any]], field: str | tuple[str, ...], choice: str
) -> list[dict[str, Any]]:
    """Apply an Any/Yes/No field-presence filter."""

    if choice == "Any":
        return listings
    fields = (field,) if isinstance(field, str) else field
    expected = choice == "Yes"
    return [
        item
        for item in listings
        if all(item.get(part) is not None for part in fields) is expected
    ]


def quality_label(listing: dict[str, Any]) -> tuple[str, str]:
    """Return a compact card quality label and CSS class."""

    missing = sum(listing.get(field) is None for field in KEY_QUALITY_FIELDS)
    if missing == 0:
        return "Complete", "quality-good"
    if missing <= 2:
        return f"{missing} key gaps", "quality-warn"
    return f"{missing} key gaps", "quality-poor"


def display_value(value: Any, suffix: str = "") -> str:
    """Format an optional card value."""

    if value is None:
        return "—"
    return f"{value:g}{suffix}" if isinstance(value, float) else f"{value}{suffix}"


def price_display(listing: dict[str, Any]) -> str:
    """Format preserved price and currency."""

    price = listing.get("price")
    if price is None:
        return "Price unavailable"
    amount = f"{price:,.0f}" if isinstance(price, int | float) else str(price)
    return f"{listing.get('currency') or ''} {amount}".strip()


def render_card(listing: dict[str, Any]) -> None:
    """Render one escaped marketplace-style listing card."""

    quality, quality_class = quality_label(listing)
    title = html.escape(str(listing.get("title") or listing.get("neighbourhood") or "Untitled"))
    listing_type = html.escape(str(listing.get("listing_type") or "unknown"))
    property_type = html.escape(str(listing.get("property_type") or "property"))
    location = html.escape(str(listing.get("neighbourhood") or "Neighbourhood unavailable"))
    realtor = html.escape(str(listing.get("realtor_name") or listing.get("source") or "Unknown"))
    coordinates = (
        f"{listing['latitude']:.5f}, {listing['longitude']:.5f}"
        if listing.get("latitude") is not None and listing.get("longitude") is not None
        else "Coordinates unavailable"
    )
    external_id = html.escape(str(listing.get("source_listing_id") or "missing"))
    image_url = listing.get("primary_image_url")
    if image_url:
        image = (
            f'<img src="{html.escape(str(image_url), quote=True)}" alt="{title}" '
            'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">'
            '<div class="image-fallback" style="display:none">Image unavailable</div>'
        )
    else:
        image = '<div class="image-fallback">Image unavailable</div>'

    st.markdown(
        f"""
        <article class="listing-card">
          <div class="image-wrap">{image}</div>
          <div class="card-content">
            <div class="badge-row">
              <span class="type-badge">{listing_type}</span>
              <span class="quality-badge {quality_class}">{html.escape(quality)}</span>
            </div>
            <div class="property-type">{property_type}</div>
            <h3>{title}</h3>
            <div class="location">{location}</div>
            <div class="price">{html.escape(price_display(listing))}</div>
            <div class="features">
              <span>{html.escape(display_value(listing.get("bedrooms")))} beds</span>
              <span>{html.escape(display_value(listing.get("floor_area_m2"), " m²"))}</span>
            </div>
            <div class="coordinates">{html.escape(coordinates)}</div>
            <div class="identifier">External ID {external_id} · provisional</div>
            <div class="attribution">Listed by {realtor} · via CaribbeanHouseHunt</div>
          </div>
        </article>
        """,
        unsafe_allow_html=True,
    )


def render_market_signals(signals: list[dict[str, Any]]) -> None:
    """Render the latest monthly signal and its exact listing evidence."""

    st.subheader("Market signals")
    if not signals:
        st.info("No monthly XCG rent per m² signals have been calculated yet.")
        return

    latest_period = max(str(signal["period_start"]) for signal in signals)
    period_signals = [
        signal for signal in signals if str(signal["period_start"]) == latest_period
    ]
    latest_version = max(str(signal["calculation_version"]) for signal in period_signals)
    latest = [
        signal
        for signal in period_signals
        if str(signal["calculation_version"]) == latest_version
    ]
    period_end = latest[0].get("period_end")
    st.caption(
        f"Monthly XCG rent per m² · {latest_period} to {period_end} · {latest_version} · "
        "latest price observation per listing"
    )
    for signal in latest:
        neighbourhood = (signal.get("neighbourhood") or {}).get("name") or "Unknown"
        columns = st.columns((2, 1, 1, 1, 1, 1))
        columns[0].markdown(f"**{neighbourhood}**")
        columns[1].metric("Average", f"XCG {float(signal['average_value']):,.2f}")
        columns[2].metric("Median", f"XCG {float(signal['median_value']):,.2f}")
        columns[3].metric("Sample", signal["sample_size"])
        columns[4].metric("Quality", signal["quality_status"])
        columns[5].metric(
            "Range",
            f"{float(signal['minimum_value']):,.2f}–"
            f"{float(signal['maximum_value']):,.2f}",
        )
        evidence = signal.get("evidence") or []
        with st.expander(f"Evidence listings · {len(evidence)}"):
            for item in sorted(
                evidence,
                key=lambda row: float(row.get("calculated_value") or 0),
                reverse=True,
            ):
                listing = item.get("listing") or {}
                label = listing.get("title") or f"Listing {listing.get('external_id') or 'unknown'}"
                st.write(
                    f"**{label}** · XCG {float(item['observed_price']):,.0f} / "
                    f"{float(item['floor_area_m2']):g} m² = "
                    f"XCG {float(item['calculated_value']):,.2f}/m²"
                )
                source_url = listing.get("original_realtor_url") or listing.get("source_url")
                if source_url:
                    st.link_button(
                        f"Open source listing {listing.get('external_id') or ''}".strip(),
                        source_url,
                    )
        st.divider()


def render_neighbourhood_review(aliases: list[dict[str, Any]]) -> None:
    """Render server-side alias approval and rejection controls."""

    st.subheader("Neighbourhood review")
    if not aliases:
        st.info("No neighbourhood alias candidates have been generated.")
        return

    status_counts = Counter(str(alias["status"]) for alias in aliases)
    st.caption(
        f"{len(aliases)} candidates · {status_counts['approved']} approved · "
        f"{status_counts['pending']} pending · {status_counts['rejected']} rejected"
    )
    for alias in aliases:
        source = alias.get("source") or {}
        canonical = alias.get("canonical") or {}
        with st.expander(
            f"{source.get('name', 'Unknown')} → {canonical.get('name', 'Unknown')} "
            f"· {alias['status']}"
        ):
            left, right = st.columns(2)
            left.write(f"Source listings: {alias.get('source_listing_count', 0)}")
            left.write(f"Source coordinates: {alias.get('source_coordinate_range')}")
            right.write(f"Canonical listings: {alias.get('canonical_listing_count', 0)}")
            right.write(
                f"Canonical coordinates: {alias.get('canonical_coordinate_range')}"
            )
            st.write("Match reason:", alias.get("notes") or alias.get("match_method"))
            st.write("Confidence:", f"{float(alias['confidence']):.3f}")
            approve, reject = st.columns(2)
            if approve.button(
                "Approve",
                key=f"approve-alias-{alias['id']}",
                disabled=alias["status"] == "approved",
            ):
                update_neighbourhood_alias_status(str(alias["id"]), "approved")
                load_neighbourhood_review.clear()
                st.rerun()
            if reject.button(
                "Reject",
                key=f"reject-alias-{alias['id']}",
                disabled=alias["status"] == "rejected",
            ):
                update_neighbourhood_alias_status(str(alias["id"]), "rejected")
                load_neighbourhood_review.clear()
                st.rerun()


def render_pilot_contract_assessment(assessments: list[dict[str, Any]]) -> None:
    """Render a compact non-personal pilot comparison."""

    st.subheader("Pilot contract assessment")
    if not assessments:
        st.info("No pilot contract assessment has been stored.")
        return

    assessment = assessments[0]
    signal = assessment.get("signal") or {}
    contract = assessment.get("contract") or {}
    neighbourhood = (contract.get("neighbourhood") or {}).get("name") or "Unknown"
    st.caption(
        f"{neighbourhood} · signal {signal.get('period_start')} to "
        f"{signal.get('period_end')} · {assessment.get('calculation_version')}"
    )
    columns = st.columns(5)
    columns[0].metric(
        "Contract rent/m²",
        f"XCG {float(assessment['contract_rent_per_m2']):,.2f}",
    )
    columns[1].metric(
        "Neighbourhood median",
        f"XCG {float(assessment['benchmark_value']):,.2f}",
    )
    columns[2].metric(
        "Difference",
        f"{float(assessment['difference_percent']):+,.2f}%",
    )
    columns[3].metric("Classification", assessment["classification"])
    columns[4].metric(
        "Evidence",
        f"{signal.get('sample_size', 0)} · {signal.get('quality_status', 'unknown')}",
    )
    evidence = signal.get("evidence") or []
    with st.expander(f"Source-listing evidence · {len(evidence)}"):
        for item in sorted(
            evidence,
            key=lambda row: float(row.get("calculated_value") or 0),
            reverse=True,
        ):
            listing = item.get("listing") or {}
            label = listing.get("title") or f"Listing {listing.get('external_id') or 'unknown'}"
            st.write(
                f"**{label}** · XCG {float(item['observed_price']):,.0f} / "
                f"{float(item['floor_area_m2']):g} m² = "
                f"XCG {float(item['calculated_value']):,.2f}/m²"
            )
            source_url = listing.get("original_realtor_url") or listing.get("source_url")
            if source_url:
                st.link_button(
                    f"Open source listing {listing.get('external_id') or ''}".strip(),
                    source_url,
                )


def main() -> None:
    """Render the inspector."""

    st.set_page_config(page_title="CHH Sample Inspector", page_icon="🏠", layout="wide")
    st.markdown(
        """
        <style>
        .block-container {max-width: 1440px; padding-top: 2rem;}
        .listing-card {border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;
          background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.06);margin-bottom:1rem;}
        .image-wrap {aspect-ratio:16/10;background:#e2e8f0;overflow:hidden;}
        .image-wrap img {width:100%;height:100%;object-fit:cover;display:block;}
        .image-fallback {display:flex;width:100%;height:100%;align-items:center;
          justify-content:center;
          color:#64748b;background:linear-gradient(135deg,#f1f5f9,#e2e8f0);}
        .card-content {padding:1rem;}
        .badge-row {display:flex;justify-content:space-between;gap:.5rem;margin-bottom:.65rem;}
        .type-badge,.quality-badge {font-size:.72rem;font-weight:700;text-transform:uppercase;
          letter-spacing:.04em;padding:.25rem .55rem;border-radius:999px;}
        .type-badge {background:#e0f2fe;color:#075985;}
        .quality-good {background:#dcfce7;color:#166534;}
        .quality-warn {background:#fef3c7;color:#92400e;}
        .quality-poor {background:#fee2e2;color:#991b1b;}
        .property-type {font-size:.74rem;color:#64748b;text-transform:uppercase;font-weight:700;}
        .listing-card h3 {font-size:1.05rem;line-height:1.35;margin:.2rem 0;min-height:2.8rem;}
        .location {color:#64748b;font-size:.85rem;min-height:1.3rem;}
        .price {font-size:1.2rem;font-weight:750;margin:.7rem 0;}
        .features {display:flex;gap:.8rem;color:#334155;font-size:.84rem;flex-wrap:wrap;}
        .coordinates,.identifier {color:#64748b;font-size:.76rem;margin-top:.45rem;}
        .attribution {border-top:1px solid #f1f5f9;margin-top:.8rem;padding-top:.65rem;
          color:#64748b;font-size:.74rem;}
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.title("CaribbeanHouseHunt sample inspector")
    st.caption("Internal Labs view · 12-record maximum · raw and normalized evidence")

    try:
        local_listings, raw, quality = load_local_artifacts()
    except (FileNotFoundError, json.JSONDecodeError) as error:
        st.error(f"Generated sample artifacts are unavailable: {error}")
        st.code("python experiments/caribbeanhousehunt_sample/extract_sample.py")
        return
    try:
        listings = load_supabase_listings()
        if not listings:
            raise RuntimeError("Labs Supabase returned no sample listings.")
        data_source = "Labs Supabase"
    except Exception:
        listings = local_listings
        data_source = "local JSON fallback"
        st.warning(
            "Labs Supabase is unavailable or not configured. "
            "The inspector is showing the reviewed local JSON fallback."
        )

    st.subheader("Overview")
    metric_columns = st.columns(7)
    metric_columns[0].metric("Listings", len(listings))
    metric_columns[1].metric("Listing types", len(distinct_values(listings, "listing_type")))
    metric_columns[2].metric("Property types", len(distinct_values(listings, "property_type")))
    metric_columns[3].metric("Neighbourhoods", len(distinct_values(listings, "neighbourhood")))
    missing_total = sum(len(item.get("missing_fields", [])) for item in listings)
    metric_columns[4].metric("Missing values", missing_total)
    metric_columns[5].metric("Source records", raw.get("source_total_count", "—"))
    metric_columns[6].metric("Data source", data_source)
    observed_at = listings[0].get("observed_at") if listings else raw.get("observed_at")
    st.caption(f"Source: CaribbeanHouseHunt.com · Observed: {observed_at or 'unknown'}")

    with st.expander("Missing-field summary", expanded=False):
        missing_counts = Counter(
            field for item in listings for field in item.get("missing_fields", [])
        )
        st.json(dict(missing_counts), expanded=True)

    st.subheader("Snapshot health")
    try:
        snapshot_health = load_snapshot_health()
    except json.JSONDecodeError as error:
        st.warning(f"Snapshot health is malformed: {error}")
        snapshot_health = None
    if snapshot_health is None:
        st.info("No formal snapshot exists yet. Run create_snapshot.py to establish a baseline.")
    else:
        health_columns = st.columns(5)
        health_columns[0].metric(
            "Current snapshot", snapshot_health.get("current_snapshot_date") or "—"
        )
        health_columns[1].metric(
            "Records", snapshot_health.get("current_record_count") or "—"
        )
        health_columns[2].metric(
            "Previous snapshot", snapshot_health.get("previous_snapshot_date") or "—"
        )
        health_columns[3].metric(
            "Shared IDs",
            snapshot_health.get("shared_ids")
            if snapshot_health.get("shared_ids") is not None
            else "—",
        )
        health_columns[4].metric(
            "Identifier stability",
            snapshot_health.get("identifier_stability_status") or "—",
        )
        change_columns = st.columns(5)
        for column, label, key in (
            (change_columns[0], "New listings", "new_listings"),
            (change_columns[1], "Disappeared", "disappeared_listings"),
            (change_columns[2], "Changed prices", "changed_prices"),
            (change_columns[3], "Duplicate IDs", "duplicate_ids"),
            (change_columns[4], "Identity collisions", "identity_collisions"),
        ):
            value = snapshot_health.get(key)
            column.metric(label, value if value is not None else "—")
        for reason in snapshot_health.get("stability_reasons", []):
            st.caption(reason)

    try:
        market_signals = load_supabase_market_signals()
    except Exception:
        st.subheader("Market signals")
        st.info("Market signals are unavailable from Labs Supabase.")
    else:
        render_market_signals(market_signals)

    try:
        pilot_assessments = load_pilot_contract_assessments()
    except Exception:
        st.subheader("Pilot contract assessment")
        st.info("Pilot contract assessment is unavailable from Labs Supabase.")
    else:
        render_pilot_contract_assessment(pilot_assessments)

    try:
        neighbourhood_aliases = load_neighbourhood_review()
    except Exception:
        st.subheader("Neighbourhood review")
        st.info("Neighbourhood review is unavailable from Labs Supabase.")
    else:
        render_neighbourhood_review(neighbourhood_aliases)

    st.subheader("Filters")
    filter_columns = st.columns(6)
    listing_types = filter_columns[0].multiselect(
        "Listing type", distinct_values(listings, "listing_type")
    )
    property_types = filter_columns[1].multiselect(
        "Property type", distinct_values(listings, "property_type")
    )
    neighbourhoods = filter_columns[2].multiselect(
        "Neighbourhood", distinct_values(listings, "neighbourhood")
    )
    has_price = filter_columns[3].selectbox("Has price", ("Any", "Yes", "No"))
    has_coordinates = filter_columns[4].selectbox("Has coordinates", ("Any", "Yes", "No"))
    has_image = filter_columns[5].selectbox("Has image", ("Any", "Yes", "No"))

    filtered = [
        item
        for item in listings
        if (not listing_types or item.get("listing_type") in listing_types)
        and (not property_types or item.get("property_type") in property_types)
        and (not neighbourhoods or item.get("neighbourhood") in neighbourhoods)
    ]
    filtered = apply_presence_filter(filtered, "price", has_price)
    filtered = apply_presence_filter(filtered, ("latitude", "longitude"), has_coordinates)
    filtered = apply_presence_filter(filtered, "primary_image_url", has_image)

    st.subheader(f"Listing grid · {len(filtered)} shown")
    if not filtered:
        st.info("No listings match the selected filters.")
    else:
        for start in range(0, len(filtered), 3):
            for column, listing in zip(st.columns(3), filtered[start : start + 3], strict=False):
                with column:
                    render_card(listing)

    st.subheader("Listing inspector")
    if listings:
        labels = {
            f"{item.get('source_listing_id') or 'no-id'} · "
            f"{item.get('title') or item.get('neighbourhood') or 'Untitled'}": item
            for item in listings
        }
        selected_label = st.selectbox("Select a listing", list(labels))
        selected = labels[selected_label]
        raw_listing = next(
            (
                item
                for item in raw.get("listings", [])
                if str(item.get("urlid")) == str(selected.get("source_listing_id"))
            ),
            None,
        )
        left, right = st.columns(2)
        with left:
            st.markdown("#### Normalized fields")
            st.json(selected, expanded=True)
            st.write("Observation count:", selected.get("observation_count", "—"))
            st.write("Price-history count:", selected.get("price_observation_count", "—"))
            st.write(
                "Canonical asset:",
                selected.get("property_asset_id") or "Not linked",
            )
            st.markdown("#### Data-quality notes")
            st.write("Missing fields:", selected.get("missing_fields") or "None")
            st.write("Normalization notes:", selected.get("normalization_notes") or "None")
        with right:
            st.markdown("#### Raw source payload")
            if data_source == "Labs Supabase":
                st.info(
                    "Raw observations are intentionally not exposed through the inspector policy. "
                    "The reviewed local evidence is shown below."
                )
            st.json(raw_listing or {"error": "Matching raw record not found"}, expanded=True)
            st.markdown("#### Source information")
            st.write("CHH source:", selected.get("source_url"))
            st.write(
                "Provisional external ID (CHH `urlid`):",
                selected.get("source_listing_id"),
            )
            st.write("External ID status:", selected.get("external_id_status") or "provisional")
            st.write("Linked to canonical asset:", bool(selected.get("property_asset_id")))
            if raw_listing:
                st.write("CHH rebuild-local `id`:", raw_listing.get("id"))
            external_url = selected.get("original_realtor_url")
            if external_url:
                st.link_button("Open original realtor listing (external)", external_url)
            else:
                st.caption("Original realtor URL unavailable")

    st.subheader("Data quality")
    st.caption("Coverage reflects only this controlled 12-record sample.")
    coverage_columns = st.columns(4)
    for index, (field, values) in enumerate(quality.get("coverage", {}).items()):
        coverage_columns[index % 4].metric(
            field.replace("_", " ").title(),
            f"{values.get('percentage', 0):g}%",
            f"{values.get('present', 0)}/{values.get('total', 0)} present",
        )
    suspicious = quality.get("suspicious_records", [])
    if suspicious:
        st.warning("Suspicious values need review.")
        st.json(suspicious)
    else:
        st.success(
            "No range-based suspicious values were flagged; missing values remain visible above."
        )


if __name__ == "__main__":
    main()
