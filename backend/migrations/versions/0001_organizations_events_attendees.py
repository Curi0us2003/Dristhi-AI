"""Organizations, events and attendees (task 07a).

Never edit this migration once it is merged; add a new one instead.

Revision ID: 0001
Revises:
Create Date: 2026-11-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("venue", sa.String(200)),
        sa.Column("city", sa.String(100)),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("attendee_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'live', 'ended')", name="ck_events_status"),
    )
    op.create_index("ix_events_organization_id", "events", ["organization_id"])
    op.create_table(
        "attendees",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_id", sa.Uuid(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200)),
        sa.Column("phone", sa.String(32)),
        sa.Column("email", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("event_id", "number", name="uq_attendees_event_number"),
        sa.UniqueConstraint("event_id", "device_id", name="uq_attendees_event_device"),
    )
    op.create_index("ix_attendees_event_id", "attendees", ["event_id"])


def downgrade() -> None:
    op.drop_table("attendees")
    op.drop_table("events")
    op.drop_table("organizations")
