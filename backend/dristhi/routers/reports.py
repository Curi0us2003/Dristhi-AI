"""Attendee reports and notifications (no sign-in, task 07a).

An attendee proves who they are with the device id their browser joined with, sent in the
X-Device-Id header. They only ever see their own reports and notifications, plus open
missing-person alerts of their event.
"""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.models import Attendee, Event, Grievance, Notification, Staff
from dristhi.routers.admin import Coords, GrievanceOut, grievance_out, point

router = APIRouter(prefix="/api", tags=["reports"])

# What the attendee sees right after sending, per report type.
CONFIRMATIONS = {
    "Medical Attention": "Your medical request reached the control room. Stay where you are if you can.",
    "Missing Person": "Your report for {name} reached the control room. Staff have been alerted.",
}


def device_attendee(
    attendee_id: uuid.UUID, x_device_id: uuid.UUID = Header(), db: Session = Depends(get_db)
) -> Attendee:
    attendee = db.get(Attendee, attendee_id)
    if attendee is None or attendee.device_id != x_device_id:
        raise ApiError(404, "attendee_not_found", "No attendee with this id on this device.")
    return attendee


class ReportIn(BaseModel):
    type: Literal["Medical Attention", "Missing Person", "Lost & Found", "General"]
    details: str = Field(min_length=1, max_length=4000)
    urgency: str | None = Field(None, max_length=16)
    location_text: str | None = Field(None, max_length=300)
    person_name: str | None = Field(None, max_length=200)
    last_seen: str | None = Field(None, max_length=300)
    photo_data_uri: str | None = Field(None, max_length=3_000_000)
    coords: Coords | None = None


@router.post("/attendees/{attendee_id}/reports", response_model=GrievanceOut, status_code=201)
def send_report(
    body: ReportIn, attendee: Attendee = Depends(device_attendee), db: Session = Depends(get_db)
) -> GrievanceOut:
    g = Grievance(
        event_id=attendee.event_id, attendee_id=attendee.id, type=body.type, details=body.details,
        submitted_by=attendee.display_name, urgency=body.urgency, location_text=body.location_text,
        person_name=body.person_name, last_seen=body.last_seen, photo_data_uri=body.photo_data_uri,
    )
    if body.coords:
        g.location, g.accuracy_m = point(body.coords.lat, body.coords.lng), body.coords.accuracy_m
    db.add(g)
    message = CONFIRMATIONS.get(body.type)
    if message:
        db.add(Notification(
            event_id=attendee.event_id, attendee_id=attendee.id,
            message=message.format(name=body.person_name or "the missing person"),
        ))
    db.commit()
    db.refresh(g)
    return grievance_out(db, g)


@router.get("/attendees/{attendee_id}/reports", response_model=list[GrievanceOut])
def my_reports(attendee: Attendee = Depends(device_attendee), db: Session = Depends(get_db)) -> list[GrievanceOut]:
    rows = db.scalars(
        select(Grievance).where(Grievance.attendee_id == attendee.id).order_by(Grievance.submitted_at.desc())
    )
    return [grievance_out(db, g) for g in rows]


# What the control room sees in "Action taken" when the attendee closes their own report.
ATTENDEE_CLOSED = {
    "Missing Person": "Closed by the attendee: person found",
}


@router.post("/attendees/{attendee_id}/reports/{report_id}/resolve", response_model=GrievanceOut)
def resolve_my_report(
    report_id: uuid.UUID, attendee: Attendee = Depends(device_attendee), db: Session = Depends(get_db)
) -> GrievanceOut:
    """The attendee confirms they got help, which the control room cannot see for itself.

    Same effect as the admin's Mark resolved: the report closes, the staff member sent to it
    is free again and drops the assignment from the staff app, and a missing-person alert
    leaves every attendee's Home.
    """
    g = db.get(Grievance, report_id)
    if g is None or g.attendee_id != attendee.id:
        raise ApiError(404, "report_not_found", "No such report of yours.")
    if g.status != "resolved":
        staff = db.get(Staff, g.assigned_staff_id) if g.assigned_staff_id else None
        if staff is not None and staff.status in ("dispatched", "on_scene"):
            staff.status = "available"
        g.status, g.resolved_at = "resolved", func.now()
        g.action_taken = ATTENDEE_CLOSED.get(g.type) or (
            f"Closed by the attendee: help received from {g.assigned_staff_name}"
            if g.assigned_staff_name else "Closed by the attendee"
        )
        db.commit()
        db.refresh(g)
    return grievance_out(db, g)


class NotificationOut(BaseModel):
    id: uuid.UUID
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/attendees/{attendee_id}/notifications", response_model=list[NotificationOut])
def my_notifications(attendee: Attendee = Depends(device_attendee), db: Session = Depends(get_db)) -> list:
    """Unread notifications, newest first."""
    return list(db.scalars(
        select(Notification)
        .where(Notification.attendee_id == attendee.id, Notification.read_at.is_(None))
        .order_by(Notification.created_at.desc())
    ))


@router.post("/attendees/{attendee_id}/notifications/{notification_id}/read", status_code=204)
def mark_read(
    notification_id: uuid.UUID, attendee: Attendee = Depends(device_attendee), db: Session = Depends(get_db)
) -> Response:
    n = db.get(Notification, notification_id)
    if n is None or n.attendee_id != attendee.id:
        raise ApiError(404, "notification_not_found", "No such notification.")
    n.read_at = func.now()
    db.commit()
    return Response(status_code=204)


class MissingPersonOut(BaseModel):
    id: uuid.UUID
    person_name: str | None
    details: str
    last_seen: str | None
    photo_data_uri: str | None
    submitted_at: datetime

    model_config = {"from_attributes": True}


@router.get("/events/{slug}/missing-persons", response_model=list[MissingPersonOut])
def missing_persons(slug: str, db: Session = Depends(get_db)) -> list:
    """Open missing-person reports, shown to every attendee of the live event."""
    event = db.scalar(select(Event).where(Event.slug == slug))
    if event is None or event.status != "live":
        raise ApiError(404, "event_not_found", "This event is not open for joining.")
    return list(db.scalars(
        select(Grievance)
        .where(Grievance.event_id == event.id, Grievance.type == "Missing Person", Grievance.status == "new")
        .order_by(Grievance.submitted_at.desc())
    ))
