"""Anonymous attendee join (task 07a). These and /api/health are the only unauthenticated routes.

One QR code per event opens /join?e=<slug>; each device gets the next number ("Attendee 12").
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.models import Attendee, Event

router = APIRouter(prefix="/api", tags=["attendees"])


class JoinRequest(BaseModel):
    device_id: uuid.UUID  # random UUID kept in the browser's localStorage; anything else → 422


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
    event: EventSummary


def _out(attendee: Attendee, event: Event) -> AttendeeOut:
    return AttendeeOut(
        attendee_id=attendee.id,
        number=attendee.number,
        display_name=attendee.display_name,
        event=EventSummary(
            slug=event.slug, name=event.name, venue=event.venue, city=event.city, starts_at=event.starts_at
        ),
    )


def _event_not_found() -> ApiError:
    # Same answer for an unknown slug and an event that isn't live, so the QR link leaks nothing.
    return ApiError(404, "event_not_found", "This event is not open for joining.")


def _find_attendee(db: Session, event_id: uuid.UUID, device_id: uuid.UUID) -> Attendee | None:
    return db.scalar(select(Attendee).where(Attendee.event_id == event_id, Attendee.device_id == device_id))


@router.post("/events/{slug}/join", response_model=AttendeeOut)
def join_event(slug: str, body: JoinRequest, db: Session = Depends(get_db)) -> AttendeeOut:
    event = db.scalar(select(Event).where(Event.slug == slug))
    if event is None or event.status != "live":
        raise _event_not_found()

    existing = _find_attendee(db, event.id, body.device_id)
    if existing is not None:
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

    attendee = Attendee(event_id=event.id, number=number, device_id=body.device_id)
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
        return _out(existing, event)
    return _out(attendee, event)


@router.get("/attendees/{attendee_id}", response_model=AttendeeOut)
def get_attendee(attendee_id: uuid.UUID, db: Session = Depends(get_db)) -> AttendeeOut:
    attendee = db.get(Attendee, attendee_id)
    if attendee is None:
        raise ApiError(404, "attendee_not_found", "No attendee with this id.")
    return _out(attendee, attendee.event)
