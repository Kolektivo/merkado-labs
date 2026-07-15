"""Bounded, read-only HTTP collector for one Caribbean House Hunt reconnaissance."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_REQUESTS = 8
MAX_RESPONSE_BYTES = 2_000_000
TIMEOUT_SECONDS = 15
USER_AGENT = "MerkadoLabs-Reconnaissance/0.1"
ALLOWED_HOSTS = {"caribbeanhousehunt.com", "www.caribbeanhousehunt.com"}
TEXT_CONTENT_TYPES = {
    "application/javascript",
    "application/json",
    "application/ld+json",
    "application/xml",
    "text/html",
    "text/javascript",
    "text/plain",
    "text/xml",
}

BASE_DIR = Path(__file__).resolve().parent
EVIDENCE_DIR = BASE_DIR / "evidence"
REQUEST_LOG_PATH = BASE_DIR / "request-log.json"


class NoRedirects(HTTPRedirectHandler):
    """Keep redirects explicit so each network request is counted."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def load_request_log() -> list[dict[str, object]]:
    if not REQUEST_LOG_PATH.exists():
        return []
    data = json.loads(REQUEST_LOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("request-log.json must contain a JSON array")
    return data


def write_request_log(entries: list[dict[str, object]]) -> None:
    REQUEST_LOG_PATH.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError(f"Only HTTPS URLs are allowed: {url}")
    if parsed.hostname not in ALLOWED_HOSTS or parsed.port not in (None, 443):
        raise ValueError(f"Host is not allowed: {url}")
    if parsed.username or parsed.password:
        raise ValueError(f"Credentials in URLs are forbidden: {url}")


def validate_filename(filename: str) -> Path:
    candidate = Path(filename)
    if candidate.name != filename or candidate.suffix.lower() not in {
        ".html",
        ".json",
        ".txt",
        ".xml",
    }:
        raise ValueError(f"Unsafe evidence filename: {filename}")
    return EVIDENCE_DIR / candidate


def fetch(url: str, filename: str, entries: list[dict[str, object]]) -> None:
    validate_url(url)
    output_path = validate_filename(filename)
    if len(entries) >= MAX_REQUESTS:
        raise RuntimeError(f"Request limit of {MAX_REQUESTS} has already been reached")

    started_at = datetime.now(UTC).isoformat()
    log_entry: dict[str, object] = {
        "request_number": len(entries) + 1,
        "url": url,
        "method": "GET",
        "timestamp": started_at,
        "status": None,
        "content_type": None,
        "byte_count": 0,
        "saved_to": None,
        "error": None,
    }
    entries.append(log_entry)
    write_request_log(entries)

    request = Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
    opener = build_opener(NoRedirects())

    try:
        try:
            response = opener.open(request, timeout=TIMEOUT_SECONDS)
        except HTTPError as error:
            response = error

        with response:
            status = response.status
            content_type = response.headers.get_content_type().lower()
            log_entry["status"] = status
            log_entry["content_type"] = content_type

            if status != 200:
                log_entry["error"] = f"HTTP {status}; response not saved"
                return
            if content_type not in TEXT_CONTENT_TYPES:
                log_entry["error"] = f"Non-text content type rejected: {content_type}"
                return

            body = response.read(MAX_RESPONSE_BYTES + 1)
            log_entry["byte_count"] = len(body)
            if len(body) > MAX_RESPONSE_BYTES:
                log_entry["error"] = (
                    f"Response exceeded {MAX_RESPONSE_BYTES} bytes and was not saved"
                )
                return

            output_path.write_bytes(body)
            log_entry["saved_to"] = str(output_path.relative_to(BASE_DIR))
    except (TimeoutError, URLError, OSError) as error:
        log_entry["error"] = f"{type(error).__name__}: {error}"
    finally:
        write_request_log(entries)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "targets",
        nargs="+",
        metavar="URL=FILENAME",
        help="Allowed public HTTPS URL and evidence filename",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    entries = load_request_log()
    if len(entries) + len(args.targets) > MAX_REQUESTS:
        raise SystemExit(
            f"Targets would exceed the cumulative {MAX_REQUESTS}-request maximum"
        )

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    for target in args.targets:
        try:
            url, filename = target.rsplit("=", maxsplit=1)
            fetch(url, filename, entries)
        except (RuntimeError, ValueError) as error:
            raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
