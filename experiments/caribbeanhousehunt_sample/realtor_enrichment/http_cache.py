"""HTTP fetch helpers with cache, timeouts, and limited retries."""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

try:
    from .robots import USER_AGENT
except ImportError:  # pragma: no cover
    from robots import USER_AGENT

DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_RESPONSE_BYTES = 2_000_000
MAX_RETRIES = 2
RETRY_BACKOFF_SECONDS = 2.0


@dataclass(frozen=True)
class CachedFetch:
    """One cached HTTP GET result."""

    url: str
    status: int
    content_type: str
    body: bytes
    sha256: str
    elapsed_ms: float
    from_cache: bool
    cache_path: Path | None


class FetchError(RuntimeError):
    """Raised when a listing page cannot be fetched safely."""


def _cache_key(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def fetch_url(
    url: str,
    *,
    cache_dir: Path,
    user_agent: str = USER_AGENT,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    use_cache: bool = True,
) -> CachedFetch:
    """GET one URL with disk cache. No redirects followed by urllib defaults beyond same handler."""

    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise FetchError("Only https URLs are allowed")

    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{_cache_key(url)}.html"
    meta_path = cache_dir / f"{_cache_key(url)}.meta.json"

    if use_cache and cache_path.exists():
        body = cache_path.read_bytes()
        return CachedFetch(
            url=url,
            status=200,
            content_type="text/html",
            body=body,
            sha256=hashlib.sha256(body).hexdigest(),
            elapsed_ms=0.0,
            from_cache=True,
            cache_path=cache_path,
        )

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES + 1):
        started = time.monotonic()
        request = Request(url, headers={"User-Agent": user_agent}, method="GET")
        try:
            with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
                status = getattr(response, "status", 200)
                content_type = response.headers.get_content_type().lower()
                if status != 200:
                    raise FetchError(f"HTTP {status}")
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise FetchError("Response exceeded size limit")
                # Soft bot-protection signals: do not attempt to bypass.
                if b"cf-challenge" in body[:4000].lower() or b"captcha" in body[:4000].lower():
                    raise FetchError("Possible bot protection page; refusing to continue")
                elapsed_ms = round((time.monotonic() - started) * 1000, 1)
                sha = hashlib.sha256(body).hexdigest()
                cache_path.write_bytes(body)
                meta_path.write_text(
                    f'{{"url":{url!r},"status":{status},"sha256":"{sha}",'
                    f'"elapsed_ms":{elapsed_ms},"content_type":{content_type!r}}}\n',
                    encoding="utf-8",
                )
                return CachedFetch(
                    url=url,
                    status=status,
                    content_type=content_type,
                    body=body,
                    sha256=sha,
                    elapsed_ms=elapsed_ms,
                    from_cache=False,
                    cache_path=cache_path,
                )
        except HTTPError as error:
            last_error = error
            if error.code in {401, 403, 429, 503}:
                raise FetchError(f"HTTP {error.code}; access restricted") from error
            if attempt >= MAX_RETRIES:
                raise FetchError(f"HTTP {error.code}") from error
        except (TimeoutError, URLError, OSError, FetchError) as error:
            last_error = error
            if attempt >= MAX_RETRIES:
                raise FetchError(str(error)) from error
        time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))

    raise FetchError(str(last_error) if last_error else "fetch failed")
