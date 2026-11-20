"""Create the demo organization and a live event with slug "demo". Safe to run again.

    python scripts/seed_demo.py [--slug demo] [--name "..."] [--venue "..."] [--city "..."] [--reset-venue]

Running it again keeps the existing event and its attendees; it only makes the event live again
and applies any of --name / --venue / --city you pass. The demo venue map (zones and facilities
from data/demo_venue.geojson) is loaded when the event has no zones yet; --reset-venue replaces it.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, func, select, text, update  # noqa: E402

from dristhi import db  # noqa: E402
from dristhi.models import Event, Organization, Poi, Zone  # noqa: E402

VENUE_FILE = Path(__file__).resolve().parent.parent / "data" / "demo_venue.geojson"

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


def _geom(feature) -> object:
    return func.ST_SetSRID(func.ST_GeomFromGeoJSON(json.dumps(feature["geometry"])), 4326)


def load_venue(session, event: Event, path: Path = VENUE_FILE, reset: bool = False) -> int:
    """Load zones and facilities for `event` from a GeoJSON file. Returns the number of zones added
    (0 when the event already has zones and `reset` is False)."""
    features = json.loads(path.read_text(encoding="utf-8"))["features"]
    zones = [f for f in features if f["properties"]["type"] == "zone"]

    has_zones = session.scalar(select(func.count()).select_from(Zone).where(Zone.event_id == event.id))
    if has_zones and not reset:
        # Keep the zones (staff are posted in them); only link cameras that are still missing.
        for f in zones:
            p = f["properties"]
            if p.get("feed_id"):
                session.execute(
                    update(Zone)
                    .where(Zone.event_id == event.id, Zone.name == p["name"], Zone.feed_id.is_(None))
                    .values(feed_id=p["feed_id"])
                )
        session.commit()
        return 0
    session.execute(delete(Poi).where(Poi.event_id == event.id))
    session.execute(delete(Zone).where(Zone.event_id == event.id))

    for f in zones:
        p = f["properties"]
        session.add(Zone(
            event_id=event.id, name=p["name"], capacity=p["capacity"], feed_id=p.get("feed_id"), polygon=_geom(f)
        ))
    for f in features:
        p = f["properties"]
        if p["type"] == "poi":
            session.add(Poi(event_id=event.id, kind=p["kind"], name=p["name"], location=_geom(f)))
    session.flush()
    # Each facility belongs to the zone it lies in (if any).
    session.execute(
        text(
            "UPDATE pois SET zone_id = z.id FROM zones z "
            "WHERE pois.event_id = :e AND z.event_id = :e AND ST_Contains(z.polygon, pois.location)"
        ),
        {"e": event.id},
    )
    session.commit()
    return len(zones)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--slug", default="demo")
    parser.add_argument("--name")
    parser.add_argument("--venue")
    parser.add_argument("--city")
    parser.add_argument("--reset-venue", action="store_true", help="replace the event's zones and facilities")
    args = parser.parse_args()

    if db.init_engine() is None:
        sys.exit("DATABASE_URL is not set (export it or put it in backend/.env).")
    with db.SessionLocal() as session:
        event = seed(session, args.slug, args.name, args.venue, args.city)
        print(f"Event '{event.name}' ({event.slug}) is live; {event.attendee_count} attendees so far.")
        added = load_venue(session, event, reset=args.reset_venue)
        print(f"Venue map: loaded {added} zones from {VENUE_FILE.name}." if added else
              "Venue map: already loaded (use --reset-venue to replace it).")


if __name__ == "__main__":
    main()
