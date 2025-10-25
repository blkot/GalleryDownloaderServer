import uuid
from datetime import datetime

from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status

from app.api.security import require_token
from app.db import session_scope
from app.models import DownloadCreate, DownloadRead
from app.queue import get_queue
from app.repositories.downloads import DownloadRepository
from app.services.runtime_config import load_runtime_config

router = APIRouter(dependencies=[Depends(require_token)])


@router.post("", response_model=DownloadRead, status_code=status.HTTP_202_ACCEPTED)
async def enqueue_download(
    response: Response,
    payload: Optional[DownloadCreate] = Body(
        None, description="JSON payload describing the download request."
    ),
    urls: Optional[List[str]] = Query(
        None, alias="url", description="Repeated query parameter with gallery/file URLs."
    ),
    post_title: Optional[str] = Query(
        None, description="Optional post title when invoking via query parameters."
    ),
    label: Optional[str] = Query(None, description="Optional label when invoking via query parameters."),
    priority: Optional[int] = Query(
        None, ge=0, le=10, description="Optional priority hint when invoking via query parameters."
    ),
) -> DownloadRead:
    if payload is None:
        if not urls:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Either provide a JSON body or at least one `url` query parameter.",
            )
        payload = DownloadCreate(
            urls=urls,
            post_title=post_title,
            label=label,
            priority=priority,
        )
    elif post_title and not payload.post_title:
        payload.post_title = post_title

    download_id = uuid.uuid4()
    normalized_urls = [str(url) for url in payload.urls]
    with session_scope() as session:
        repo = DownloadRepository(session)
        existing = repo.find_active_by_urls(normalized_urls)
        if existing:
            response.status_code = status.HTTP_200_OK
            return existing
        record = repo.create(
            download_id=download_id,
            urls=normalized_urls,
            label=payload.label,
            post_title=payload.post_title,
            requested_at=datetime.utcnow(),
        )
        runtime = load_runtime_config(session)

    queue = get_queue()
    job_timeout = runtime.job_timeout_seconds
    queue.enqueue(
        "app.worker.process_download",
        download_id=str(download_id),
        urls=normalized_urls,
        post_title=payload.post_title,
        job_timeout=job_timeout,
    )

    return record


@router.get("/{download_id}", response_model=DownloadRead)
async def get_download(download_id: uuid.UUID) -> DownloadRead:
    with session_scope() as session:
        repo = DownloadRepository(session)
        record = repo.get(download_id)
        if record is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Download {download_id} not found")
        return record


@router.get("", response_model=list[DownloadRead])
async def list_downloads() -> list[DownloadRead]:
    with session_scope() as session:
        repo = DownloadRepository(session)
        return repo.list()
