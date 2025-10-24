"""FastAPI routers for the Gallery Downloader service."""

from fastapi import APIRouter

from .downloads import router as downloads_router

api_router = APIRouter()
api_router.include_router(downloads_router, prefix="/downloads", tags=["downloads"])

