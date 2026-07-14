"""Environment-backed configuration for local Merkado Labs experiments."""

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Load settings without exposing secret values in logs or representations."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    supabase_url: AnyHttpUrl = Field(description="URL of an experimental Supabase project")
    supabase_anon_key: SecretStr = Field(description="Anonymous key for that project")
    supabase_service_role_key: SecretStr | None = Field(
        default=None,
        description="Server-only key; never expose this value to browser code",
    )
    openai_api_key: SecretStr | None = None


@lru_cache
def get_settings() -> Settings:
    """Return validated settings.

    Pydantic raises a clear validation error here when required values are missing.
    Importing this module alone does not require local credentials.
    """

    return Settings()
