"""Staff app: guards and medical staff sign in with their name and login code and see one page:
where they are posted, the latest move the control room gave them, and the attendee they have
been sent to help (name, phone, zone).
"""
import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.models import Attendee, Dispatch, Event, Grievance, Staff, Zone
from dristhi.staff_auth import (
    check_not_locked,
    client_key,
    current_staff,
    normalize_code,
    normalize_name,
    record_failure,
    start_session,
)

router = APIRouter(prefix="/api/staff", tags=["staff app"])


class LoginIn(BaseModel):
    event: str = Field(min_length=1, max_length=64)  # event slug from the staff app link
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=1, max_length=32)


class ZoneRef(BaseModel):
    id: uuid.UUID
    name: str


class StaffMe(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    status: str
    event_slug: str
    event_name: str
    zone: ZoneRef | None


class MoveOut(BaseModel):
    id: uuid.UUID
    from_zone_name: str | None
    to_zone_name: str | None
    reason: str
    created_at: datetime


class AssignmentOut(BaseModel):
    id: uuid.UUID
    type: str
    details: str
    urgency: str | None
    attendee_name: str | None
    attendee_phone: str | None
    zone_name: str | None  # zone the attendee's reported position falls in
    location_text: str | None  # what the attendee typed or picked
    accuracy_m: float | None
    person_name: str | None  # missing-person reports
    last_seen: str | None
    submitted_at: datetime
    assigned_at: datetime | None


class FeedOut(BaseModel):
    staff: StaffMe
    move: MoveOut | None
    assignment: AssignmentOut | None


class LoginOut(FeedOut):
    token: str


def _feed(db: Session, staff: Staff) -> FeedOut:
    event = db.get(Event, staff.event_id)
    zone = db.get(Zone, staff.zone_id) if staff.zone_id else None
    move = db.scalar(
        select(Dispatch)
        .where(Dispatch.staff_id == staff.id, Dispatch.grievance_id.is_(None), Dispatch.to_zone_id.is_not(None))
        .order_by(Dispatch.created_at.desc())
        .limit(1)
    )
    g = db.scalar(
        select(Grievance)
        .where(Grievance.assigned_staff_id == staff.id, Grievance.status == "new")
        .order_by(Grievance.assigned_at.desc().nulls_last())
        .limit(1)
    )
    assignment = None
    if g is not None:
        attendee = db.get(Attendee, g.attendee_id) if g.attendee_id else None
        zone_name = None
        if g.location is not None:
            zone_name = db.scalar(
                select(Zone.name)
                .where(Zone.event_id == staff.event_id, Zone.polygon.is_not(None),
                       func.ST_Contains(Zone.polygon, g.location))
                .limit(1)
            )
        assignment = AssignmentOut(
            id=g.id, type=g.type, details=g.details, urgency=g.urgency,
            attendee_name=attendee.name if attendee else g.submitted_by,
            attendee_phone=attendee.phone if attendee else None,
            zone_name=zone_name, location_text=g.location_text, accuracy_m=g.accuracy_m,
            person_name=g.person_name, last_seen=g.last_seen, submitted_at=g.submitted_at, assigned_at=g.assigned_at,
        )
    return FeedOut(
        staff=StaffMe(
            id=staff.id, name=staff.name, kind=staff.kind, status=staff.status,
            event_slug=event.slug, event_name=event.name,
            zone=ZoneRef(id=zone.id, name=zone.name) if zone else None,
        ),
        move=MoveOut.model_validate(move, from_attributes=True) if move else None,
        assignment=assignment,
    )


@router.post("/login", response_model=LoginOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> LoginOut:
    key = client_key(request)
    check_not_locked(key)
    wrong = ApiError(401, "wrong_login", "That name and code don't match. Check the code with the control room.")

    event = db.scalar(select(Event).where(Event.slug == body.event.strip()))
    code = normalize_code(body.code)
    staff = None
    if event is not None and event.status != "ended" and code:
        staff = db.scalar(select(Staff).where(Staff.event_id == event.id, Staff.login_code == code))
    if staff is None or not secrets.compare_digest(
        normalize_name(staff.name).encode(), normalize_name(body.name).encode()
    ):
        record_failure(key)
        raise wrong

    token = start_session(staff)
    db.commit()
    return LoginOut(token=token, **_feed(db, staff).model_dump())


@router.get("/me", response_model=FeedOut)
def me(staff: Staff = Depends(current_staff), db: Session = Depends(get_db)) -> FeedOut:
    return _feed(db, staff)


@router.post("/logout", status_code=204)
def logout(staff: Staff = Depends(current_staff), db: Session = Depends(get_db)) -> Response:
    staff.session_hash = None
    db.commit()
    return Response(status_code=204)
