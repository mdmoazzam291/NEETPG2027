"""Application configuration loaded from environment variables."""
from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    database_url: str


def get_settings() -> Settings:
    """Return local-development settings without embedding personal data paths."""
    default_path = Path("instance") / "neetpg2027.sqlite3"
    return Settings(database_url=os.getenv("NEETPG2027_DATABASE_URL", f"sqlite:///{default_path}"))
