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
    supabase_project_ref: str = Field(
        default="csaefdkpwukshtouyixg",
        description="Labs Supabase project reference",
    )
    supabase_url: AnyHttpUrl | None = Field(
        default=None,
        description="URL of the experimental Supabase project",
    )
    supabase_publishable_key: SecretStr | None = Field(
        default=None,
        description="Publishable key for client-safe Supabase access",
    )
    supabase_secret_key: SecretStr | None = Field(
        default=None,
        description="Server-only secret key; never expose this value to browser code",
    )
    openai_api_key: SecretStr | None = None
    openai_enrichment_model: str | None = Field(
        default=None,
        description="OpenAI model for Labs listing enrichment (required; no silent default)",
    )
    openai_enrichment_reasoning_effort: str | None = Field(
        default=None,
        description="Optional Responses API reasoning effort for enrichment",
    )
    openai_enrichment_max_output_tokens: int | None = Field(
        default=None,
        description="Optional max output tokens for enrichment responses",
    )
    openai_enrichment_batch_size: int = Field(
        default=3,
        ge=1,
        le=25,
        description="Listings processed per enrichment job batch",
    )
    labs_admin_secret: SecretStr | None = Field(
        default=None,
        description="Optional Labs dashboard admin gate for enrichment actions",
    )


@lru_cache
def get_settings() -> Settings:
    """Return validated settings.

    Importing this module alone does not require local credentials.
    """

    return Settings()
