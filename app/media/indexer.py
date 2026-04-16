from __future__ import annotations

import json
import logging
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlmodel import select

from app.config import settings
from app.db import session_scope
from app.models.entities import Download, DownloadItem
from app.models.schemas import DownloadStatus
from app.queue import get_queue

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".mov", ".avi", ".webm", ".ts", ".m4v"}

PREVIEW_SUBDIR = "_previews"
THUMB_SUBDIR = "_thumbs"


class MediaMetadata:
    def __init__(self, width: Optional[int] = None, height: Optional[int] = None, duration: Optional[float] = None):
        self.width = width
        self.height = height
        self.duration = duration


def index_download(*, download_id: str, force: bool = False) -> None:
    """Background job that generates thumbnails/previews for a download's media items."""
    identifier = uuid.UUID(download_id)
    with session_scope() as session:
        download = session.exec(select(Download).where(Download.id == identifier)).first()
        if download is None:
            logger.warning("Media indexing skipped: download %s not found", download_id)
            return
        if download.status != DownloadStatus.succeeded:
            logger.info("Media indexing skipped: download %s not in succeeded state", download_id)
            return
        base_path = Path(download.output_path or "")
        if not base_path.exists():
            logger.warning("Media indexing skipped: output path missing for %s", download_id)
            return

        for item in download.items:
            try:
                _process_item(base_path, item, force=force)
                session.add(item)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.exception("Failed to index media for item %s: %s", item.id, exc)

        download.media_indexed = True
        download.media_indexed_at = datetime.utcnow()
        session.add(download)
        session.commit()


def _process_item(base_path: Path, item: DownloadItem, *, force: bool) -> None:
    source_path = (base_path / item.relative_path).resolve()
    if not source_path.exists():
        logger.warning("Media file missing for item %s (%s)", item.id, source_path)
        return

    media_type = _determine_media_type(source_path)
    item.media_type = media_type
    metadata = MediaMetadata()

    if media_type == "image":
        metadata = _probe_media(source_path)
        item.thumbnail_path = _rel_path(source_path, base_path)
        item.preview_path = _rel_path(source_path, base_path)
    elif media_type == "video":
        preview_target = _build_media_path(base_path, item.relative_path, PREVIEW_SUBDIR, ".mp4")
        thumb_target = _build_media_path(base_path, item.relative_path, THUMB_SUBDIR, ".jpg")

        if force or not preview_target.exists():
            _transcode_video(source_path, preview_target)
        if force or not thumb_target.exists():
            probe_source = preview_target if preview_target.exists() else source_path
            _extract_thumbnail(probe_source, thumb_target)

        metadata = _probe_media(preview_target if preview_target.exists() else source_path)
        if preview_target.exists():
            item.preview_path = _rel_path(preview_target, base_path)
        else:
            item.preview_path = _rel_path(source_path, base_path)

        if thumb_target.exists():
            item.thumbnail_path = _rel_path(thumb_target, base_path)
        else:
            item.thumbnail_path = item.preview_path
    else:
        item.thumbnail_path = None
        item.preview_path = None

    item.width = metadata.width
    item.height = metadata.height
    item.duration_seconds = metadata.duration
    item.processed_at = datetime.utcnow()


def _determine_media_type(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return "file"


def _build_media_path(base_path: Path, relative_path: str, subdir: str, suffix: str) -> Path:
    rel = Path(relative_path)
    target = base_path / subdir / rel.parent / f"{rel.stem}{suffix}"
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def _rel_path(path: Path, base_path: Path) -> str:
    try:
        return path.relative_to(base_path).as_posix()
    except ValueError:
        return path.as_posix()


def _transcode_video(source: Path, target: Path) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(target),
    ]
    _run_subprocess(command, "video transcode")


def _extract_thumbnail(source: Path, target: Path) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-vframes",
        "1",
        "-q:v",
        "2",
        str(target),
    ]
    _run_subprocess(command, "thumbnail extraction")


def _probe_media(path: Path) -> MediaMetadata:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration",
        "-of",
        "json",
        str(path),
    ]
    try:
        completed = subprocess.run(command, capture_output=True, text=True, check=True)
        payload = json.loads(completed.stdout or "{}")
        streams = payload.get("streams") or []
        if not streams:
            return MediaMetadata()
        stream = streams[0]
        width = int(stream.get("width")) if stream.get("width") else None
        height = int(stream.get("height")) if stream.get("height") else None
        duration = _parse_duration(stream.get("duration"))
        return MediaMetadata(width=width, height=height, duration=duration)
    except Exception as exc:  # pragma: no cover
        logger.debug("ffprobe failed for %s: %s", path, exc)
        return MediaMetadata()


def _parse_duration(value: Optional[str]) -> Optional[float]:
    if value in (None, "", "N/A"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _run_subprocess(command: list[str], description: str) -> None:
    try:
        subprocess.run(command, check=True, capture_output=True)
    except FileNotFoundError:
        logger.warning("Skipping %s because ffmpeg is not installed", description)
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        logger.warning("%s failed (%s): %s", description, exc.returncode, exc.stderr)


def enqueue_media_index_job(download_id: uuid.UUID, *, force: bool = False) -> None:
    """Schedule a media indexing job for the specified download."""
    queue = get_queue("media")
    queue.enqueue(
        "app.media.indexer.index_download",
        download_id=str(download_id),
        force=force,
        job_timeout=settings.media_job_timeout_seconds,
    )
