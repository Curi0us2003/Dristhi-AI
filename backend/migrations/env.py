"""Alembic environment: uses DATABASE_URL (env var or backend/.env) and the models' metadata."""
from alembic import context
from sqlalchemy import create_engine, pool

from dristhi import config as app_config
from dristhi import models  # noqa: F401  (registers the tables on Base.metadata)
from dristhi.db import Base

target_metadata = Base.metadata


def _url() -> str:
    url = context.config.attributes.get("database_url") or app_config.database_url()
    if not url:
        raise SystemExit("DATABASE_URL is not set (export it or put it in backend/.env).")
    return url


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
