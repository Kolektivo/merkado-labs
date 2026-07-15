"""Extract a bounded, auditable CaribbeanHouseHunt listing sample."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "data" / "raw"
NORMALIZED_DIR = BASE_DIR / "data" / "normalized"
REQUEST_LOG_PATH = BASE_DIR / "request-log.json"
RAW_SAMPLE_PATH = RAW_DIR / "listings-sample.json"
NORMALIZED_PATH = NORMALIZED_DIR / "listings.json"
QUALITY_PATH = BASE_DIR / "data-quality.json"

SOURCE = "CaribbeanHouseHunt.com"
SOURCE_MAP_URL = "https://caribbeanhousehunt.com/curacao/map/"
CONFIG_URL = "https://caribbeanhousehunt.com/map-assets/js/config.js?rnd=MVl27O"
DATA_MANAGER_URL = "https://caribbeanhousehunt.com/map-assets/js/data-manager.js?rnd=MVl27O"
USER_AGENT = "MerkadoLabs-SampleExtraction/0.1"
ALLOWED_HOSTS = {"caribbeanhousehunt.com", "www.caribbeanhousehunt.com"}
MAX_REQUESTS = 20
MAX_LISTINGS = 12
MAX_RESPONSE_BYTES = 20_000_000
TIMEOUT_SECONDS = 20
MIN_REQUEST_DELAY_SECONDS = 3.0


class NoRedirects(HTTPRedirectHandler):
    """Do not follow redirects implicitly."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def write_json(path: Path, value: Any) -> None:
    """Write stable UTF-8 JSON."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def load_json(path: Path, default: Any) -> Any:
    """Load JSON when present."""

    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def validate_public_url(url: str) -> None:
    """Restrict requests to approved CHH HTTPS hosts."""

    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"Only HTTPS URLs are allowed: {url}")
    if parsed.hostname not in ALLOWED_HOSTS or parsed.port not in (None, 443):
        raise ValueError(f"Host is not allowed: {url}")
    if parsed.username or parsed.password:
        raise ValueError(f"Credentials in URLs are forbidden: {url}")


@dataclass
class RequestBudget:
    """Cumulative request budget with durable logging and pacing."""

    entries: list[dict[str, Any]]
    last_request_monotonic: float | None = None

    @classmethod
    def load(cls) -> RequestBudget:
        entries = load_json(REQUEST_LOG_PATH, [])
        if not isinstance(entries, list):
            raise ValueError("request-log.json must contain a JSON array")
        return cls(entries=entries)

    def _persist(self) -> None:
        write_json(REQUEST_LOG_PATH, self.entries)

    def fetch_text(self, url: str, output_path: Path, purpose: str) -> str | None:
        """Fetch one textual resource, logging failures without retrying."""

        validate_public_url(url)
        if output_path.exists():
            return output_path.read_text(encoding="utf-8")
        if len(self.entries) >= MAX_REQUESTS:
            raise RuntimeError(f"Request limit of {MAX_REQUESTS} has been reached")

        if self.last_request_monotonic is not None:
            elapsed = time.monotonic() - self.last_request_monotonic
            if elapsed < MIN_REQUEST_DELAY_SECONDS:
                time.sleep(MIN_REQUEST_DELAY_SECONDS - elapsed)

        entry: dict[str, Any] = {
            "request_number": len(self.entries) + 1,
            "url": url,
            "method": "GET",
            "purpose": purpose,
            "timestamp": datetime.now(UTC).isoformat(),
            "status": None,
            "content_type": None,
            "byte_count": 0,
            "elapsed_ms": None,
            "saved_to": None,
            "error": None,
        }
        self.entries.append(entry)
        self._persist()

        request = Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
        opener = build_opener(NoRedirects())
        started = time.monotonic()
        self.last_request_monotonic = started

        try:
            try:
                response = opener.open(request, timeout=TIMEOUT_SECONDS)
            except HTTPError as error:
                response = error

            with response:
                entry["status"] = response.status
                entry["content_type"] = response.headers.get_content_type().lower()
                if response.status != 200:
                    entry["error"] = f"HTTP {response.status}; redirects are not followed"
                    return None

                body = response.read(MAX_RESPONSE_BYTES + 1)
                entry["byte_count"] = len(body)
                if len(body) > MAX_RESPONSE_BYTES:
                    entry["error"] = (
                        f"Response exceeded {MAX_RESPONSE_BYTES} bytes and was not saved"
                    )
                    return None

                text = body.decode("utf-8")
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_text(text, encoding="utf-8")
                entry["saved_to"] = str(output_path.relative_to(BASE_DIR)).replace("\\", "/")
                return text
        except (TimeoutError, UnicodeDecodeError, URLError, OSError) as error:
            entry["error"] = f"{type(error).__name__}: {error}"
            return None
        finally:
            entry["elapsed_ms"] = round((time.monotonic() - started) * 1000)
            self._persist()


def discover_listing_urls(config_js: str, data_manager_js: str) -> list[str]:
    """Resolve public listing-data URLs explicitly constructed by DataManager."""

    candidates: set[str] = set()
    cache_match = re.search(r"""cachebust\s*:\s*['"]([^'"]+)['"]""", config_js)
    cache_buster = cache_match.group(1) if cache_match else None

    if cache_buster and re.search(
        r"/map-assets/data/\$\{AppConfig\.cachebust\}-\$\{lang\}\.json",
        data_manager_js,
    ):
        candidates.add(
            urljoin(SOURCE_MAP_URL, f"/map-assets/data/{cache_buster}-en.json")
        )

    combined = f"{config_js}\n{data_manager_js}"
    quoted_paths = re.findall(r"""['"]([^'"]+\.(?:json|php)(?:\?[^'"]*)?)['"]""", combined)
    fetch_args = re.findall(r"""fetch\s*\(\s*['"]([^'"]+)['"]""", combined)
    for candidate in [*quoted_paths, *fetch_args]:
        absolute = urljoin(SOURCE_MAP_URL, candidate)
        try:
            validate_public_url(absolute)
        except ValueError:
            continue
        candidates.add(absolute)
    return sorted(candidates)


def source_sort_key(item: dict[str, Any]) -> tuple[int, str]:
    """Sort newest source records deterministically by stable URL ID, then internal ID."""

    url_id = parse_number(item.get("urlid"))
    numeric_url_id = int(url_id) if url_id is not None else -1
    return numeric_url_id, str(item.get("id") or "")


def select_sample(items: list[dict[str, Any]], limit: int = MAX_LISTINGS) -> list[dict[str, Any]]:
    """Select a deterministic bounded sample without mutating raw records."""

    if limit < 0 or limit > MAX_LISTINGS:
        raise ValueError(f"Listing limit must be between 0 and {MAX_LISTINGS}")
    valid_items = [item for item in items if isinstance(item, dict)]
    return sorted(valid_items, key=source_sort_key, reverse=True)[:limit]


def clean_source_value(value: Any) -> Any:
    """Convert source null sentinels and blank strings to null."""

    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped or stripped.upper() in {"NULL", "N/A", "NONE"}:
            return None
        return stripped
    return value


def parse_number(value: Any) -> int | float | None:
    """Parse a source number while rejecting booleans and non-finite values."""

    value = clean_source_value(value)
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        number = float(value)
    elif isinstance(value, str):
        match = re.search(r"-?\d[\d.,]*", value.replace(" ", ""))
        if not match:
            return None
        token = match.group(0)
        if token.count(",") > 1 and "." not in token:
            token = token.replace(",", "")
        elif token.count(".") > 1 and "," not in token:
            token = token.replace(".", "")
        elif "," in token and "." not in token:
            decimal_tail = token.rsplit(",", maxsplit=1)[1]
            token = token.replace(",", ".") if len(decimal_tail) <= 2 else token.replace(",", "")
        elif "." in token and "," in token:
            decimal_separator = "," if token.rfind(",") > token.rfind(".") else "."
            thousands_separator = "." if decimal_separator == "," else ","
            decimal_tail = token.rsplit(decimal_separator, maxsplit=1)[1]
            token = token.replace(thousands_separator, "")
            if len(decimal_tail) <= 2:
                token = token.replace(decimal_separator, ".")
            else:
                token = token.replace(decimal_separator, "")
        else:
            token = token.replace(",", "")
        try:
            number = float(token)
        except ValueError:
            return None
    else:
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return int(number) if number.is_integer() else number


def parse_price(value: Any) -> int | float | None:
    """Parse a non-negative monetary amount."""

    number = parse_number(value)
    return number if number is not None and number >= 0 else None


def parse_area(value: Any) -> int | float | None:
    """Parse a positive square-metre area."""

    number = parse_number(value)
    return number if number is not None and number > 0 else None


def first_value(raw: dict[str, Any], *keys: str) -> Any:
    """Return the first non-null source value for known aliases."""

    for key in keys:
        value = clean_source_value(raw.get(key))
        if value is not None:
            return value
    return None


def normalize_listing(raw: dict[str, Any], observed_at: str) -> dict[str, Any]:
    """Normalize one raw CHH property without inventing absent values."""

    notes = [
        "source_listing_id uses CHH urlid provisionally; stability is not independently verified"
    ]
    source_listing_id = clean_source_value(raw.get("urlid"))
    if source_listing_id is None:
        notes.append("CHH urlid is missing; internal id remains available only in raw evidence")

    price = None
    currency = None
    for key, code in (("price_usd", "USD"), ("price_naf", "XCG"), ("price_eur", "EUR")):
        candidate = parse_price(raw.get(key))
        if candidate is not None:
            price = candidate
            currency = code
            break

    status = str(clean_source_value(raw.get("status")) or "").lower()
    if status == "for rent":
        listing_type = "rent"
    elif status in {"for sale", "under contract"}:
        listing_type = "sale"
        if status == "under contract":
            notes.append("source status is under contract")
    else:
        listing_type = clean_source_value(raw.get("status"))

    image_name = clean_source_value(raw.get("image_url"))
    image_url = None
    if image_name is not None:
        image_url = urljoin(
            SOURCE_MAP_URL,
            f"/map-assets/property-images/{str(image_name).lstrip('/')}",
        )

    description = clean_source_value(raw.get("description"))
    if isinstance(description, str) and len(description) > 180:
        description = description[:177].rstrip() + "..."
        notes.append("description_snippet truncated to 180 characters")

    street = clean_source_value(raw.get("street"))
    house_number = clean_source_value(raw.get("house_number"))
    address = " ".join(str(part) for part in (street, house_number) if part is not None) or None
    raw_lot_area = clean_source_value(raw.get("lot_area"))
    if raw_lot_area is not None:
        notes.append("raw lot_area retained in evidence; source unit is not confirmed as m²")

    normalized = {
        "source": SOURCE,
        "source_listing_id": str(source_listing_id) if source_listing_id is not None else None,
        "source_url": SOURCE_MAP_URL,
        "original_realtor_url": clean_source_value(raw.get("url_page")),
        "listing_type": listing_type,
        "property_type": clean_source_value(raw.get("property_type")),
        "title": clean_source_value(raw.get("property_title")),
        "price": price,
        "currency": currency,
        "bedrooms": parse_number(raw.get("bedrooms")),
        "bathrooms": parse_number(
            first_value(raw, "bathrooms", "bathroom", "number_of_bathrooms")
        ),
        "floor_area_m2": parse_area(
            first_value(
                raw,
                "floor_area_m2",
                "floor_area",
                "living_area",
                "interior_size",
                "surface_area",
            )
        ),
        "lot_area_m2": parse_area(
            first_value(raw, "lot_area_m2")
        ),
        "address": address,
        "neighbourhood": clean_source_value(raw.get("neighborhood")),
        "latitude": parse_number(raw.get("lat")),
        "longitude": parse_number(raw.get("lng")),
        "description_snippet": description,
        "primary_image_url": image_url,
        "realtor_name": clean_source_value(raw.get("realtor_name")),
        "observed_at": observed_at,
        "raw_evidence_file": "data/raw/listings-sample.json",
        "missing_fields": [],
        "normalization_notes": notes,
    }
    normalized["missing_fields"] = [
        key
        for key, value in normalized.items()
        if key not in {"missing_fields", "normalization_notes"} and value is None
    ]
    return normalized


COVERAGE_FIELDS = {
    "price": "price",
    "bedrooms": "bedrooms",
    "bathrooms": "bathrooms",
    "floor_area": "floor_area_m2",
    "neighbourhood": "neighbourhood",
    "coordinates": ("latitude", "longitude"),
    "image": "primary_image_url",
    "stable_id": "source_listing_id",
}


def suspicious_values(listing: dict[str, Any]) -> list[str]:
    """Return conservative data-quality warnings for one listing."""

    warnings: list[str] = []
    bedrooms = listing.get("bedrooms")
    if isinstance(bedrooms, int | float) and (bedrooms < 0 or bedrooms > 20):
        warnings.append("bedrooms outside expected range")
    price = listing.get("price")
    if isinstance(price, int | float) and price == 0:
        warnings.append("price is zero")
    latitude = listing.get("latitude")
    longitude = listing.get("longitude")
    if latitude is not None and not 12.0 <= latitude <= 12.5:
        warnings.append("latitude outside Curaçao bounds")
    if longitude is not None and not -69.3 <= longitude <= -68.6:
        warnings.append("longitude outside Curaçao bounds")
    return warnings


def build_quality(listings: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate requested field coverage percentages."""

    total = len(listings)
    coverage: dict[str, dict[str, int | float]] = {}
    for label, field in COVERAGE_FIELDS.items():
        if isinstance(field, tuple):
            count = sum(all(item.get(part) is not None for part in field) for item in listings)
        else:
            count = sum(item.get(field) is not None for item in listings)
        coverage[label] = {
            "present": count,
            "total": total,
            "percentage": round((count / total * 100) if total else 0.0, 1),
        }
    flagged = [
        {
            "source_listing_id": item.get("source_listing_id"),
            "warnings": suspicious_values(item),
        }
        for item in listings
        if suspicious_values(item)
    ]
    return {"sample_size": total, "coverage": coverage, "suspicious_records": flagged}


def main() -> None:
    """Capture the confirmed payload and write raw, normalized, and quality artifacts."""

    budget = RequestBudget.load()
    config_js = budget.fetch_text(CONFIG_URL, RAW_DIR / "config.js.txt", "transport discovery")
    data_manager_js = budget.fetch_text(
        DATA_MANAGER_URL,
        RAW_DIR / "data-manager.js.txt",
        "transport discovery",
    )
    if config_js is None or data_manager_js is None:
        print("Transport scripts could not be captured; see request-log.json.")
        return

    candidates = discover_listing_urls(config_js, data_manager_js)
    if not candidates:
        print("No public static listing-data URL was confirmed in the captured scripts.")
        return

    listing_url = candidates[0]
    existing_raw = load_json(RAW_SAMPLE_PATH, None)
    if isinstance(existing_raw, dict) and isinstance(existing_raw.get("listings"), list):
        sample = existing_raw["listings"]
        observed_at = str(existing_raw["observed_at"])
    else:
        payload_text = budget.fetch_text(listing_url, RAW_SAMPLE_PATH, "listing data")
        if payload_text is None:
            print("The confirmed listing payload could not be captured; see request-log.json.")
            return
        try:
            payload = json.loads(payload_text)
        except json.JSONDecodeError as error:
            print(f"The listing payload was not valid JSON: {error}")
            return
        if not isinstance(payload, list):
            print("The confirmed listing payload was not a JSON array.")
            return
        sample = select_sample(payload)
        observed_at = str(budget.entries[-1]["timestamp"])
        raw_evidence = {
            "source": SOURCE,
            "source_url": listing_url,
            "observed_at": observed_at,
            "source_total_count": len(payload),
            "selection": "12 highest numeric urlid values, then internal id descending",
            "listings": sample,
        }
        write_json(RAW_SAMPLE_PATH, raw_evidence)
        budget.entries[-1]["saved_to"] = "data/raw/listings-sample.json"
        budget._persist()

    normalized = [normalize_listing(item, observed_at) for item in sample]
    write_json(NORMALIZED_PATH, normalized)
    write_json(QUALITY_PATH, build_quality(normalized))
    print(
        f"Extracted {len(normalized)} listings from {listing_url} "
        f"using {len(budget.entries)} requests."
    )


if __name__ == "__main__":
    main()
