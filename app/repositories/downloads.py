from __future__ import annotations

import uuid
from datetime import datetime
from typing import Iterable, List, Optional

from sqlmodel import Session, select

from app.models.entities import Download, DownloadItem, DownloadUrl
from app.models.schemas import DownloadItemRead, DownloadRead, DownloadStatus


class DownloadRepository:
    """Repository encapsulating database operations for downloads and their items."""

    def __init__(self, session: Session) -> None:
        self.session = session

    # ---------------------------------------------------------------------
    # CRUD helpers
    # ---------------------------------------------------------------------
    def create(
        self,
        *,
        download_id: uuid.UUID,
        urls: List[str],
        label: Optional[str],
        post_title: Optional[str],
        requested_at: datetime,
    ) -> DownloadRead:
        entity = Download(
            id=download_id,
            urls=urls,
            label=label,
            post_title=post_title,
            requested_at=requested_at,
            status=DownloadStatus.queued,
        )
        self.session.add(entity)
        self.session.flush()
        for url in urls:
            self.session.add(DownloadUrl(download_id=download_id, url=url))
        self.session.commit()
        self.session.refresh(entity)
        return self._to_read(entity)

    def get(self, download_id: uuid.UUID) -> Optional[DownloadRead]:
        entity = self.session.exec(select(Download).where(Download.id == download_id)).first()
        if entity is None:
            return None
        return self._to_read(entity)

    def get_entity(self, download_id: uuid.UUID) -> Optional[Download]:
        return self.session.exec(select(Download).where(Download.id == download_id)).first()

    def list(self) -> List[DownloadRead]:
        results = self.session.exec(select(Download).order_by(Download.requested_at.desc())).all()
        return [self._to_read(item) for item in results]

    def find_active_by_urls(self, urls: Iterable[str]) -> Optional[DownloadRead]:
        for url in urls:
            stmt = (
                select(Download)
                .join(DownloadUrl)
                .where(DownloadUrl.url == url)
                .where(Download.status != DownloadStatus.failed)
            )
            entity = self.session.exec(stmt).first()
            if entity:
                return self._to_read(entity)
        return None

    def find_by_urls(self, urls: Iterable[str]) -> Optional[DownloadRead]:
        for url in urls:
            stmt = select(Download).join(DownloadUrl).where(DownloadUrl.url == url)
            entity = self.session.exec(stmt).first()
            if entity:
                return self._to_read(entity)
        return None

    def find_failed_by_urls(self, urls: Iterable[str]) -> Optional[Download]:
        for url in urls:
            stmt = select(Download).join(DownloadUrl).where(DownloadUrl.url == url)
            entity = self.session.exec(stmt).first()
            if entity and entity.status == DownloadStatus.failed:
                return entity
        return None

    def delete(self, download_id: uuid.UUID) -> None:
        entity = self.session.exec(select(Download).where(Download.id == download_id)).first()
        if entity is None:
            return
        self.session.delete(entity)
        self.session.commit()

    def update_status(
        self,
        download_id: uuid.UUID,
        status: DownloadStatus,
        *,
        started_at: Optional[datetime] = None,
        finished_at: Optional[datetime] = None,
        failure_reason: Optional[str] = None,
        output_path: Optional[str] = None,
    ) -> Optional[DownloadRead]:
        entity = self.session.exec(select(Download).where(Download.id == download_id)).first()
        if entity is None:
            return None

        entity.status = status
        if started_at is not None:
            entity.started_at = started_at
        if finished_at is not None:
            entity.finished_at = finished_at
        entity.failure_reason = failure_reason
        if output_path is not None:
            entity.output_path = output_path

        self.session.add(entity)
        self.session.commit()
        self.session.refresh(entity)
        return self._to_read(entity)

    def append_items(
        self, download_id: uuid.UUID, items: Iterable[dict]
    ) -> Optional[DownloadRead]:
        entity = self.session.exec(select(Download).where(Download.id == download_id)).first()
        if entity is None:
            return None

        for item in items:
            record = DownloadItem(
                download_id=download_id,
                filename=item["filename"],
                relative_path=item["relative_path"],
                file_size=item.get("file_size"),
                content_type=item.get("content_type"),
                created_at=item.get("created_at", datetime.utcnow()),
            )
            self.session.add(record)

        self.session.commit()
        self.session.refresh(entity)
        return self._to_read(entity)

    # ---------------------------------------------------------------------
    # Mapping helpers
    # ---------------------------------------------------------------------
    def _to_read(self, entity: Download) -> DownloadRead:
        items_stmt = select(DownloadItem).where(DownloadItem.download_id == entity.id)
        items = self.session.exec(items_stmt).all()
        return DownloadRead(
            id=entity.id,
            status=entity.status,
            urls=list(entity.urls),
            label=entity.label,
            post_title=entity.post_title,
            output_path=entity.output_path,
            requested_at=entity.requested_at,
            started_at=entity.started_at,
            finished_at=entity.finished_at,
            failure_reason=entity.failure_reason,
            items=[
                DownloadItemRead(
                    id=item.id,
                    download_id=item.download_id,
                    filename=item.filename,
                    relative_path=item.relative_path,
                    file_size=item.file_size,
                    content_type=item.content_type,
                    created_at=item.created_at,
                )
                for item in items
            ],
        )
