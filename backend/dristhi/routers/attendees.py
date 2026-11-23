"""Anonymous attendee join (task 07a). These and /api/health are the only unauthenticated routes.

One QR code per event opens /join?e=<slug>; each device gets the next number ("Attendee 12") and
gives a name and mobile number, so staff sent to help can call them. The name and number are only
returned to the device that joined (X-Device-Id header) and to the event's admins with reports.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from dristhi.contact import clean_name, clean_phone
from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.models import Attendee, Event
from dristhi.routers.reports import device_attendee

router = APIRouter(prefix="/api", tags=["attendees"])


class JoinRequest(BaseModel):
    device_id: uuid.UUID  # random UUID kept in the browser's localStorage; anything else → 422
    # Optional so older app versions can still join; the current app always sends both.
    name: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=32)


class DetailsIn(BaseModel):
    name: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=32)


class EventSummary(BaseModel):
    slug: str
    name: str
    venue: str | None
    city: str | None
    starts_at: datetime | None


class AttendeeOut(BaseModel):
    attendee_id: uuid.UUID
    number: int
    display_name: str
    name: str | None = None
    phone: str | None = None
    event: EventSummary


def _out(attendee: Attendee, event: Event, private: bool = True) -> AttendeeOut:
    """private=False is for callers that have not proved they are this device: no name or phone."""
    return AttendeeOut(
        attendee_id=attendee.id,
        number=attendee.number,
        display_name=attendee.display_name if private else f"Attendee {attendee.number}",
        name=attendee.name if private else None,
        phone=attendee.phone if private else None,
        event=EventSummary(
            slug=event.slug, name=event.name, venue=event.venue, city=event.city, starts_at=event.starts_at
        ),
    )


def _event_not_found() -> ApiError:
    # Same answer for an unknown slug and an event that isn't live, so the QR link leaks nothing.
    return ApiError(404, "event_not_found", "This event is not open for joining.")


def _details(body) -> dict:
    """The fields the caller sent, checked and tidied. Fields left out are not changed."""
    values = {}
    if body.name is not None:
        values["name"] = clean_name(body.name)
    if body.phone is not None:
        values["phone"] = clean_phone(body.phone)
    return values


def _apply(db: Session, attendee: Attendee, values: dict) -> None:
    if values:
        for key, value in values.items():
            setattr(attendee, key, value)
        db.commit()


def _find_attendee(db: Session, event_id: uuid.UUID, device_id: uuid.UUID) -> Attendee | None:
    return db.scalar(select(Attendee).where(Attendee.event_id == event_id, Attendee.device_id == device_id))


@router.post("/events/{slug}/join", response_model=AttendeeOut)
def join_event(slug: str, body: JoinRequest, db: Session = Depends(get_db)) -> AttendeeOut:
    event = db.scalar(select(Event).where(Event.slug == slug))
    if event is None or event.status != "live":
        raise _event_not_found()
    values = _details(body)

    existing = _find_attendee(db, event.id, body.device_id)
    if existing is not None:
        _apply(db, existing, values)
        return _out(existing, event)

    # The row lock taken by this UPDATE makes concurrent joins queue up, so each gets its own
    # number; the status condition guards against the event ending between the two statements.
    number = db.scalar(
        update(Event)
        .where(Event.id == event.id, Event.status == "live")
        .values(attendee_count=Event.attendee_count + 1)
        .returning(Event.attendee_count)
    )
    if number is None:
        db.rollback()
        raise _event_not_found()

    attendee = Attendee(event_id=event.id, number=number, device_id=body.device_id, **values)
    db.add(attendee)
    try:
        db.commit()
    except IntegrityError:
        # The same device joined twice at once: the other request won. Rolling back also undoes
        # our counter increment, so no number is skipped.
        db.rollback()
        existing = _find_attendee(db, event.id, body.device_id)
        if existing is None:
            raise
        _apply(db, existing, values)
        return _out(existing, event)
    return _out(attendee, event)


@router.get("/attendees/{attendee_id}", response_model=AttendeeOut)
def get_attendee(
    attendee_id: uuid.UUID, x_device_id: uuid.UUID | None = Header(None), db: Session = Depends(get_db)
) -> AttendeeOut:
    attendee = db.get(Attendee, attendee_id)
    if attendee is None:
        raise ApiError(404, "attendee_not_found", "No attendee with this id.")
    return _out(attendee, attendee.event, private=x_device_id == attendee.device_id)


@router.patch("/attendees/{attendee_id}", response_model=AttendeeOut)
def update_details(
    body: DetailsIn, attendee: Attendee = Depends(device_attendee), db: Session = Depends(get_db)
) -> AttendeeOut:
    """The attendee corrects their name or number (needs the X-Device-Id header)."""
    _apply(db, attendee, _details(body))
    return _out(attendee, attendee.event)
