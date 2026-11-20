"""Task 06a: demo venue map."""
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from dristhi import db
from dristhi.models import Poi, Zone

from conftest import make_app

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from seed_demo import VENUE_FILE, load_venue, seed  # noqa: E402

VENUE = json.loads(VENUE_FILE.read_text(encoding="utf-8"))["features"]
N_ZONES = sum(f["properties"]["type"] == "zone" for f in VENUE)
N_POIS = len(VENUE) - N_ZONES


def test_map_returns_zones_and_facilities(client, session):
    load_venue(session, seed(session))
    res = client.get("/api/events/demo/map")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["type"] == "FeatureCollection"
    zones = [f for f in body["features"] if f["properties"]["type"] == "zone"]
    pois = [f for f in body["features"] if f["properties"]["type"] == "poi"]
    assert len(zones) == N_ZONES and len(pois) == N_POIS

    stage = next(z for z in zones if z["properties"]["name"] == "Mall Stage")
    assert stage["geometry"]["type"] == "Polygon"
    assert stage["properties"]["capacity"] == 600
    lng, lat = stage["properties"]["center"]
    assert 77.7 < lng < 77.8 and 12.9 < lat < 13.0  # [lng, lat] order

    washroom = next(p for p in pois if p["properties"]["name"] == "Washroom · Stage south")
    assert washroom["geometry"]["type"] == "Point"
    assert washroom["properties"]["kind"] == "washroom"
    assert washroom["properties"]["zone_id"] == stage["properties"]["id"]  # assigned by ST_Contains
    assert all("camera" not in json.dumps(f).lower() for f in body["features"])


def test_every_kind_is_present(client, session):
    load_venue(session, seed(session))
    kinds = {f["properties"]["kind"] for f in client.get("/api/events/demo/map").json()["features"]
             if f["properties"]["type"] == "poi"}
    assert kinds == {"washroom", "first_aid", "exit", "water", "lost_found", "cloak_room", "help_point", "stage"}


def test_load_venue_is_idempotent_and_can_reset(session):
    event = seed(session)
    assert load_venue(session, event) == N_ZONES
    assert load_venue(session, event) == 0
    assert load_venue(session, event, reset=True) == N_ZONES
    assert session.query(Zone).count() == N_ZONES
    assert session.query(Poi).count() == N_POIS


def test_map_404_for_unknown_or_draft_event(client, session):
    event = seed(session)
    load_venue(session, event)
    assert client.get("/api/events/nope/map").json()["error"] == "event_not_found"
    event.status = "draft"
    session.commit()
    res = client.get("/api/events/demo/map")
    assert res.status_code == 404 and res.json()["error"] == "event_not_found"


def test_map_503_without_database(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db.reset_engine()
    res = TestClient(make_app()).get("/api/events/demo/map")
    assert res.status_code == 503
