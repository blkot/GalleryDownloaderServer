from fastapi import APIRouter, Depends

from app.api.security import require_token
from app.db import session_scope
from app.models.schemas import RuntimeSettingsRead, RuntimeSettingsUpdate
from app.repositories.settings import SettingsRepository
from app.services.runtime_config import load_runtime_config

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_token)])


@router.get("", response_model=RuntimeSettingsRead)
async def get_settings() -> RuntimeSettingsRead:
    with session_scope() as session:
        runtime = load_runtime_config(session)
        return RuntimeSettingsRead(
            storage_root=str(runtime.storage_root),
            gallery_dl_extra_args=runtime.gallery_dl_extra_args,
            job_timeout_seconds=runtime.job_timeout_seconds,
        )


@router.put("", response_model=RuntimeSettingsRead)
async def update_settings(payload: RuntimeSettingsUpdate) -> RuntimeSettingsRead:
    with session_scope() as session:
        repo = SettingsRepository(session)
        updates = {}
        if payload.storage_root is not None:
            updates["storage_root"] = payload.storage_root
        if payload.gallery_dl_extra_args is not None:
            updates["gallery_dl_extra_args"] = payload.gallery_dl_extra_args
        if payload.job_timeout_seconds is not None:
            updates["job_timeout_seconds"] = str(payload.job_timeout_seconds)

        if updates:
            repo.bulk_update(updates)

        runtime = load_runtime_config(session)
        return RuntimeSettingsRead(
            storage_root=str(runtime.storage_root),
            gallery_dl_extra_args=runtime.gallery_dl_extra_args,
            job_timeout_seconds=runtime.job_timeout_seconds,
        )
