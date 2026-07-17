"""Private object-storage helpers for listing raw evidence (Labs only)."""

from __future__ import annotations

from typing import Any

from merkado_labs.config import get_settings
from merkado_labs.scrapers.evidence import evidence_storage_path

RAW_EVIDENCE_BUCKET = "listing-raw-evidence"


def _require_labs() -> None:
    settings = get_settings()
    if settings.supabase_project_ref != "csaefdkpwukshtouyixg":
        raise RuntimeError(f"Refusing non-Labs project ref {settings.supabase_project_ref!r}")
    if settings.supabase_url and "csaefdkpwukshtouyixg" not in str(settings.supabase_url):
        raise RuntimeError(f"Refusing non-Labs SUPABASE_URL: {settings.supabase_url}")


def create_storage_client() -> Any:
    """Service-role Supabase client for private evidence uploads."""

    _require_labs()
    settings = get_settings()
    if settings.supabase_url is None or settings.supabase_secret_key is None:
        raise RuntimeError("Labs Supabase credentials are required for evidence storage")
    from supabase import create_client

    return create_client(
        str(settings.supabase_url),
        settings.supabase_secret_key.get_secret_value(),
    )


def upload_raw_html(
    *,
    source_key: str,
    external_id: str,
    checksum: str,
    html_bytes: bytes,
    content_type: str = "text/html; charset=utf-8",
    client: Any | None = None,
) -> str:
    """Upload full HTML to the private raw-evidence bucket. Returns storage path."""

    path = evidence_storage_path(
        source_key=source_key,
        external_id=external_id,
        checksum=checksum,
        extension="html",
    )
    supabase = client or create_storage_client()
    supabase.storage.from_(RAW_EVIDENCE_BUCKET).upload(
        path,
        html_bytes,
        file_options={
            "content-type": content_type,
            "upsert": "true",
        },
    )
    return path
