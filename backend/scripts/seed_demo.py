"""Create the demo organization and a live event with slug "demo". Safe to run again.

    python scripts/seed_demo.py [--slug demo] [--name "..."] [--venue "..."] [--city "..."]

Running it again keeps the existing event and its attendees; it only makes the event live again
and applies any of --name / --venue / --city you pass.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from dristhi import db  # noqa: E402
from dristhi.models import Event, Organization  # noqa: E402

ORG_NAME = "Dristhi Demo"
DEFAULTS = {"name": "Dristhi Demo Event", "venue": "Phoenix Marketcity", "city": "Bengaluru"}


def seed(session, slug="demo", name=None, venue=None, city=None) -> Event:
    org = session.scalar(select(Organization).where(Organization.name == ORG_NAME))
    if org is None:
        org = Organization(name=ORG_NAME)
        session.add(org)
        session.flush()

    event = session.scalar(select(Event).where(Event.slug == slug))
    if event is None:
        event = Event(
            organization_id=org.id,
            slug=slug,
            name=name or DEFAULTS["name"],
            venue=venue or DEFAULTS["venue"],
            city=city or DEFAULTS["city"],
            status="live",
        )
        session.add(event)
    else:
        event.status = "live"
        if name:
            event.name = name
        if venue:
            event.venue = venue
        if city:
            event.city = city
    session.commit()
    return event


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--slug", default="demo")
    parser.add_argument("--name")
    parser.add_argument("--venue")
    parser.add_argument("--city")
    args = parser.parse_args()

    if db.init_engine() is None:
        sys.exit("DATABASE_URL is not set (export it or put it in backend/.env).")
    with db.SessionLocal() as session:
        event = seed(session, args.slug, args.name, args.venue, args.city)
        print(f"Event '{event.name}' ({event.slug}) is live; {event.attendee_count} attendees so far.")


if __name__ == "__main__":
    main()
