from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _ensure_column(
    engine: Engine,
    table_name: str,
    column_name: str,
    sqlite_definition: str,
    generic_definition: str,
) -> None:
    inspector = inspect(engine)
    existing = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name in existing:
        return

    is_sqlite = engine.url.get_backend_name().startswith("sqlite")
    definition = sqlite_definition if is_sqlite else f"IF NOT EXISTS {generic_definition}"
    statement = text(f"ALTER TABLE {table_name} ADD COLUMN {definition}")
    with engine.begin() as connection:
        connection.execute(statement)


def run_migrations(engine: Engine) -> None:
    """Best-effort schema migrations for incremental releases."""
    _ensure_column(
        engine,
        "download",
        "media_indexed",
        "media_indexed INTEGER NOT NULL DEFAULT 0",
        "media_indexed BOOLEAN NOT NULL DEFAULT FALSE",
    )
    _ensure_column(
        engine,
        "download",
        "media_indexed_at",
        "media_indexed_at TIMESTAMP NULL",
        "media_indexed_at TIMESTAMP NULL",
    )

    _ensure_column(
        engine,
        "downloaditem",
        "media_type",
        "media_type TEXT NULL",
        "media_type VARCHAR(32) NULL",
    )
    _ensure_column(
        engine,
        "downloaditem",
        "thumbnail_path",
        "thumbnail_path TEXT NULL",
        "thumbnail_path TEXT NULL",
    )
    _ensure_column(
        engine,
        "downloaditem",
        "preview_path",
        "preview_path TEXT NULL",
        "preview_path TEXT NULL",
    )
    _ensure_column(
        engine,
        "downloaditem",
        "width",
        "width INTEGER NULL",
        "width INTEGER NULL",
    )
    _ensure_column(
        engine,
        "downloaditem",
        "height",
        "height INTEGER NULL",
        "height INTEGER NULL",
    )
    _ensure_column(
        engine,
        "downloaditem",
        "duration_seconds",
        "duration_seconds REAL NULL",
        "duration_seconds DOUBLE PRECISION NULL",
    )
    _ensure_column(
        engine,
        "downloaditem",
        "processed_at",
        "processed_at TIMESTAMP NULL",
        "processed_at TIMESTAMP NULL",
    )
