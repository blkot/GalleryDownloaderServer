from fastapi import FastAPI

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
