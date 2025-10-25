import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Column, Enum as SAEnum, JSON, String
from sqlmodel import Field, Relationship, SQLModel

from app.models.schemas import DownloadStatus


class Download(SQLModel, table=True):
    """SQLModel entity representing a download job."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: DownloadStatus = Field(
        default=DownloadStatus.queued, sa_column=Column(SAEnum(DownloadStatus), nullable=False)
    )
    urls: List[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    label: Optional[str] = Field(default=None, nullable=True)
    post_title: Optional[str] = Field(default=None, nullable=True)
    output_path: Optional[str] = Field(default=None, nullable=True)
    requested_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
    started_at: Optional[datetime] = Field(default=None, nullable=True)
    finished_at: Optional[datetime] = Field(default=None, nullable=True)
    failure_reason: Optional[str] = Field(default=None, nullable=True)

    items: List["DownloadItem"] = Relationship(
        back_populates="download",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "lazy": "selectin"},
    )
    url_entries: List["DownloadUrl"] = Relationship(
        back_populates="download",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "lazy": "selectin"},
    )


class DownloadItem(SQLModel, table=True):
    """SQLModel entity for individual files produced by a download."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    download_id: uuid.UUID = Field(foreign_key="download.id", nullable=False, index=True)
    filename: str
    relative_path: str
    file_size: Optional[int] = None
    content_type: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)

    download: Optional[Download] = Relationship(back_populates="items")


class DownloadUrl(SQLModel, table=True):
    """Tracks individual source URLs associated with a download job."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    download_id: uuid.UUID = Field(foreign_key="download.id", nullable=False, index=True)
    url: str = Field(sa_column=Column(String(2048), nullable=False, index=True, unique=True))

    download: Optional[Download] = Relationship(back_populates="url_entries")


class RuntimeSetting(SQLModel, table=True):
    """Stores runtime configuration overrides that can be changed via the API."""

    key: str = Field(primary_key=True, max_length=100)
    value: str = Field(nullable=True)
