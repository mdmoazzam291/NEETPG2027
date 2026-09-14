"""FastAPI entry point for the local NEETPG2027 study engine."""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.imports.api import router as imports_router
from app.taxonomy.api import router as taxonomy_router


def create_app() -> FastAPI:
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    app = FastAPI(title="NEETPG2027 Study Engine", version="0.2.0")
    static_dir = Path(__file__).resolve().parent / "static"
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    app.include_router(imports_router)
    app.include_router(taxonomy_router)
    app.state.engine = engine
    app.state.session_factory = session_factory

    @app.get("/", response_class=FileResponse, include_in_schema=False)
    def index():
        return FileResponse(static_dir / "index.html")

    @app.get("/taxonomy", response_class=FileResponse, include_in_schema=False)
    def taxonomy():
        return FileResponse(static_dir / "taxonomy.html")

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
