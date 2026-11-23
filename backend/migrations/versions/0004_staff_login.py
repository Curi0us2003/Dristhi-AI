"""Staff app sign-in: a login code per staff member and the hash of their current session token.

Existing staff get a code here; new staff get one when they are added.
Never edit this migration once it is merged; add a new one instead.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-24
"""
import secrets

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

# Same alphabet as dristhi.staff_auth.CODE_ALPHABET (no 0/O, 1/I/L).
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def upgrade() -> None:
    op.add_column("staff", sa.Column("login_code", sa.String(16)))
    op.add_column("staff", sa.Column("session_hash", sa.String(64)))

    conn = op.get_bind()
    taken: set[tuple] = set()
    for staff_id, event_id in conn.execute(sa.text("SELECT id, event_id FROM staff")).all():
        while True:
            code = "".join(secrets.choice(_ALPHABET) for _ in range(6))
            if (event_id, code) not in taken:
                break
        taken.add((event_id, code))
        conn.execute(sa.text("UPDATE staff SET login_code = :c WHERE id = :i"), {"c": code, "i": staff_id})

    op.create_unique_constraint("uq_staff_event_login_code", "staff", ["event_id", "login_code"])
    op.create_index("ix_staff_session_hash", "staff", ["session_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_staff_session_hash", table_name="staff")
    op.drop_constraint("uq_staff_event_login_code", "staff", type_="unique")
    op.drop_column("staff", "session_hash")
    op.drop_column("staff", "login_code")
