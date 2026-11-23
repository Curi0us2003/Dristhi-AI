"""SQLAlchemy models. Task 07a adds the first three tables of the data model in
docs/architecture.md; later tasks add the rest in new Alembic migrations."""
import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from dristhi.db import Base

EVENT_STATUSES = ("draft", "live", "ended")
POI_KINDS = ("washroom", "first_aid", "exit", "water", "lost_found", "cloak_room", "help_point", "stage")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'live', 'ended')", name="ck_events_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)  # used in the QR link /join?e=<slug>
    name: Mapped[str] = mapped_column(String(200))
    venue: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str | None] = mapped_column(String(100))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="draft", server_default="draft")
    # Last number handed out ("Attendee N"); incremented atomically on join.
    attendee_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Venue pin the admin registers (e.g. KTPO), WGS 84. Map views centre on it.
    location = mapped_column(Geometry("POINT", srid=4326, spatial_index=False))
    warning_pct: Mapped[int] = mapped_column(Integer, default=70, server_default="70")
    critical_pct: Mapped[int] = mapped_column(Integer, default=90, server_default="90")
    people_per_guard: Mapped[int] = mapped_column(Integer, default=100, server_default="100")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organization: Mapped[Organization] = relationship()


class Attendee(Base):
    __tablename__ = "attendees"
    __table_args__ = (
        UniqueConstraint("event_id", "number", name="uq_attendees_event_number"),
        UniqueConstraint("event_id", "device_id", name="uq_attendees_event_device"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    device_id: Mapped[uuid.UUID] = mapped_column()
    name: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped[Event] = relationship()

    @property
    def display_name(self) -> str:
        """The attendee's name, or "Attendee 12" if they joined without giving one."""
        return self.name or f"Attendee {self.number}"


class Zone(Base):
    """An area of the venue with its own capacity (task 06a). Polygon in WGS 84 (SRID 4326)."""

    __tablename__ = "zones"
    __table_args__ = (Index("ix_zones_polygon", "polygon", postgresql_using="gist"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    capacity: Mapped[int] = mapped_column(Integer)
    min_guards: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    # CCTV camera watching this zone: key in backend/feeds.json, e.g. feed_1.
    feed_id: Mapped[str | None] = mapped_column(String(64))
    # Outline on the venue map. Empty for zones an admin adds before drawing the map.
    polygon = mapped_column(Geometry("POLYGON", srid=4326, spatial_index=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Poi(Base):
    """A facility on the venue map: washroom, first aid, exit, ... (task 06a)."""

    __tablename__ = "pois"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('washroom', 'first_aid', 'exit', 'water', 'lost_found', 'cloak_room', 'help_point', 'stage')",
            name="ck_pois_kind",
        ),
        Index("ix_pois_location", "location", postgresql_using="gist"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    location = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())



# ── Admin app on Cloud SQL (replaces Firestore) ──────────────────────────────────────────
ADMIN_ROLES = ("owner", "operator")
STAFF_KINDS = ("guard", "supervisor", "medic", "doctor", "ambulance", "volunteer")
STAFF_STATUSES = ("available", "dispatched", "on_scene", "off_duty")
GRIEVANCE_STATUSES = ("new", "resolved")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Admin(Base):
    """A control-room user. Matched by email on first sign-in, then by firebase_uid."""

    __tablename__ = "admins"
    __table_args__ = (CheckConstraint(_in("role", ADMIN_ROLES), name="ck_admins_role"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    firebase_uid: Mapped[str | None] = mapped_column(String(128), unique=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    employee_id: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16), default="operator", server_default="operator")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Staff(Base):
    """Guards, supervisors, medics, doctors, ambulances and volunteers of one event.
    status: available (free), dispatched (on the way), on_scene (deployed), off_duty.
    zone_id / location say where they are posted or deployed. Ambulances use name for the vehicle number."""

    __tablename__ = "staff"
    __table_args__ = (
        CheckConstraint(_in("kind", STAFF_KINDS), name="ck_staff_kind"),
        CheckConstraint(_in("status", STAFF_STATUSES), name="ck_staff_status"),
        UniqueConstraint("event_id", "login_code", name="uq_staff_event_login_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="available", server_default="available")
    location = mapped_column(Geometry("POINT", srid=4326, spatial_index=False))
    # Staff app sign-in (dristhi/staff_auth.py): the code the admin hands out, and the SHA-256
    # of the current session token.
    login_code: Mapped[str | None] = mapped_column(String(16))
    session_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Grievance(Base):
    """A report from an attendee (medical, missing person, ...) handled by the control room."""

    __tablename__ = "grievances"
    __table_args__ = (CheckConstraint(_in("status", GRIEVANCE_STATUSES), name="ck_grievances_status"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    attendee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("attendees.id", ondelete="SET NULL"), index=True
    )
    type: Mapped[str] = mapped_column(String(64))  # "Medical Attention", "Missing Person", ...
    details: Mapped[str] = mapped_column(Text)
    submitted_by: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320))
    urgency: Mapped[str | None] = mapped_column(String(16))
    location_text: Mapped[str | None] = mapped_column(String(300))
    person_name: Mapped[str | None] = mapped_column(String(200))
    last_seen: Mapped[str | None] = mapped_column(String(300))
    photo_data_uri: Mapped[str | None] = mapped_column(Text)
    location = mapped_column(Geometry("POINT", srid=4326, spatial_index=False))
    accuracy_m: Mapped[float | None] = mapped_column()
    status: Mapped[str] = mapped_column(String(16), default="new", server_default="new")
    assigned_staff_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    assigned_staff_name: Mapped[str | None] = mapped_column(String(200))
    assigned_staff_kind: Mapped[str | None] = mapped_column(String(16))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    action_taken: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Dispatch(Base):
    """Log of one staff move: between zones, or to a grievance. Names are copied so the log
    still reads right after a zone or staff member is deleted."""

    __tablename__ = "dispatches"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    staff_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("staff.id", ondelete="SET NULL"))
    staff_name: Mapped[str] = mapped_column(String(200))
    from_zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    from_zone_name: Mapped[str | None] = mapped_column(String(200))
    to_zone_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("zones.id", ondelete="SET NULL"))
    to_zone_name: Mapped[str | None] = mapped_column(String(200))
    grievance_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("grievances.id", ondelete="SET NULL"))
    reason: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("admins.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    """A message from the control room to one attendee."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    attendee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("attendees.id", ondelete="CASCADE"), index=True)
    message: Mapped[str] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
