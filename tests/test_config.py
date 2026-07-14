import pytest
from pydantic import ValidationError

from merkado_labs.config import Settings


def test_settings_require_supabase_connection_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_default_to_development_and_redact_secrets() -> None:
    settings = Settings(
        _env_file=None,
        supabase_url="https://example.supabase.co",
        supabase_anon_key="placeholder-anon-key",
    )

    assert settings.environment == "development"
    assert "placeholder-anon-key" not in repr(settings)
