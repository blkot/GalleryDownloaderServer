import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, HttpUrl


class DownloadStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class DownloadCreate(BaseModel):
    urls: List[HttpUrl] = Field(..., description="One or more gallery/file URLs to download.")
    label: Optional[str] = Field(None, description="Optional user-provided identifier for easier lookup.")
    priority: Optional[int] = Field(None, ge=0, le=10, description="Optional priority hint for queue ordering.")
    post_title: Optional[str] = Field(
        None, description="Optional post/thread title used as the parent folder when storing files."
    )


class DownloadItemRead(BaseModel):
    id: uuid.UUID
    download_id: uuid.UUID
    filename: str
    relative_path: str
    file_size: Optional[int] = None
    content_type: Optional[str] = None
    created_at: datetime


class DownloadRead(BaseModel):
    id: uuid.UUID
    status: DownloadStatus
    urls: List[HttpUrl]
    label: Optional[str] = None
    post_title: Optional[str] = None
    output_path: Optional[str] = None
    requested_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    items: List[DownloadItemRead] = Field(default_factory=list)
