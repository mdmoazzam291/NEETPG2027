"""Minimal FastAPI entry point for the Phase 1 foundation."""
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import text

from app.config import get_settings
from app.db.session import create_database_engine, create_session_factory


def create_app() -> FastAPI:
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    app = FastAPI(title="NEETPG2027 Study Engine", version="0.1.0")
    app.state.engine = engine
    app.state.session_factory = session_factory

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return """<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>NEETPG2027</title><style>body{font-family:system-ui;margin:2rem;max-width:42rem;line-height:1.5}</style></head><body><h1>NEETPG2027 Study Engine</h1><p>Phase 1 database foundation is running.</p></body></html>"""

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
