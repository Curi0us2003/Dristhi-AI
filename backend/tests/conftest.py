"""Shared fixtures. Database tests need TEST_DATABASE_URL, a database the tests may wipe:

    TEST_DATABASE_URL=postgresql+psycopg://user:pass@127.0.0.1:5433/dristhi_test pytest -q

It must not be the real database: every table is dropped and recreated through the migrations.
"""
import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from dristhi import config, db
from dristhi.errors import register_error_handlers
from dristhi.routers import attendees, venue

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
TABLES = ("pois", "zones", "attendees", "events", "organizations")


def make_app() -> FastAPI:
    """Just the database routes, so tests don't load the crowd model or start camera threads."""
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(attendees.router)
    app.include_router(venue.router)
    return app


@pytest.fixture(scope="session")
def migrated_db():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL is not set: skipping database tests (see tests/conftest.py)")
    if TEST_DATABASE_URL == config.database_url():
        pytest.exit("TEST_DATABASE_URL must not be the same database as DATABASE_URL", returncode=2)

    engine = create_engine(TEST_DATABASE_URL)
    with engine.begin() as conn:
        for table in (*TABLES, "alembic_version"):
            conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
    engine.dispose()

    cfg = Config(str(config.BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(config.BACKEND_DIR / "migrations"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    command.upgrade(cfg, "head")

    yield
    db.reset_engine()


@pytest.fixture
def session(migrated_db):
    # Point the app at the test database for this test (a test may have reset the engine).
    engine = db.init_engine(TEST_DATABASE_URL)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {', '.join(TABLES)} CASCADE"))
    with db.SessionLocal() as s:
        yield s


@pytest.fixture
def client(session):
    return TestClient(make_app())
