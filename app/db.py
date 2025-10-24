from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import make_url
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

DATABASE_URL = str(settings.database_url)
url = make_url(DATABASE_URL)

connect_args = {}
if url.drivername.startswith("sqlite"):
    database_path = Path(url.database or "")
    if not database_path.is_absolute():
        database_path = (Path.cwd() / database_path).resolve()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    """Create database tables if they do not exist."""
    import app.models.entities  # noqa: F401  (ensure models are registered)

    SQLModel.metadata.create_all(engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    """Provide a transactional scope around a series of operations."""
    with Session(engine) as session:
        yield session
