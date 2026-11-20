"""Venue map for attendees (task 06a): zones and facilities as one GeoJSON FeatureCollection.

Public like the join route during the demo phase (same 404 rules); it never includes cameras.
"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from dristhi.db import get_db
from dristhi.errors import ApiError
from dristhi.models import Event, Poi, Zone

router = APIRouter(prefix="/api", tags=["venue"])


def venue_feature_collection(db: Session, event: Event) -> dict:
    """Zones: Polygon with {type: "zone", id, name, capacity, feed_id, center: [lng, lat]}.
    Facilities: Point with {type: "poi", id, kind, name, zone_id}. Coordinates are [lng, lat].
    Zones without an outline yet are left out. Shared by the attendee and admin maps."""
    features = []
    zones = db.execute(
        select(
            Zone.id,
            Zone.name,
            Zone.capacity,
            Zone.feed_id,
            func.ST_AsGeoJSON(Zone.polygon, 7),
            func.ST_X(func.ST_PointOnSurface(Zone.polygon)),
            func.ST_Y(func.ST_PointOnSurface(Zone.polygon)),
        )
        .where(Zone.event_id == event.id, Zone.polygon.is_not(None))
        .order_by(Zone.name)
    )
    for zid, name, capacity, feed_id, geojson, cx, cy in zones:
        features.append({
            "type": "Feature",
            "geometry": json.loads(geojson),
            "properties": {
                "type": "zone", "id": str(zid), "name": name, "capacity": capacity, "feed_id": feed_id,
                "center": [round(cx, 7), round(cy, 7)],
            },
        })

    pois = db.execute(
        select(Poi.id, Poi.kind, Poi.name, Poi.zone_id, func.ST_AsGeoJSON(Poi.location, 7))
        .where(Poi.event_id == event.id)
        .order_by(Poi.kind, Poi.name)
    )
    for pid, kind, name, zone_id, geojson in pois:
        features.append({
            "type": "Feature",
            "geometry": json.loads(geojson),
            "properties": {
                "type": "poi", "id": str(pid), "kind": kind, "name": name,
                "zone_id": str(zone_id) if zone_id else None,
            },
        })

    return {"type": "FeatureCollection", "event": {"slug": event.slug, "name": event.name}, "features": features}


@router.get("/events/{slug}/map")
def event_map(slug: str, db: Session = Depends(get_db)) -> dict:
    """Venue map of a live event for attendees (see venue_feature_collection)."""
    event = db.scalar(select(Event).where(Event.slug == slug))
    if event is None or event.status != "live":
        raise ApiError(404, "event_not_found", "This event is not open for joining.")
    return venue_feature_collection(db, event)
