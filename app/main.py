"""FastAPI entry point for the local NEETPG2027 study engine."""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import get_settings
from app.ai.api import router as ai_router
from app.db.session import create_database_engine, create_session_factory
from app.imports.api import router as imports_router
from app.media.api import router as media_router
from app.study.api import router as study_router
from app.taxonomy.api import router as taxonomy_router


def create_app() -> FastAPI:
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    app = FastAPI(title="NEETPG2027 Study Engine", version="0.5.0")
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Content-Type"],
        )
    static_dir = Path(__file__).resolve().parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    app.include_router(ai_router)
    app.include_router(imports_router)
    app.include_router(taxonomy_router)
    app.include_router(media_router)
    app.include_router(study_router)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.media_root = settings.media_root

    @app.get("/", response_class=FileResponse, include_in_schema=False)
    def index():
        return FileResponse(static_dir / "index.html")

    @app.get("/taxonomy", response_class=FileResponse, include_in_schema=False)
    def taxonomy():
        return FileResponse(static_dir / "taxonomy.html")

    @app.get("/media", response_class=FileResponse, include_in_schema=False)
    def media():
        return FileResponse(static_dir / "media.html")

    @app.get("/study", response_class=FileResponse, include_in_schema=False)
    def study():
        return FileResponse(static_dir / "study.html")

    @app.get("/health")
    def health() -> dict[str, str]:
        try:
            with session_factory() as session:
                session.execute(text("SELECT 1"))
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        return {"status": "ok", "database": "reachable"}

    return app


app = create_app()
