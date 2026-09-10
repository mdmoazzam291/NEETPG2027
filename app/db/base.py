"""SQLAlchemy declarative base and common timestamp helpers."""
from datetime import datetime, timezone
from sqlalchemy.orm import DeclarativeBase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass
