"""Create one immutable CaribbeanHouseHunt bulk-data snapshot."""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

try:
    from .extract_sample import (
        SOURCE_MAP_URL,
        clean_source_value,
        first_value,
        parse_area,
        parse_number,
        parse_price,
        validate_public_url,
        write_json,
    )
except ImportError:
    from extract_sample import (
        SOURCE_MAP_URL,
        clean_source_value,
        first_value,
        parse_area,
        parse_number,
        parse_price,
        validate_public_url,
        write_json,
    )

BASE_DIR = Path(__file__).resolve().parent
SNAPSHOTS_DIR = BASE_DIR / "snapshots"
REQUEST_LOG_PATH = BASE_DIR / "request-log.json"
CONFIG_URL = "https://caribbeanhousehunt.com/map-assets/js/config.js"
USER_AGENT = "MerkadoLabs-SnapshotCheck/0.1"
EXTRACTOR_VERSION = "0.2.0"
LANGUAGE = "en"
MAX_REQUESTS_PER_RUN = 3
MAX_BULK_REQUESTS_PER_RUN = 1
MAX_RESPONSE_BYTES = 25_000_000
TIMEOUT_SECONDS = 20


class NoRedirects(HTTPRedirectHandler):
    """Keep redirects explicit and un-followed."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


@dataclass(frozen=True)
class FetchResult:
    """One logged HTTP response."""

    url: str
    status: int
    content_type: str
    body: bytes
    observed_at: str


class SnapshotRequestClient:
    """Run-scoped request budget that appends to the experiment audit log."""

    def __init__(self, snapshot_id: str) -> None:
        self.snapshot_id = snapshot_id
        self.run_entries: list[dict[str, Any]] = []
        if REQUEST_LOG_PATH.exists():
            entries = json.loads(REQUEST_LOG_PATH.read_text(encoding="utf-8"))
            if not isinstance(entries, list):
                raise ValueError("request-log.json must contain a JSON array")
            self.all_entries = entries
        else:
            self.all_entries = []

    def _persist(self) -> None:
        write_json(REQUEST_LOG_PATH, self.all_entries)

    def fetch(self, url: str, purpose: str, *, is_bulk: bool = False) -> FetchResult:
        """Perform one GET with no retries and durable request logging."""

        validate_public_url(url)
        if len(self.run_entries) >= MAX_REQUESTS_PER_RUN:
            raise RuntimeError(f"Snapshot request limit of {MAX_REQUESTS_PER_RUN} reached")
        if is_bulk and sum(bool(entry.get("is_bulk")) for entry in self.run_entries) >= 1:
            raise RuntimeError("Only one CHH bulk JSON request is allowed per snapshot run")

        observed_at = datetime.now(UTC).isoformat()
        entry: dict[str, Any] = {
            "request_number": len(self.all_entries) + 1,
            "run_request_number": len(self.run_entries) + 1,
            "snapshot_id": self.snapshot_id,
            "url": url,
            "method": "GET",
            "purpose": purpose,
            "is_bulk": is_bulk,
            "user_agent": USER_AGENT,
            "timestamp": observed_at,
            "status": None,
            "content_type": None,
            "byte_count": 0,
            "elapsed_ms": None,
            "saved_to": None,
            "error": None,
        }
        self.run_entries.append(entry)
        self.all_entries.append(entry)
        self._persist()

        request = Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
        opener = build_opener(NoRedirects())
        started = time.monotonic()
        try:
            try:
                response = opener.open(request, timeout=TIMEOUT_SECONDS)
            except HTTPError as error:
                response = error
            with response:
                status = response.status
                content_type = response.headers.get_content_type().lower()
                entry["status"] = status
                entry["content_type"] = content_type
                if status != 200:
                    entry["error"] = f"HTTP {status}; redirects are not followed"
                    raise RuntimeError(entry["error"])
                body = response.read(MAX_RESPONSE_BYTES + 1)
                entry["byte_count"] = len(body)
                if len(body) > MAX_RESPONSE_BYTES:
                    entry["error"] = f"Response exceeded {MAX_RESPONSE_BYTES} bytes"
                    raise RuntimeError(entry["error"])
                return FetchResult(url, status, content_type, body, observed_at)
        except (TimeoutError, URLError, OSError) as error:
            entry["error"] = f"{type(error).__name__}: {error}"
            raise RuntimeError(entry["error"]) from error
        finally:
            entry["elapsed_ms"] = round((time.monotonic() - started) * 1000)
            self._persist()

    def mark_saved(self, result: FetchResult, path: Path) -> None:
        """Associate the matching request with its immutable evidence file."""

        for entry in reversed(self.run_entries):
            if entry["url"] == result.url:
                entry["saved_to"] = str(path.relative_to(BASE_DIR)).replace("\\", "/")
                self._persist()
                return


def parse_cachebust(config_js: str) -> str:
    """Extract the build cache-buster from the public configuration script."""

    match = re.search(r"""cachebust\s*:\s*['"]([^'"]+)['"]""", config_js)
    if not match:
        raise ValueError("AppConfig.cachebust was not found in config.js")
    value = match.group(1)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
        raise ValueError("AppConfig.cachebust contains unexpected characters")
    return value


def canonical_realtor_url(value: Any) -> str | None:
    """Normalize a realtor URL for deterministic same-source comparison."""

    cleaned = clean_source_value(value)
    if cleaned is None:
        return None
    parsed = urlparse(str(cleaned))
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return str(cleaned).strip().lower()
    filtered_query = [
        (key, query_value)
        for key, query_value in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_")
    ]
    normalized_path = parsed.path.rstrip("/") or "/"
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            normalized_path,
            "",
            urlencode(filtered_query),
            "",
        )
    )


def normalized_text(value: Any) -> str | None:
    """Normalize text used only for fallback identity fingerprints."""

    cleaned = clean_source_value(value)
    if cleaned is None:
        return None
    return " ".join(str(cleaned).casefold().split())


def comparison_fingerprint(raw: dict[str, Any]) -> str:
    """Hash stable-looking identity fields without price or mutable status."""

    realtor_url = canonical_realtor_url(raw.get("url_page"))
    if realtor_url:
        identity = {"original_realtor_url": realtor_url}
    else:
        latitude = parse_number(raw.get("lat"))
        longitude = parse_number(raw.get("lng"))
        identity = {
            "property_title": normalized_text(raw.get("property_title")),
            "property_type": normalized_text(raw.get("property_type")),
            "realtor_name": normalized_text(raw.get("realtor_name")),
            "neighbourhood": normalized_text(raw.get("neighborhood")),
            "latitude": round(float(latitude), 5) if latitude is not None else None,
            "longitude": round(float(longitude), 5) if longitude is not None else None,
        }
    canonical = json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def normalized_price(raw: dict[str, Any]) -> tuple[int | float | None, str | None]:
    """Use CHH's display currency priority without converting values."""

    for key, currency in (("price_usd", "USD"), ("price_naf", "XCG"), ("price_eur", "EUR")):
        value = parse_price(raw.get(key))
        if value is not None:
            return value, currency
    return None, None


def normalized_listing_type(value: Any) -> Any:
    """Map CHH status labels to the existing sample vocabulary."""

    cleaned = clean_source_value(value)
    lowered = str(cleaned or "").casefold()
    if lowered == "for rent":
        return "rent"
    if lowered in {"for sale", "under contract"}:
        return "sale"
    return cleaned


def build_index_record(raw: dict[str, Any]) -> dict[str, Any]:
    """Create one lightweight snapshot comparison record."""

    price, currency = normalized_price(raw)
    image_name = clean_source_value(raw.get("image_url"))
    image_url = (
        urljoin(SOURCE_MAP_URL, f"/map-assets/property-images/{str(image_name).lstrip('/')}")
        if image_name is not None
        else None
    )
    urlid = clean_source_value(raw.get("urlid"))
    return {
        "urlid": str(urlid) if urlid is not None else None,
        "original_realtor_url": clean_source_value(raw.get("url_page")),
        "listing_type": normalized_listing_type(raw.get("status")),
        "property_type": clean_source_value(raw.get("property_type")),
        "price": price,
        "currency": currency,
        "bedrooms": parse_number(raw.get("bedrooms")),
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
        "neighbourhood": clean_source_value(raw.get("neighborhood")),
        "latitude": parse_number(raw.get("lat")),
        "longitude": parse_number(raw.get("lng")),
        "primary_image_url": image_url,
        "comparison_fingerprint": comparison_fingerprint(raw),
    }


def validate_source_payload(value: Any) -> list[dict[str, Any]]:
    """Reject malformed bulk responses before creating normalized output."""

    if not isinstance(value, list):
        raise ValueError("CHH bulk source must be a JSON array")
    if not all(isinstance(item, dict) for item in value):
        raise ValueError("Every CHH bulk source item must be an object")
    return value


def source_sha256(body: bytes) -> str:
    """Return the checksum for the exact source response bytes."""

    return hashlib.sha256(body).hexdigest()


def new_snapshot_identity(now: datetime | None = None) -> tuple[str, str]:
    """Return a filesystem-safe snapshot ID and ISO observation timestamp."""

    observed = now or datetime.now(UTC)
    observed = observed.astimezone(UTC)
    return observed.strftime("%Y%m%dT%H%M%S%fZ"), observed.isoformat()


def build_snapshot_metadata(
    *,
    snapshot_id: str,
    observed_at: str,
    source_url: str,
    request_count: int,
    http_status: int,
    record_count: int,
    cachebust_value: str,
    source_body: bytes,
) -> dict[str, Any]:
    """Build the stable metadata contract for one snapshot."""

    return {
        "snapshot_id": snapshot_id,
        "observed_at": observed_at,
        "source_url": source_url,
        "request_count": request_count,
        "http_status": http_status,
        "record_count": record_count,
        "language": LANGUAGE,
        "cachebust_value": cachebust_value,
        "source_sha256": source_sha256(source_body),
        "extractor_version": EXTRACTOR_VERSION,
    }


def create_snapshot() -> Path:
    """Fetch and persist one full CHH snapshot, then update comparison health."""

    snapshot_id, started_at = new_snapshot_identity()
    snapshot_dir = SNAPSHOTS_DIR / snapshot_id
    if snapshot_dir.exists():
        raise FileExistsError(f"Snapshot already exists: {snapshot_id}")

    client = SnapshotRequestClient(snapshot_id)
    config_result = client.fetch(CONFIG_URL, "current cachebust discovery")
    try:
        config_js = config_result.body.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("config.js was not valid UTF-8") from error
    cachebust = parse_cachebust(config_js)
    source_url = urljoin(
        SOURCE_MAP_URL,
        f"/map-assets/data/{cachebust}-{LANGUAGE}.json",
    )
    source_result = client.fetch(source_url, "snapshot bulk listing data", is_bulk=True)
    try:
        payload = validate_source_payload(json.loads(source_result.body))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("CHH bulk source was not valid UTF-8 JSON") from error

    snapshot_dir.mkdir(parents=True)
    source_path = snapshot_dir / "source.json"
    source_path.write_bytes(source_result.body)
    client.mark_saved(source_result, source_path)

    normalized_index = [build_index_record(item) for item in payload]
    write_json(snapshot_dir / "normalized-index.json", normalized_index)
    metadata = build_snapshot_metadata(
        snapshot_id=snapshot_id,
        observed_at=source_result.observed_at or started_at,
        source_url=source_url,
        request_count=len(client.run_entries),
        http_status=source_result.status,
        record_count=len(payload),
        cachebust_value=cachebust,
        source_body=source_result.body,
    )
    write_json(snapshot_dir / "metadata.json", metadata)

    try:
        from .compare_snapshots import compare_latest_snapshots
    except ImportError:
        from compare_snapshots import compare_latest_snapshots

    compare_latest_snapshots()
    return snapshot_dir


def main() -> None:
    """CLI entrypoint."""

    snapshot_dir = create_snapshot()
    metadata = json.loads((snapshot_dir / "metadata.json").read_text(encoding="utf-8"))
    print(
        f"Created snapshot {metadata['snapshot_id']} with {metadata['record_count']} records "
        f"using {metadata['request_count']} requests."
    )


if __name__ == "__main__":
    main()
