"""Application configuration loaded from environment variables."""
from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    database_url: str
    media_root: Path
    cors_origins: tuple[str, ...] = ()
    ai_timeout_seconds: float = 45.0
    openai_api_key: str | None = None
    openai_model: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    anthropic_api_key: str | None = None
    anthropic_model: str | None = None
    compatible_base_url: str | None = None
    compatible_api_key: str | None = None
    compatible_model: str | None = None


def get_settings() -> Settings:
    """Return local-development settings without embedding personal data paths."""
    instance = Path("instance")
    default_database = instance / "neetpg2027.sqlite3"
    default_media = instance / "media"
    cors_origins = tuple(
        origin.strip()
        for origin in os.getenv("NEETPG2027_CORS_ORIGINS", "").split(",")
        if origin.strip()
    )
    return Settings(
        database_url=os.getenv("NEETPG2027_DATABASE_URL", f"sqlite:///{default_database}"),
        media_root=Path(os.getenv("NEETPG2027_MEDIA_ROOT", str(default_media))),
        cors_origins=cors_origins,
        ai_timeout_seconds=float(os.getenv("NEETPG2027_AI_TIMEOUT_SECONDS", "45")),
        openai_api_key=os.getenv("NEETPG2027_OPENAI_API_KEY") or None,
        openai_model=os.getenv("NEETPG2027_OPENAI_MODEL") or None,
        gemini_api_key=os.getenv("NEETPG2027_GEMINI_API_KEY") or None,
        gemini_model=os.getenv("NEETPG2027_GEMINI_MODEL") or None,
        anthropic_api_key=os.getenv("NEETPG2027_ANTHROPIC_API_KEY") or None,
        anthropic_model=os.getenv("NEETPG2027_ANTHROPIC_MODEL") or None,
        compatible_base_url=os.getenv("NEETPG2027_OPENAI_COMPATIBLE_BASE_URL") or None,
        compatible_api_key=os.getenv("NEETPG2027_OPENAI_COMPATIBLE_API_KEY") or None,
        compatible_model=os.getenv("NEETPG2027_OPENAI_COMPATIBLE_MODEL") or None,
    )
