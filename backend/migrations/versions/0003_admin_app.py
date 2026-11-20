"""Admin app on Cloud SQL: venue location and thresholds, zone cameras, admins, staff,
grievances, dispatches and notifications (replaces the Firestore collections).

Never edit this migration once it is merged; add a new one instead.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-20
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _point():
    return Geometry("POINT", srid=4326, spatial_index=False)


def _created_at(name="created_at"):
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def _event_fk():
    return sa.Column("event_id", sa.Uuid(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    op.add_column("events", sa.Column("location", _point()))
    op.add_column("events", sa.Column("warning_pct", sa.Integer(), server_default="70", nullable=False))
    op.add_column("events", sa.Column("critical_pct", sa.Integer(), server_default="90", nullable=False))
    op.add_column("events", sa.Column("people_per_guard", sa.Integer(), server_default="100", nullable=False))

    op.add_column("zones", sa.Column("min_guards", sa.Integer(), server_default="1", nullable=False))
    op.add_column("zones", sa.Column("feed_id", sa.String(64)))
    op.alter_column("zones", "polygon", nullable=True)

    op.create_table(
        "admins",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("firebase_uid", sa.String(128), unique=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("employee_id", sa.String(64), nullable=False),
        sa.Column("role", sa.String(16), server_default="operator", nullable=False),
        _created_at(),
        sa.CheckConstraint("role IN ('owner', 'operator')", name="ck_admins_role"),
    )
    op.create_index("ix_admins_organization_id", "admins", ["organization_id"])

    op.create_table(
        "staff",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _event_fk(),
        sa.Column("zone_id", sa.Uuid(), sa.ForeignKey("zones.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(32)),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), server_default="available", nullable=False),
        sa.Column("location", _point()),
        _created_at("updated_at"),
        _created_at(),
        sa.CheckConstraint(
            "kind IN ('guard', 'supervisor', 'medic', 'doctor', 'ambulance', 'volunteer')", name="ck_staff_kind"
        ),
        sa.CheckConstraint(
            "status IN ('available', 'dispatched', 'on_scene', 'off_duty')", name="ck_staff_status"
        ),
    )
    op.create_index("ix_staff_event_id", "staff", ["event_id"])

    op.create_table(
        "grievances",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _event_fk(),
        sa.Column("attendee_id", sa.Uuid(), sa.ForeignKey("attendees.id", ondelete="SET NULL")),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("submitted_by", sa.String(200)),
        sa.Column("email", sa.String(320)),
        sa.Column("urgency", sa.String(16)),
        sa.Column("location_text", sa.String(300)),
        sa.Column("person_name", sa.String(200)),
        sa.Column("last_seen", sa.String(300)),
        sa.Column("photo_data_uri", sa.Text()),
        sa.Column("location", _point()),
        sa.Column("accuracy_m", sa.Float()),
        sa.Column("status", sa.String(16), server_default="new", nullable=False),
        sa.Column("assigned_staff_id", sa.Uuid(), sa.ForeignKey("staff.id", ondelete="SET NULL")),
        sa.Column("assigned_staff_name", sa.String(200)),
        sa.Column("assigned_staff_kind", sa.String(16)),
        sa.Column("assigned_at", sa.DateTime(timezone=True)),
        sa.Column("action_taken", sa.Text()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        _created_at("submitted_at"),
        sa.CheckConstraint("status IN ('new', 'resolved')", name="ck_grievances_status"),
    )
    op.create_index("ix_grievances_event_id", "grievances", ["event_id"])
    op.create_index("ix_grievances_attendee_id", "grievances", ["attendee_id"])

    op.create_table(
        "dispatches",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _event_fk(),
        sa.Column("staff_id", sa.Uuid(), sa.ForeignKey("staff.id", ondelete="SET NULL")),
        sa.Column("staff_name", sa.String(200), nullable=False),
        sa.Column("from_zone_id", sa.Uuid(), sa.ForeignKey("zones.id", ondelete="SET NULL")),
        sa.Column("from_zone_name", sa.String(200)),
        sa.Column("to_zone_id", sa.Uuid(), sa.ForeignKey("zones.id", ondelete="SET NULL")),
        sa.Column("to_zone_name", sa.String(200)),
        sa.Column("grievance_id", sa.Uuid(), sa.ForeignKey("grievances.id", ondelete="SET NULL")),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("admins.id", ondelete="SET NULL")),
        _created_at(),
    )
    op.create_index("ix_dispatches_event_id", "dispatches", ["event_id"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _event_fk(),
        sa.Column("attendee_id", sa.Uuid(), sa.ForeignKey("attendees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        _created_at(),
    )
    op.create_index("ix_notifications_event_id", "notifications", ["event_id"])
    op.create_index("ix_notifications_attendee_id", "notifications", ["attendee_id"])


def downgrade() -> None:
    for table in ("notifications", "dispatches", "grievances", "staff", "admins"):
        op.drop_table(table)
    op.execute("DELETE FROM zones WHERE polygon IS NULL")
    op.alter_column("zones", "polygon", nullable=False)
    op.drop_column("zones", "feed_id")
    op.drop_column("zones", "min_guards")
    for column in ("people_per_guard", "critical_pct", "warning_pct", "location"):
        op.drop_column("events", column)
