"""Robots.txt policy helpers for optional original-realtor enrichment."""

from __future__ import annotations

import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

USER_AGENT = "MerkadoLabs-RealtorEnrichment/0.1 (+https://github.com/merkado; research)"
DEFAULT_CRAWL_DELAY_SECONDS = 2.0


@dataclass(frozen=True)
class RobotsDecision:
    """Result of a robots.txt check for one URL path."""

    domain: str
    robots_url: str
    fetch_status: str
    can_fetch: bool | None
    crawl_delay_seconds: float | None
    notes: str


def robots_url_for_domain(domain: str) -> str:
    """Build the standard robots.txt URL for a hostname."""

    host = domain.lower().strip().removeprefix("www.")
    # Prefer the exact hostname from the listing URL when available.
    return f"https://{domain.rstrip('/')}/robots.txt"


def check_robots(
    listing_url: str,
    *,
    user_agent: str = USER_AGENT,
    timeout_seconds: float = 15.0,
) -> RobotsDecision:
    """Fetch robots.txt and evaluate whether the listing URL may be fetched.

    Returns can_fetch=None when robots.txt cannot be retrieved or parsed safely.
    Never treats a missing robots file as blanket permission for enrichment.
    """

    parsed = urlparse(listing_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return RobotsDecision(
            domain="",
            robots_url="",
            fetch_status="invalid_url",
            can_fetch=False,
            crawl_delay_seconds=None,
            notes="Listing URL is not a public http(s) URL",
        )
    domain = parsed.hostname.lower()
    robots_url = robots_url_for_domain(domain)
    request = Request(robots_url, headers={"User-Agent": user_agent}, method="GET")
    try:
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
            status = getattr(response, "status", 200)
            body = response.read(200_000)
    except HTTPError as error:
        if error.code in {401, 403}:
            return RobotsDecision(
                domain=domain,
                robots_url=robots_url,
                fetch_status=f"http_{error.code}",
                can_fetch=False,
                crawl_delay_seconds=None,
                notes="robots.txt access denied; enrichment blocked",
            )
        if error.code == 404:
            return RobotsDecision(
                domain=domain,
                robots_url=robots_url,
                fetch_status="http_404",
                can_fetch=None,
                crawl_delay_seconds=None,
                notes=(
                    "No robots.txt found. Do not treat as permission; "
                    "require explicit adapter review before enrichment."
                ),
            )
        return RobotsDecision(
            domain=domain,
            robots_url=robots_url,
            fetch_status=f"http_{error.code}",
            can_fetch=None,
            crawl_delay_seconds=None,
            notes=f"Unexpected robots.txt HTTP status {error.code}",
        )
    except (TimeoutError, URLError, OSError) as error:
        return RobotsDecision(
            domain=domain,
            robots_url=robots_url,
            fetch_status="network_error",
            can_fetch=None,
            crawl_delay_seconds=None,
            notes=f"{type(error).__name__}: {error}",
        )

    if status != 200:
        return RobotsDecision(
            domain=domain,
            robots_url=robots_url,
            fetch_status=f"http_{status}",
            can_fetch=None,
            crawl_delay_seconds=None,
            notes="robots.txt returned a non-200 status",
        )

    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.parse(body.decode("utf-8", errors="replace").splitlines())
    except Exception as error:  # noqa: BLE001 - policy must fail closed
        return RobotsDecision(
            domain=domain,
            robots_url=robots_url,
            fetch_status="parse_error",
            can_fetch=None,
            crawl_delay_seconds=None,
            notes=f"Could not parse robots.txt: {error}",
        )

    allowed = parser.can_fetch(user_agent, listing_url)
    delay = parser.crawl_delay(user_agent)
    return RobotsDecision(
        domain=domain,
        robots_url=robots_url,
        fetch_status="ok",
        can_fetch=allowed,
        crawl_delay_seconds=float(delay) if delay is not None else DEFAULT_CRAWL_DELAY_SECONDS,
        notes="Evaluated against MerkadoLabs-RealtorEnrichment user agent",
    )


def sleep_for_delay(decision: RobotsDecision) -> None:
    """Honor crawl-delay between enrichment requests."""

    delay = decision.crawl_delay_seconds or DEFAULT_CRAWL_DELAY_SECONDS
    time.sleep(max(delay, DEFAULT_CRAWL_DELAY_SECONDS))
