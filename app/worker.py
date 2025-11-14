from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Iterable, List, Optional

from rq import SimpleWorker, Worker

from app.config import settings
from app.db import init_db, session_scope
from app.models.schemas import DownloadStatus
from app.queue import get_queue
from app.repositories.downloads import DownloadRepository
from app.services.download_manager import DownloadManager

logger = logging.getLogger(__name__)
manager = DownloadManager(settings.storage_root)


def process_download(*, download_id: str, urls: Iterable[str], post_title: Optional[str] = None) -> None:
    identifier = uuid.UUID(download_id)
    download_urls = [str(url) for url in urls]
    current_post_title: Optional[str] = post_title

    with session_scope() as session:
        repo = DownloadRepository(session)
        existing = repo.get_entity(identifier)
        if existing is None:
            repo.create(
                download_id=identifier,
                urls=download_urls,
                label=None,
                post_title=post_title,
                requested_at=datetime.utcnow(),
            )
            existing = repo.get_entity(identifier)
        elif post_title and not existing.post_title:
            existing.post_title = post_title
            session.add(existing)
            session.commit()
            session.refresh(existing)
        repo.update_status(identifier, DownloadStatus.running, started_at=datetime.utcnow())
        current_post_title = existing.post_title if existing else post_title

    try:
        result = manager.run(identifier, download_urls, folder_name=current_post_title)
        items_payload: List[dict] = [
            {
                "filename": path.name,
                "relative_path": str(path.relative_to(result.output_path)),
                "file_size": path.stat().st_size,
                "content_type": None,
                "created_at": datetime.utcnow(),
            }
            for path in result.files
        ]
        with session_scope() as session:
            repo = DownloadRepository(session)
            if items_payload:
                repo.append_items(identifier, items_payload)
            repo.update_status(
                identifier,
                DownloadStatus.succeeded,
                finished_at=datetime.utcnow(),
                output_path=str(result.output_path),
            )
        logger.info("Download %s finished with %d files", download_id, len(items_payload))
    except Exception as exc:  # pragma: no cover - placeholder for comprehensive error handling
        with session_scope() as session:
            repo = DownloadRepository(session)
            repo.update_status(
                identifier,
                DownloadStatus.failed,
                finished_at=datetime.utcnow(),
                failure_reason=str(exc),
            )
        logger.exception("Download %s failed: %s", download_id, exc)
        raise


def run_worker() -> None:
    logging.basicConfig(level=logging.INFO)
    init_db()
    queue = get_queue()
    if os.name == "nt":
        worker = SimpleWorker([queue], connection=queue.connection)
    else:
        worker = Worker([queue], connection=queue.connection)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    run_worker()
