from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _clean_secret(value: SecretStr | None) -> str | None:
    if value is None:
        return None
    cleaned = value.get_secret_value().lstrip("\ufeff").strip()
    return cleaned or None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="STACKR_RECOGNITION_",
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    service_name: str = "stackr-recognition-service"
    service_version: str = "stackr-recognition-service-v1.0.0"
    environment: str = "development"
    port: int = Field(default=8080, ge=1, le=65535)

    scoring_config_path: Path = Path(__file__).parent / "configs" / "scoring.v1.json"

    model_version: str = "stackr-recognition-model-unselected"
    model_path: Path | None = None
    model_url: str | None = None
    model_sha256: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$")
    model_cache_path: Path = Path("/tmp/stackr-recognition/model.onnx")
    model_download_timeout_seconds: float = Field(default=60, ge=5, le=300)
    model_max_download_bytes: int = Field(default=150_000_000, ge=1_000_000, le=500_000_000)
    model_input_width: int = Field(default=224, ge=32, le=2048)
    model_input_height: int = Field(default=224, ge=32, le=2048)
    model_embedding_dimensions: int = Field(default=384, ge=1, le=4096)
    allow_deterministic_test_model: bool = False

    active_index_version: str | None = None
    require_active_index: bool = True
    max_embedding_dimensions: int = Field(default=4096, ge=1, le=8192)
    max_ocr_text_chars: int = Field(default=2000, ge=32, le=12000)
    max_image_bytes: int = Field(default=5_000_000, ge=100_000, le=25_000_000)

    catalogue_api_url: str | None = None
    catalogue_api_key: SecretStr | None = None
    catalogue_timeout_seconds: float = Field(default=2.5, ge=0.2, le=15)

    database_url: SecretStr | None = None
    supabase_url: str | None = None
    supabase_service_role_key: SecretStr | None = None
    fallback_storage_bucket: str = "stackr-scan-temp"
    local_storage_root: Path | None = None

    metrics_token: SecretStr | None = None
    metrics_public_mode: Literal["disabled", "token"] = "token"
    gateway_auth_mode: Literal["disabled", "required"] = "required"
    gateway_service_id: str = "stackr-public-gateway"
    gateway_service_secret: SecretStr | None = None
    gateway_signature_max_age_seconds: int = Field(default=90, ge=15, le=300)
    diagnostics_enabled: bool = True
    diagnostic_retention_hours: int = Field(default=72, ge=1, le=24 * 90)

    concurrency_hint: int = Field(default=1, ge=1, le=64)

    @field_validator("catalogue_api_url", "model_url", "supabase_url", mode="before")
    @classmethod
    def clean_url_setting(cls, value):
        if value is None:
            return None
        cleaned = str(value).lstrip("\ufeff").strip()
        return cleaned or None

    @property
    def metrics_secret(self) -> str | None:
        return _clean_secret(self.metrics_token)

    @property
    def gateway_service_secret_value(self) -> str | None:
        return _clean_secret(self.gateway_service_secret)

    @property
    def service_role_secret(self) -> str | None:
        return _clean_secret(self.supabase_service_role_key)

    @property
    def database_url_secret(self) -> str | None:
        return _clean_secret(self.database_url)

    @property
    def catalogue_api_secret(self) -> str | None:
        return _clean_secret(self.catalogue_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
