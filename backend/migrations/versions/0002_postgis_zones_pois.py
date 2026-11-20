"""PostGIS, zones and points of interest (task 06a).

Never edit this migration once it is merged; add a new one instead.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-20
"""
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

POI_KINDS = "'washroom', 'first_aid', 'exit', 'water', 'lost_found', 'cloak_room', 'help_point', 'stage'"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "zones",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_id", sa.Uuid(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("polygon", Geometry("POLYGON", srid=4326, spatial_index=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_zones_event_id", "zones", ["event_id"])
    op.create_index("ix_zones_polygon", "zones", ["polygon"], postgresql_using="gist")

    op.create_table(
        "pois",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("event_id", sa.Uuid(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("zone_id", sa.Uuid(), sa.ForeignKey("zones.id", ondelete="SET NULL")),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("location", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(f"kind IN ({POI_KINDS})", name="ck_pois_kind"),
    )
    op.create_index("ix_pois_event_id", "pois", ["event_id"])
    op.create_index("ix_pois_location", "pois", ["location"], postgresql_using="gist")


def downgrade() -> None:
    op.drop_table("pois")
    op.drop_table("zones")
    # The postgis extension is left installed: other databases objects may use it.
