from __future__ import annotations

import argparse
import logging
import uuid
from typing import Iterable, List

from sqlmodel import select

from app.db import session_scope
from app.media.indexer import enqueue_media_index_job, index_download
from app.models.entities import Download
from app.models.schemas import DownloadStatus


def main() -> None:
    parser = argparse.ArgumentParser(description="Reindex media assets for completed downloads.")
    parser.add_argument("--download-id", help="Specific download ID to (re)index.")
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process every succeeded download instead of only pending media jobs.",
    )
    parser.add_argument(
        "--inline",
        action="store_true",
        help="Run the indexer inline instead of enqueueing via Redis.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate previews/thumbnails even if they already exist.",
    )
    args = parser.parse_args()

    target_ids = list(_resolve_targets(download_id=args.download_id, include_all=args.all))
    if not target_ids:
        logging.info("No downloads matched the provided filters.")
        return

    if args.inline:
        for download_id in target_ids:
            logging.info("Indexing %s inline", download_id)
            index_download(download_id=str(download_id), force=args.force)
    else:
        for download_id in target_ids:
            logging.info("Enqueuing media job for %s", download_id)
            enqueue_media_index_job(download_id, force=args.force)


def _resolve_targets(*, download_id: str | None, include_all: bool) -> Iterable[uuid.UUID]:
    if download_id:
        yield uuid.UUID(download_id)
        return

    with session_scope() as session:
        stmt = select(Download).where(Download.status == DownloadStatus.succeeded)
        if not include_all:
            stmt = stmt.where(Download.media_indexed.is_(False))
        for download in session.exec(stmt).all():
            yield download.id


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
