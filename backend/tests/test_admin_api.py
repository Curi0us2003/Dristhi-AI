"""Admin API on Cloud SQL: sign-in check, org scoping, staff moves, reports and notifications."""
import uuid

import pytest

from dristhi.auth import verify_token
from dristhi.models import Admin, Attendee, Event, Organization


@pytest.fixture
def org(session):
    o = Organization(name="Org A")
    session.add(o)
    session.commit()
    return o


@pytest.fixture
def admin(session, org):
    a = Admin(organization_id=org.id, email="ops@example.test", username="control", employee_id="EMP001", role="owner")
    session.add(a)
    session.commit()
    return a


@pytest.fixture
def api(client):
    """Client whose token claims we set per test (no Firebase needed)."""
    claims = {"uid": "uid-1", "email": "ops@example.test"}
    client.app.dependency_overrides[verify_token] = lambda: claims
    client.claims = claims
    yield client
    client.app.dependency_overrides.clear()


def test_login_links_uid_and_checks_fields(api, admin, session):
    r = api.post("/api/auth/admin-login", json={"username": "control", "employee_id": "EMP001"})
    assert r.status_code == 200 and r.json()["role"] == "owner"
    session.refresh(admin)
    assert admin.firebase_uid == "uid-1"

    bad = api.post("/api/auth/admin-login", json={"username": "control", "employee_id": "WRONG"})
    assert bad.status_code == 403 and bad.json()["error"] == "admin_not_found"


def test_recreated_firebase_account_relinks_by_email(api, admin, session):
    api.get("/api/auth/me")
    api.claims.update(uid="uid-new")
    assert api.get("/api/auth/me").status_code == 200
    session.refresh(admin)
    assert admin.firebase_uid == "uid-new"


def test_unknown_account_is_not_an_admin(api, admin):
    api.claims.update(uid="uid-2", email="someone@example.test")
    assert api.get("/api/auth/me").json()["error"] == "not_an_admin"


def test_no_token_is_401(client):
    r = client.get("/api/events")
    assert r.status_code == 401 and r.json()["error"] == "not_signed_in"


def test_event_zone_staff_and_moves(api, admin):
    ev = api.post("/api/events", json={"name": "KTPO Expo", "venue": "KTPO", "lat": 12.9837, "lng": 77.7280}).json()
    assert ev["slug"].startswith("ktpo-expo-") and round(ev["lat"], 4) == 12.9837

    a = api.post(f"/api/events/{ev['id']}/zones", json={"name": "Gate A", "capacity": 500, "feed_id": "feed_1"}).json()
    b = api.post(f"/api/events/{ev['id']}/zones", json={"name": "Hall 1", "capacity": 900}).json()
    staff = api.post(
        f"/api/events/{ev['id']}/staff",
        json=[{"name": "Ravi", "kind": "guard", "zone_id": a["id"]}, {"name": "KA-01-1234", "kind": "ambulance"}],
    ).json()
    assert [s["status"] for s in staff] == ["available", "available"]

    moved = api.post(
        f"/api/events/{ev['id']}/dispatches/moves",
        json={"moves": [{"staff_id": staff[0]["id"], "to_zone_id": b["id"]}], "reason": "Hall 1 at 92%"},
    ).json()
    assert moved[0]["from_zone_name"] == "Gate A" and moved[0]["to_zone_name"] == "Hall 1"
    ravi = next(s for s in api.get(f"/api/events/{ev['id']}/staff").json() if s["name"] == "Ravi")
    assert ravi["zone_id"] == b["id"] and ravi["status"] == "dispatched"

    # Deleting a zone unassigns its staff instead of deleting them.
    assert api.delete(f"/api/events/{ev['id']}/zones/{b['id']}").status_code == 204
    ravi = next(s for s in api.get(f"/api/events/{ev['id']}/staff").json() if s["name"] == "Ravi")
    assert ravi["zone_id"] is None


def test_other_organizations_events_are_hidden(api, admin, session):
    other = Organization(name="Org B")
    session.add(other)
    session.flush()
    hidden = Event(organization_id=other.id, slug="hidden", name="Hidden", status="live")
    session.add(hidden)
    session.commit()

    assert all(e["slug"] != "hidden" for e in api.get("/api/events").json())
    assert api.get(f"/api/events/{hidden.id}/staff").status_code == 404


def test_attendee_report_assign_resolve_and_notify(api, admin, session, org):
    event = Event(organization_id=org.id, slug="demo", name="Demo", status="live")
    session.add(event)
    session.flush()
    device = uuid.uuid4()
    attendee = Attendee(event_id=event.id, number=1, device_id=device, name="Rahul", phone="+919876543210")
    session.add(attendee)
    session.commit()
    headers = {"X-Device-Id": str(device)}

    r = api.post(
        f"/api/attendees/{attendee.id}/reports",
        headers=headers,
        json={"type": "Missing Person", "details": "Red shirt", "person_name": "Asha",
              "coords": {"lat": 12.98, "lng": 77.72, "accuracy_m": 15}},
    )
    assert r.status_code == 201
    report = r.json()
    assert report["submitted_by"] == "Rahul" and report["coords"]["accuracy_m"] == 15
    listed = api.get(f"/api/events/{event.id}/grievances").json()[0]
    assert listed["attendee_name"] == "Rahul" and listed["attendee_phone"] == "+919876543210"

    # Wrong device: not found. Missing-person alert is public for the event.
    assert api.get(f"/api/attendees/{attendee.id}/reports", headers={"X-Device-Id": str(uuid.uuid4())}).status_code == 404
    assert api.get("/api/events/demo/missing-persons").json()[0]["person_name"] == "Asha"

    notes = api.get(f"/api/attendees/{attendee.id}/notifications", headers=headers).json()
    assert "Asha" in notes[0]["message"]
    assert api.post(f"/api/attendees/{attendee.id}/notifications/{notes[0]['id']}/read", headers=headers).status_code == 204
    assert api.get(f"/api/attendees/{attendee.id}/notifications", headers=headers).json() == []

    medic = api.post(
        f"/api/events/{event.id}/staff", json=[{"name": "Dr Rao", "kind": "doctor", "phone": "+919000000001"}]
    ).json()[0]
    g = api.post(
        f"/api/events/{event.id}/grievances/{report['id']}/assign", json={"staff_id": medic["id"], "reason": "Search"}
    ).json()
    assert g["assigned_staff_name"] == "Dr Rao" and g["assigned_staff_phone"] == "+919000000001"
    # The attendee is told who is coming and how to call them, and sees it on their report.
    note = api.get(f"/api/attendees/{attendee.id}/notifications", headers=headers).json()[0]["message"]
    assert note == "Dr Rao (Doctor) is on the way to help you. Call +919000000001."
    mine = api.get(f"/api/attendees/{attendee.id}/reports", headers=headers).json()[0]
    assert mine["assigned_staff_phone"] == "+919000000001"
    assert api.get(f"/api/events/{event.id}/dispatches").json()[0]["grievance_id"] == report["id"]

    done = api.post(f"/api/events/{event.id}/grievances/{report['id']}/resolve", json={"action_taken": "Found"}).json()
    assert done["status"] == "resolved"
    assert api.get("/api/events/demo/missing-persons").json() == []

    sent = api.post(f"/api/events/{event.id}/notifications", json={"attendee_id": str(attendee.id), "message": "Found her"})
    assert sent.status_code == 201


def test_event_qr_code(api, admin, session):
    ev = api.post("/api/events", json={"name": "KTPO Expo"}).json()
    assert ev["join_url"].endswith(f"/join?e={ev['slug']}")

    r = api.get(f"/api/events/{ev['id']}/qr.png")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert f"event-{ev['slug']}-qr.png" in r.headers["content-disposition"]

    staff = api.get(f"/api/events/{ev['id']}/staff-qr.png")
    assert staff.status_code == 200 and staff.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert staff.content != r.content
    assert f"event-{ev['slug']}-staff-qr.png" in staff.headers["content-disposition"]

    # Another organization's event is not found, and there is no QR without a token.
    other = Organization(name="Org Q")
    session.add(other)
    session.commit()
    hidden = Event(organization_id=other.id, slug="hidden-qr", name="Hidden", status="live")
    session.add(hidden)
    session.commit()
    assert api.get(f"/api/events/{hidden.id}/qr.png").status_code == 404
    assert api.get(f"/api/events/{hidden.id}/staff-qr.png").status_code == 404
    api.app.dependency_overrides.clear()
    assert api.get(f"/api/events/{ev['id']}/qr.png").status_code == 401


def test_admin_venue_map_includes_draft_events(api, admin, session, org):
    from sqlalchemy import func

    from dristhi.models import Poi, Zone

    event = Event(organization_id=org.id, slug="draft-venue", name="Draft venue", status="draft")
    session.add(event)
    session.flush()
    polygon = func.ST_GeomFromText("POLYGON((77.71 12.97, 77.72 12.97, 77.72 12.98, 77.71 12.97))", 4326)
    session.add(Zone(event_id=event.id, name="Gate A", capacity=100, feed_id="feed_1", polygon=polygon))
    session.add(Zone(event_id=event.id, name="No outline yet", capacity=50))
    session.add(Poi(event_id=event.id, kind="washroom", name="WC 1",
                    location=func.ST_SetSRID(func.ST_MakePoint(77.715, 12.975), 4326)))
    session.commit()

    # The public attendee map only serves live events; the admin map serves any status.
    assert api.get("/api/events/draft-venue/map").status_code == 404
    fc = api.get(f"/api/events/{event.id}/venue-map").json()
    zones = [f["properties"] for f in fc["features"] if f["properties"]["type"] == "zone"]
    assert [z["name"] for z in zones] == ["Gate A"] and zones[0]["feed_id"] == "feed_1"
    assert any(f["properties"].get("kind") == "washroom" for f in fc["features"])
