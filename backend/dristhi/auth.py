"""Who is calling: Firebase ID token → admin row in Cloud SQL (docs/architecture.md, "Roles").

Firebase is only the sign-in provider. Every admin, role and event lives in Postgres.
With FIREBASE_AUTH_EMULATOR_HOST set (local dev), firebase-admin accepts emulator tokens.
"""
import uuid

import firebase_admin
from fastapi import Depends, Header
from firebase_admin import auth as fb_auth
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dristhi import config
from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.models import Admin, Event


def _firebase_app() -> firebase_admin.App:
    try:
        return firebase_admin.get_app()
    except ValueError:
        project = config.firebase_project_id()
        if not project:
            raise ApiError(503, "auth_not_configured", "FIREBASE_PROJECT_ID is not set on this server.")
        return firebase_admin.initialize_app(options={"projectId": project})


def verify_token(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency: the decoded Firebase ID token (uid, email, ...). 401 when missing or bad."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "not_signed_in", "Sign in first.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        return fb_auth.verify_id_token(token, app=_firebase_app())
    except ApiError:
        raise
    except Exception:  # expired, revoked, wrong project, malformed
        raise ApiError(401, "invalid_token", "Your session has expired. Sign in again.")


def current_admin(claims: dict = Depends(verify_token), db: Session = Depends(get_db)) -> Admin:
    """The admin behind the token: by Firebase uid, else by email (then the uid is saved).

    Matching by email also re-links an admin whose Firebase account was recreated (or, locally,
    whose Auth emulator was restarted). Firebase allows one account per email address, and the
    admins table is what grants access, so the email is the identity that counts.
    """
    uid = claims.get("uid") or claims.get("sub")
    admin = db.scalar(select(Admin).where(Admin.firebase_uid == uid))
    if admin is None:
        email = (claims.get("email") or "").lower()
        admin = db.scalar(select(Admin).where(func.lower(Admin.email) == email)) if email else None
        if admin is None:
            raise ApiError(403, "not_an_admin", "This account is not a control-room admin.")
        admin.firebase_uid = uid
        db.commit()
    return admin


def admin_event(event_id: uuid.UUID, admin: Admin = Depends(current_admin), db: Session = Depends(get_db)) -> Event:
    """The event in the path, if it belongs to the admin's organization. Otherwise 404."""
    event = db.get(Event, event_id)
    if event is None or event.organization_id != admin.organization_id:
        raise ApiError(404, "event_not_found", "No such event.")
    return event
