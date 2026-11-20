"""Create (or update) a control-room admin in Cloud SQL. Safe to run again.

    python scripts/create_admin.py --email you@example.com --username control --employee-id EMP001 [--role owner]

The admin belongs to the demo organization (scripts/seed_demo.py). firebase_uid stays empty until
the backend links it on first sign-in (task 04); until then the login page checks Firestore.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from dristhi import db  # noqa: E402
from dristhi.models import ADMIN_ROLES, Admin, Organization  # noqa: E402

ORG_NAME = "Dristhi Demo"


def create_admin(session, email, username, employee_id, role="owner") -> Admin:
    org = session.scalar(select(Organization).where(Organization.name == ORG_NAME))
    if org is None:
        org = Organization(name=ORG_NAME)
        session.add(org)
        session.flush()

    email = email.strip().lower()
    admin = session.scalar(select(Admin).where(Admin.email == email))
    if admin is None:
        admin = Admin(organization_id=org.id, email=email)
        session.add(admin)
    admin.username = username.strip()
    admin.employee_id = employee_id.strip()
    admin.role = role
    session.flush()
    return admin


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--employee-id", required=True)
    parser.add_argument("--role", choices=ADMIN_ROLES, default="owner")
    args = parser.parse_args()

    if db.init_engine() is None:
        sys.exit("DATABASE_URL is not set (see backend/.env.example).")
    with db.SessionLocal() as session:
        admin = create_admin(session, args.email, args.username, args.employee_id, args.role)
        session.commit()
        print(f"Admin {admin.username} ({admin.email}, {admin.role}) saved: {admin.id}")


if __name__ == "__main__":
    main()
