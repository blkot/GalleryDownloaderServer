"""FastAPI routers for the Gallery Downloader service."""

from fastapi import APIRouter

from .downloads import router as downloads_router
from .settings import router as settings_router

api_router = APIRouter()
api_router.include_router(downloads_router, prefix="/downloads", tags=["downloads"])
api_router.include_router(settings_router)
