from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Optional

from pydantic import AnyUrl, Field, validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central application configuration parsed from environment variables."""

    api_host: str = Field("0.0.0.0", description="Host interface for the API server.")
    api_port: int = Field(8080, description="Port for the API server.")
    api_token: str = Field("changeme", description="Bearer token required for API access.")

    redis_url: AnyUrl = Field("redis://redis:6379/0", description="Redis connection for RQ.")
    database_url: AnyUrl = Field("sqlite:///./data/gallery.db", description="SQL database URL.")

    storage_root: Path = Field(Path("/data/downloads"), description="Base path for downloaded assets.")
    gallery_dl_config_path: Path = Field(
        Path("/etc/gallery-dl/config.json"),
        description="Optional path to a gallery-dl configuration file mounted into the container.",
    )
    gallery_dl_extra_args: Optional[str] = Field(
        None,
        description="Optional additional CLI arguments for gallery-dl, serialized as a space-delimited string.",
    )

    worker_concurrency: Annotated[int, Field(ge=1)] = Field(
        1, description="Number of concurrent jobs a worker process can execute."
    )
    job_timeout_seconds: Optional[int] = Field(
        1800,
        description="Maximum number of seconds a download job may run before timing out. Set to 0 to disable.",
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        env_prefix = "GDL_"

    @validator("storage_root", pre=True)
    def expand_storage_root(cls, value: Path) -> Path:
        """Expand user and environment variables for storage root paths."""
        return Path(value).expanduser().resolve()

    @validator("job_timeout_seconds", pre=True)
    def normalize_job_timeout(cls, value: Optional[int]) -> Optional[int]:
        """Interpret falsy values as disabling timeouts."""
        if value in (None, "", "None", 0, "0"):
            return None
        return int(value)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached `Settings` instance to avoid reparsing the environment."""
    return Settings()


settings = get_settings()
