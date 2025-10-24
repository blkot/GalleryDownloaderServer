"""
Application package for the Gallery Downloader service.

Modules are organized to separate API, service orchestration, queue workers,
and persistence concerns so that individual layers can evolve independently.
"""

from .config import settings  # noqa: F401  (re-export for convenience)

