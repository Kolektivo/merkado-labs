from merkado_labs.config import Settings


def test_settings_load_without_credentials() -> None:
    settings = Settings(_env_file=None)

    assert settings.environment == "development"
    assert settings.supabase_project_ref == "csaefdkpwukshtouyixg"
    assert settings.supabase_url is None
    assert settings.supabase_publishable_key is None
    assert settings.supabase_secret_key is None
    assert settings.openai_api_key is None


def test_settings_default_to_development_and_redact_secrets() -> None:
    settings = Settings(
        _env_file=None,
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="placeholder-publishable-key",
        supabase_secret_key="placeholder-secret-key",
    )

    assert settings.environment == "development"
    assert "placeholder-publishable-key" not in repr(settings)
    assert "placeholder-secret-key" not in repr(settings)
