"""Staff app sign-in: staff name + 6-character login code from the admin, then a session token.

The token is random; only its SHA-256 is stored (staff.session_hash), so a database leak does not
hand out sessions. Signing in again (or the admin resetting the code) ends the previous session.
Failed sign-ins are limited per client address. The limit lives in process memory, which is fine
while the backend runs as one instance (CLAUDE.md).
"""
import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.models import Event, Staff

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L: easy to read out loud
CODE_LENGTH = 6
MAX_FAILURES = 10
FAILURE_WINDOW_S = 600

_failures: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def new_code(db: Session, event_id) -> str:
    taken = set(db.scalars(select(Staff.login_code).where(Staff.event_id == event_id)))
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if code not in taken:
            return code


def normalize_code(raw: str) -> str:
    return "".join(ch for ch in raw.upper() if ch.isalnum())


def normalize_name(raw: str) -> str:
    return " ".join(raw.split()).casefold()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def client_key(request: Request) -> str:
    # Cloud Run puts the caller's address first in X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def check_not_locked(key: str) -> None:
    now = time.monotonic()
    with _lock:
        recent = _failures[key]
        while recent and now - recent[0] > FAILURE_WINDOW_S:
            recent.popleft()
        if len(recent) >= MAX_FAILURES:
            raise ApiError(429, "too_many_attempts", "Too many wrong codes. Wait 10 minutes or ask the control room.")


def record_failure(key: str) -> None:
    with _lock:
        _failures[key].append(time.monotonic())


def reset_failures() -> None:
    """For tests."""
    with _lock:
        _failures.clear()


def start_session(staff: Staff) -> str:
    token = secrets.token_urlsafe(32)
    staff.session_hash = token_hash(token)
    return token


def current_staff(x_staff_token: str | None = Header(None), db: Session = Depends(get_db)) -> Staff:
    """FastAPI dependency: the staff member behind the X-Staff-Token header."""
    if not x_staff_token:
        raise ApiError(401, "not_signed_in", "Sign in first.")
    staff = db.scalar(select(Staff).where(Staff.session_hash == token_hash(x_staff_token)))
    if staff is None:
        raise ApiError(401, "session_ended", "You were signed out. Sign in again with your code.")
    event = db.get(Event, staff.event_id)
    if event is None or event.status == "ended":
        raise ApiError(401, "session_ended", "This event has ended.")
    return staff
