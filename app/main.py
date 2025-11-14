from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import api_router
from app.config import settings
from app.db import init_db

init_db()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Gallery Downloader Service",
        version="0.1.0",
        description="API gateway for queueing and tracking gallery-dl download jobs.",
    )

    @app.get("/healthz", tags=["health"])
    async def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api_router)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:8081",
            "http://localhost:8081",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    frontend_path = Path(__file__).resolve().parent.parent / "frontend"
    if frontend_path.exists():
        app.mount(
            "/ui",
            StaticFiles(directory=str(frontend_path), html=True),
            name="frontend",
        )

    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
        factory=False,
    )


if __name__ == "__main__":
    run()
