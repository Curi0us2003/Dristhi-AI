"""Database engine and sessions. The engine is created lazily, so the backend still starts
(and serves cameras) when DATABASE_URL is not set."""
import os
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from dristhi import config
from dristhi.errors import ApiError


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
SessionLocal: sessionmaker[Session] | None = None


def init_engine(url: str | None = None) -> Engine | None:
    """Create the engine from `url` or DATABASE_URL. Returns None when no URL is configured."""
    global _engine, SessionLocal
    url = url or config.database_url()
    if not url:
        return None
    if _engine is not None:
        _engine.dispose()
    # Cloud SQL allows ~25 connections in all (Cloud Run + local dev + tests), so keep each
    # backend's pool small: requests that wait for a connection beat a refused database.
    _engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
        max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "5")),
        pool_timeout=10,
    )
    SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def reset_engine() -> None:
    """Forget the engine (tests use this to simulate a backend without a database)."""
    global _engine, SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine, SessionLocal = None, None


def get_engine() -> Engine | None:
    return _engine if _engine is not None else init_engine()


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request. 503 when no database is configured."""
    if get_engine() is None:
        raise ApiError(503, "database_not_configured", "The database is not configured on this server.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
