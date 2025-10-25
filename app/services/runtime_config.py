from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from sqlmodel import Session

from app.config import settings as env_settings
from app.repositories.settings import SettingsRepository


@dataclass
class RuntimeConfig:
    storage_root: Path
    gallery_dl_extra_args: Optional[str]
    job_timeout_seconds: Optional[int]


def load_runtime_config(session: Session) -> RuntimeConfig:
    repo = SettingsRepository(session)
    overrides = repo.all()

    storage_root = Path(overrides.get("storage_root") or env_settings.storage_root)
    gallery_dl_extra_args = overrides.get("gallery_dl_extra_args") or env_settings.gallery_dl_extra_args

    raw_timeout = overrides.get("job_timeout_seconds")
    if raw_timeout is None or raw_timeout == "":
        job_timeout = env_settings.job_timeout_seconds
    else:
        try:
            value = int(raw_timeout)
            job_timeout = None if value == 0 else value
        except ValueError:
            job_timeout = env_settings.job_timeout_seconds

    storage_root = storage_root.expanduser().resolve()

    return RuntimeConfig(
        storage_root=storage_root,
        gallery_dl_extra_args=gallery_dl_extra_args,
        job_timeout_seconds=job_timeout,
    )
