"""Settings read from environment variables (and backend/.env for local runs)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Real environment variables win over backend/.env (Cloud Run sets them directly).
load_dotenv(BACKEND_DIR / ".env", override=False)


def database_url() -> str | None:
    """SQLAlchemy URL, e.g. postgresql+psycopg://user:pass@127.0.0.1:5433/dristhi. None = no database."""
    return os.environ.get("DATABASE_URL") or None


def public_app_url() -> str:
    """Base URL of the frontend, used for the event QR link /join?e=<slug>."""
    return os.environ.get("PUBLIC_APP_URL", "http://localhost:9002").rstrip("/")
