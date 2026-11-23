"""Control-room API on Cloud SQL: sign-in check, events, zones, staff, dispatches, grievances
and notifications. Every route needs a Firebase ID token of an admin (dristhi/auth.py) and only
sees events of that admin's organization.
"""
import io
import re
import secrets
import uuid
from datetime import datetime
from typing import Literal
from urllib.parse import quote

import qrcode

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dristhi import config
from dristhi.auth import admin_event, current_admin
from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.routers.venue import venue_feature_collection
from dristhi.models import (
    EVENT_STATUSES,
    STAFF_KINDS,
    STAFF_STATUSES,
    Admin,
    Attendee,
    Dispatch,
    Event,
    Grievance,
    Notification,
    Staff,
    Zone,
)

router = APIRouter(prefix="/api", tags=["admin"])

EventStatus = Literal[EVENT_STATUSES]  # type: ignore[valid-type]
StaffKind = Literal[STAFF_KINDS]  # type: ignore[valid-type]
StaffStatus = Literal[STAFF_STATUSES]  # type: ignore[valid-type]
STAFF_LABELS = {"guard": "Security", "supervisor": "Supervisor", "medic": "Medical", "doctor": "Doctor",
                "ambulance": "Ambulance", "volunteer": "Volunteer"}


def point(lat: float, lng: float):
    return func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)


def _lat_lng(db: Session, geom) -> tuple[float | None, float | None]:
    if geom is None:
        return None, None
    lat, lng = db.execute(select(func.ST_Y(geom), func.ST_X(geom))).one()
    return lat, lng


# ── Sign-in ──────────────────────────────────────────────────────────────────────────────


class AdminOut(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    employee_id: str
    role: str


class AdminLogin(BaseModel):
    username: str
    employee_id: str


def _admin_out(admin: Admin) -> AdminOut:
    return AdminOut(
        id=admin.id, email=admin.email, username=admin.username, employee_id=admin.employee_id, role=admin.role
    )


@router.post("/auth/admin-login", response_model=AdminOut)
def admin_login(body: AdminLogin, admin: Admin = Depends(current_admin)) -> AdminOut:
    """Second check at the login form: username and employee ID must match the signed-in admin."""
    if body.username.strip() != admin.username or body.employee_id.strip() != admin.employee_id:
        raise ApiError(403, "admin_not_found", "Invalid admin credentials. Check username and employee ID.")
    return _admin_out(admin)


@router.get("/auth/me", response_model=AdminOut)
def me(admin: Admin = Depends(current_admin)) -> AdminOut:
    return _admin_out(admin)


# ── Events ───────────────────────────────────────────────────────────────────────────────


class EventIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    venue: str | None = None
    city: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: EventStatus = "draft"
    warning_pct: int = Field(70, ge=1, le=100)
    critical_pct: int = Field(90, ge=1, le=100)
    people_per_guard: int = Field(100, ge=1)
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)


class EventPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    venue: str | None = None
    city: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: EventStatus | None = None
    warning_pct: int | None = Field(None, ge=1, le=100)
    critical_pct: int | None = Field(None, ge=1, le=100)
    people_per_guard: int | None = Field(None, ge=1)
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)


class EventOut(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    venue: str | None
    city: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    status: str
    warning_pct: int
    critical_pct: int
    people_per_guard: int
    attendee_count: int
    lat: float | None
    lng: float | None
    join_url: str  # what the attendee QR code opens


def join_url(slug: str) -> str:
    """Attendee link for the event QR code; base is PUBLIC_APP_URL (the attendee site)."""
    return f"{config.public_app_url()}/join?e={quote(slug)}"


def _event_out(db: Session, event: Event) -> EventOut:
    lat, lng = _lat_lng(db, event.location)
    return EventOut(
        id=event.id, slug=event.slug, name=event.name, venue=event.venue, city=event.city,
        starts_at=event.starts_at, ends_at=event.ends_at, status=event.status,
        warning_pct=event.warning_pct, critical_pct=event.critical_pct,
        people_per_guard=event.people_per_guard, attendee_count=event.attendee_count, lat=lat, lng=lng,
        join_url=join_url(event.slug),
    )


def _new_slug(db: Session, name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "event"
    while True:
        slug = f"{base}-{secrets.token_hex(3)}"
        if db.scalar(select(Event.id).where(Event.slug == slug)) is None:
            return slug


def _apply_location(event_or_staff, values: dict) -> None:
    lat, lng = values.pop("lat", None), values.pop("lng", None)
    if lat is not None and lng is not None:
        event_or_staff.location = point(lat, lng)


@router.get("/events", response_model=list[EventOut])
def list_events(admin: Admin = Depends(current_admin), db: Session = Depends(get_db)) -> list[EventOut]:
    events = db.scalars(select(Event).where(Event.organization_id == admin.organization_id).order_by(Event.name))
    return [_event_out(db, e) for e in events]


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(body: EventIn, admin: Admin = Depends(current_admin), db: Session = Depends(get_db)) -> EventOut:
    values = body.model_dump()
    event = Event(organization_id=admin.organization_id, slug=_new_slug(db, body.name))
    _apply_location(event, values)
    for key, value in values.items():
        setattr(event, key, value)
    db.add(event)
    db.commit()
    db.refresh(event)
    return _event_out(db, event)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(body: EventPatch, event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> EventOut:
    values = body.model_dump(exclude_unset=True)
    _apply_location(event, values)
    for key, value in values.items():
        if key == "name" and value is None:
            continue
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return _event_out(db, event)


@router.get("/events/{event_id}/venue-map")
def admin_venue_map(event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> dict:
    """Same zones and facilities as the attendee map, for any status (draft events too)."""
    return venue_feature_collection(db, event)


# ── Zones ────────────────────────────────────────────────────────────────────────────────


class ZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1)
    min_guards: int = Field(1, ge=0)
    feed_id: str | None = None


class ZonePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    capacity: int | None = Field(None, ge=1)
    min_guards: int | None = Field(None, ge=0)
    feed_id: str | None = None


class ZoneOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    capacity: int
    min_guards: int
    feed_id: str | None
    has_outline: bool


def _zone_out(z: Zone) -> ZoneOut:
    return ZoneOut(
        id=z.id, event_id=z.event_id, name=z.name, capacity=z.capacity, min_guards=z.min_guards,
        feed_id=z.feed_id, has_outline=z.polygon is not None,
    )


def _zone(db: Session, event: Event, zone_id: uuid.UUID) -> Zone:
    zone = db.get(Zone, zone_id)
    if zone is None or zone.event_id != event.id:
        raise ApiError(404, "zone_not_found", "No such zone in this event.")
    return zone


@router.get(
    "/events/{event_id}/qr.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}, "description": "The attendee QR code"}},
)
def event_qr(
    size: int = Query(10, ge=2, le=40, description="pixels per QR module"),
    event: Event = Depends(admin_event),
) -> Response:
    """The one QR code attendees scan at the venue: opens /join?e=<slug> on the attendee site."""
    image = qrcode.make(join_url(event.slug), box_size=size, border=2)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f'inline; filename="event-{event.slug}-qr.png"',
        },
    )


@router.get("/events/{event_id}/zones", response_model=list[ZoneOut])
def list_zones(event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> list[ZoneOut]:
    return [_zone_out(z) for z in db.scalars(select(Zone).where(Zone.event_id == event.id).order_by(Zone.name))]


@router.post("/events/{event_id}/zones", response_model=ZoneOut, status_code=201)
def create_zone(body: ZoneIn, event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> ZoneOut:
    zone = Zone(event_id=event.id, **body.model_dump())
    db.add(zone)
    db.commit()
    return _zone_out(zone)


@router.patch("/events/{event_id}/zones/{zone_id}", response_model=ZoneOut)
def update_zone(
    zone_id: uuid.UUID, body: ZonePatch, event: Event = Depends(admin_event), db: Session = Depends(get_db)
) -> ZoneOut:
    zone = _zone(db, event, zone_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is None and key != "feed_id":
            continue
        setattr(zone, key, value)
    db.commit()
    return _zone_out(zone)


@router.delete("/events/{event_id}/zones/{zone_id}", status_code=204)
def delete_zone(zone_id: uuid.UUID, event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> Response:
    """Staff posted in the zone become unassigned (zone_id is ON DELETE SET NULL)."""
    db.delete(_zone(db, event, zone_id))
    db.commit()
    return Response(status_code=204)


# ── Staff ────────────────────────────────────────────────────────────────────────────────


class StaffIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str | None = None
    kind: StaffKind
    status: StaffStatus = "available"
    zone_id: uuid.UUID | None = None


class StaffPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    phone: str | None = None
    kind: StaffKind | None = None
    status: StaffStatus | None = None
    zone_id: uuid.UUID | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)


class StaffOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    phone: str | None
    kind: str
    status: str
    zone_id: uuid.UUID | None
    lat: float | None
    lng: float | None
    updated_at: datetime


def _staff_out(db: Session, s: Staff) -> StaffOut:
    lat, lng = _lat_lng(db, s.location)
    return StaffOut(
        id=s.id, event_id=s.event_id, name=s.name, phone=s.phone, kind=s.kind, status=s.status,
        zone_id=s.zone_id, lat=lat, lng=lng, updated_at=s.updated_at,
    )


def _staff(db: Session, event: Event, staff_id: uuid.UUID) -> Staff:
    staff = db.get(Staff, staff_id)
    if staff is None or staff.event_id != event.id:
        raise ApiError(404, "staff_not_found", "No such staff member in this event.")
    return staff


def _check_zone(db: Session, event: Event, zone_id: uuid.UUID | None) -> None:
    if zone_id is not None:
        _zone(db, event, zone_id)


@router.get("/events/{event_id}/staff", response_model=list[StaffOut])
def list_staff(event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> list[StaffOut]:
    rows = db.scalars(select(Staff).where(Staff.event_id == event.id).order_by(Staff.name))
    return [_staff_out(db, s) for s in rows]


@router.post("/events/{event_id}/staff", response_model=list[StaffOut], status_code=201)
def create_staff(
    body: list[StaffIn], event: Event = Depends(admin_event), db: Session = Depends(get_db)
) -> list[StaffOut]:
    """Adds one or many staff members (the roster CSV import sends many)."""
    if not body:
        raise ApiError(422, "empty", "Send at least one staff member.")
    rows = []
    for item in body:
        _check_zone(db, event, item.zone_id)
        rows.append(Staff(event_id=event.id, **item.model_dump()))
    db.add_all(rows)
    db.commit()
    return [_staff_out(db, s) for s in rows]


@router.patch("/events/{event_id}/staff/{staff_id}", response_model=StaffOut)
def update_staff(
    staff_id: uuid.UUID, body: StaffPatch, event: Event = Depends(admin_event), db: Session = Depends(get_db)
) -> StaffOut:
    staff = _staff(db, event, staff_id)
    values = body.model_dump(exclude_unset=True)
    if "zone_id" in values:
        _check_zone(db, event, values["zone_id"])
    _apply_location(staff, values)
    for key, value in values.items():
        if value is None and key not in ("zone_id", "phone"):
            continue
        setattr(staff, key, value)
    db.commit()
    db.refresh(staff)
    return _staff_out(db, staff)


@router.delete("/events/{event_id}/staff/{staff_id}", status_code=204)
def delete_staff(
    staff_id: uuid.UUID, event: Event = Depends(admin_event), db: Session = Depends(get_db)
) -> Response:
    db.delete(_staff(db, event, staff_id))
    db.commit()
    return Response(status_code=204)


# ── Dispatches ───────────────────────────────────────────────────────────────────────────


class DispatchOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    staff_id: uuid.UUID | None
    staff_name: str
    from_zone_id: uuid.UUID | None
    from_zone_name: str | None
    to_zone_id: uuid.UUID | None
    to_zone_name: str | None
    grievance_id: uuid.UUID | None
    reason: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Move(BaseModel):
    staff_id: uuid.UUID
    to_zone_id: uuid.UUID


class MovesIn(BaseModel):
    moves: list[Move] = Field(min_length=1)
    reason: str = Field(min_length=1)


@router.get("/events/{event_id}/dispatches", response_model=list[DispatchOut])
def list_dispatches(event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> list[Dispatch]:
    return list(
        db.scalars(
            select(Dispatch).where(Dispatch.event_id == event.id).order_by(Dispatch.created_at.desc()).limit(20)
        )
    )


@router.post("/events/{event_id}/dispatches/moves", response_model=list[DispatchOut], status_code=201)
def approve_moves(
    body: MovesIn,
    event: Event = Depends(admin_event),
    admin: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
) -> list[Dispatch]:
    """Moves staff between zones in one transaction and logs each move."""
    logged = []
    for move in body.moves:
        staff = _staff(db, event, move.staff_id)
        to_zone = _zone(db, event, move.to_zone_id)
        from_zone = db.get(Zone, staff.zone_id) if staff.zone_id else None
        staff.zone_id, staff.status = to_zone.id, "dispatched"
        logged.append(Dispatch(
            event_id=event.id, staff_id=staff.id, staff_name=staff.name,
            from_zone_id=from_zone.id if from_zone else None, from_zone_name=from_zone.name if from_zone else None,
            to_zone_id=to_zone.id, to_zone_name=to_zone.name, reason=body.reason, created_by=admin.id,
        ))
    db.add_all(logged)
    db.commit()
    return logged


# ── Grievances ───────────────────────────────────────────────────────────────────────────


class Coords(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float | None = None


class GrievanceOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    attendee_id: uuid.UUID | None
    type: str
    details: str
    submitted_by: str | None
    # Read from the attendee and staff records, so an admin (or the attendee, for their own
    # report) always sees the current number.
    attendee_name: str | None = None
    attendee_phone: str | None = None
    email: str | None
    urgency: str | None
    location_text: str | None
    person_name: str | None
    last_seen: str | None
    photo_data_uri: str | None
    coords: Coords | None
    status: str
    assigned_staff_id: uuid.UUID | None
    assigned_staff_name: str | None
    assigned_staff_kind: str | None
    assigned_staff_phone: str | None = None
    assigned_at: datetime | None
    action_taken: str | None
    resolved_at: datetime | None
    submitted_at: datetime


def grievance_out(db: Session, g: Grievance) -> GrievanceOut:
    lat, lng = _lat_lng(db, g.location)
    attendee = db.get(Attendee, g.attendee_id) if g.attendee_id else None
    staff = db.get(Staff, g.assigned_staff_id) if g.assigned_staff_id else None
    return GrievanceOut(
        id=g.id, event_id=g.event_id, attendee_id=g.attendee_id, type=g.type, details=g.details,
        submitted_by=g.submitted_by, attendee_name=attendee.name if attendee else None,
        attendee_phone=attendee.phone if attendee else None, assigned_staff_phone=staff.phone if staff else None,
        email=g.email, urgency=g.urgency, location_text=g.location_text,
        person_name=g.person_name, last_seen=g.last_seen, photo_data_uri=g.photo_data_uri,
        coords=Coords(lat=lat, lng=lng, accuracy_m=g.accuracy_m) if lat is not None else None,
        status=g.status, assigned_staff_id=g.assigned_staff_id, assigned_staff_name=g.assigned_staff_name,
        assigned_staff_kind=g.assigned_staff_kind, assigned_at=g.assigned_at, action_taken=g.action_taken,
        resolved_at=g.resolved_at, submitted_at=g.submitted_at,
    )


def _grievance(db: Session, event: Event, grievance_id: uuid.UUID) -> Grievance:
    g = db.get(Grievance, grievance_id)
    if g is None or g.event_id != event.id:
        raise ApiError(404, "grievance_not_found", "No such report in this event.")
    return g


class GrievanceResolve(BaseModel):
    action_taken: str = Field(min_length=1)


class AssignIn(BaseModel):
    staff_id: uuid.UUID
    reason: str = Field(min_length=1)


@router.get("/events/{event_id}/grievances", response_model=list[GrievanceOut])
def list_grievances(
    status: Literal["new", "resolved"] | None = None,
    event: Event = Depends(admin_event),
    db: Session = Depends(get_db),
) -> list[GrievanceOut]:
    query = select(Grievance).where(Grievance.event_id == event.id)
    if status:
        query = query.where(Grievance.status == status)
    return [grievance_out(db, g) for g in db.scalars(query.order_by(Grievance.submitted_at.desc()))]


@router.post("/events/{event_id}/grievances/{grievance_id}/resolve", response_model=GrievanceOut)
def resolve_grievance(
    grievance_id: uuid.UUID, body: GrievanceResolve, event: Event = Depends(admin_event),
    db: Session = Depends(get_db),
) -> GrievanceOut:
    g = _grievance(db, event, grievance_id)
    g.status, g.action_taken, g.resolved_at = "resolved", body.action_taken, func.now()
    db.commit()
    db.refresh(g)
    return grievance_out(db, g)


@router.delete("/events/{event_id}/grievances/{grievance_id}", status_code=204)
def delete_grievance(
    grievance_id: uuid.UUID, event: Event = Depends(admin_event), db: Session = Depends(get_db)
) -> Response:
    db.delete(_grievance(db, event, grievance_id))
    db.commit()
    return Response(status_code=204)


@router.post("/events/{event_id}/grievances/{grievance_id}/assign", response_model=GrievanceOut)
def assign_grievance(
    grievance_id: uuid.UUID,
    body: AssignIn,
    event: Event = Depends(admin_event),
    admin: Admin = Depends(current_admin),
    db: Session = Depends(get_db),
) -> GrievanceOut:
    """Sends a staff member to a report: report assigned, staff on scene, move logged."""
    g = _grievance(db, event, grievance_id)
    staff = _staff(db, event, body.staff_id)
    g.assigned_staff_id, g.assigned_staff_name, g.assigned_staff_kind = staff.id, staff.name, staff.kind
    g.assigned_at = func.now()
    from_zone = db.get(Zone, staff.zone_id) if staff.zone_id else None
    staff.status = "on_scene"
    db.add(Dispatch(
        event_id=event.id, staff_id=staff.id, staff_name=staff.name,
        from_zone_id=from_zone.id if from_zone else None, from_zone_name=from_zone.name if from_zone else None,
        grievance_id=g.id, reason=body.reason, created_by=admin.id,
    ))
    if g.attendee_id:
        call = f" Call {staff.phone}." if staff.phone else ""
        db.add(Notification(
            event_id=event.id, attendee_id=g.attendee_id,
            message=f"{staff.name} ({STAFF_LABELS.get(staff.kind, staff.kind)}) is on the way to help you.{call}",
        ))
    db.commit()
    db.refresh(g)
    return grievance_out(db, g)


# ── Notifications to attendees ───────────────────────────────────────────────────────────


class NotifyIn(BaseModel):
    attendee_id: uuid.UUID
    message: str = Field(min_length=1, max_length=1000)


@router.post("/events/{event_id}/notifications", status_code=201)
def notify_attendee(body: NotifyIn, event: Event = Depends(admin_event), db: Session = Depends(get_db)) -> dict:
    attendee = db.get(Attendee, body.attendee_id)
    if attendee is None or attendee.event_id != event.id:
        raise ApiError(404, "attendee_not_found", "No such attendee in this event.")
    n = Notification(event_id=event.id, attendee_id=attendee.id, message=body.message)
    db.add(n)
    db.commit()
    return {"id": str(n.id)}

