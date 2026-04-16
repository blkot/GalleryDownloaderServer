import mimetypes
import uuid
from enum import Enum
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.api.security import require_token
from app.db import session_scope
from app.models.entities import Download, DownloadItem


class MediaVariant(str, Enum):
    original = "original"
    preview = "preview"
    thumb = "thumb"


router = APIRouter(prefix="/media", tags=["media"], dependencies=[Depends(require_token)])


@router.get("/{item_id}")
async def get_media_asset(
    item_id: uuid.UUID,
    variant: MediaVariant = Query(MediaVariant.original, description="Asset variant to return."),
    disposition: Literal["inline", "attachment"] = Query(
        "inline", description="Whether the browser should display (`inline`) or download (`attachment`) the file."
    ),
) -> FileResponse:
    with session_scope() as session:
        item = session.get(DownloadItem, item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

        download = session.get(Download, item.download_id)
        if download is None or not download.output_path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent download missing")

        base_path = Path(download.output_path)
        if not base_path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Download directory missing")

        file_path = _select_variant(base_path, item, variant)

    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested media variant not found")

    media_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    download_name = file_path.name if variant != MediaVariant.original else item.filename

    response = FileResponse(path=file_path, media_type=media_type, filename=download_name)
    response.headers["Content-Disposition"] = f'{disposition}; filename="{download_name}"'
    response.headers["Accept-Ranges"] = "bytes"
    return response


def _select_variant(base_path: Path, item: DownloadItem, variant: MediaVariant) -> Path:
    if variant is MediaVariant.original:
        rel = item.relative_path
    elif variant is MediaVariant.preview:
        rel = item.preview_path or item.relative_path
    else:
        rel = item.thumbnail_path or item.preview_path or item.relative_path

    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requested media variant unavailable")
    return _safe_join(base_path, rel)


def _safe_join(base_path: Path, relative: str) -> Path:
    normalized = Path(relative.replace("\\", "/"))
    candidate = (base_path / normalized).resolve()
    try:
        candidate.relative_to(base_path.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid media path") from exc
    return candidate
