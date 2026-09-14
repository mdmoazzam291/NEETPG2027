"""Application configuration loaded from environment variables."""
from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    database_url: str
    media_root: Path


def get_settings() -> Settings:
    """Return local-development settings without embedding personal data paths."""
    instance = Path("instance")
    default_database = instance / "neetpg2027.sqlite3"
    default_media = instance / "media"
    return Settings(
        database_url=os.getenv("NEETPG2027_DATABASE_URL", f"sqlite:///{default_database}"),
        media_root=Path(os.getenv("NEETPG2027_MEDIA_ROOT", str(default_media))),
    )
