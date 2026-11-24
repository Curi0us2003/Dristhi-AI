"""Staff app: sign-in with name + code, the staff feed, code reset and the failed-attempt limit."""
import uuid

import pytest
from geoalchemy2.elements import WKTElement

from dristhi import staff_auth
from dristhi.auth import verify_token
from dristhi.models import Admin, Attendee, Event, Organization, Zone


@pytest.fixture
def setup(client, session):
    """An event with two zones, an admin client and a reset attempt limit."""
    staff_auth.reset_failures()
    org = Organization(name="Org")
    session.add(org)
    session.flush()
    session.add(Admin(organization_id=org.id, email="ops@example.test", username="control",
                      employee_id="EMP001", role="owner"))
    event = Event(organization_id=org.id, slug="demo", name="Demo", status="live")
    session.add(event)
    session.flush()
    gate = Zone(event_id=event.id, name="Gate A", capacity=100,
                polygon=WKTElement("POLYGON((77 12, 78 12, 78 13, 77 13, 77 12))", srid=4326))
    stage = Zone(event_id=event.id, name="Stage", capacity=100)
    session.add_all([gate, stage])
    session.commit()
    client.app.dependency_overrides[verify_token] = lambda: {"uid": "u1", "email": "ops@example.test"}
    yield client, event, gate, stage
    client.app.dependency_overrides.clear()


def add_staff(client, event, **item):
    res = client.post(f"/api/events/{event.id}/staff", json=[item])
    assert res.status_code == 201, res.text
    return res.json()[0]


def login(client, name, code, event="demo"):
    return client.post("/api/staff/login", json={"event": event, "name": name, "code": code})


def test_new_staff_get_a_code_and_can_sign_in(setup):
    client, event, gate, _ = setup
    guard = add_staff(client, event, name="Ravi Kumar", kind="guard", zone_id=str(gate.id))
    code = guard["login_code"]
    assert len(code) == 6 and set(code) <= set(staff_auth.CODE_ALPHABET)

    res = login(client, "  ravi   KUMAR ", code.lower()[:3] + "-" + code.lower()[3:])
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token"] and body["staff"]["name"] == "Ravi Kumar"
    assert body["staff"]["zone"]["name"] == "Gate A"
    assert body["move"] is None and body["assignment"] is None

    me = client.get("/api/staff/me", headers={"X-Staff-Token": body["token"]})
    assert me.status_code == 200 and me.json()["staff"]["kind"] == "guard"


def test_wrong_name_code_or_event_is_rejected(setup):
    client, event, _, _ = setup
    code = add_staff(client, event, name="Ravi", kind="guard")["login_code"]
    for args in (("Someone", code), ("Ravi", "AAAAAA"), ("Ravi", code, "other-event")):
        res = login(client, *args)
        assert res.status_code == 401 and res.json()["error"] == "wrong_login"
    assert client.get("/api/staff/me").status_code == 401
    assert client.get("/api/staff/me", headers={"X-Staff-Token": "nope"}).status_code == 401


def test_too_many_wrong_codes_locks_out(setup):
    client, event, _, _ = setup
    code = add_staff(client, event, name="Ravi", kind="guard")["login_code"]
    for _ in range(staff_auth.MAX_FAILURES):
        assert login(client, "Ravi", "WRONG1").status_code == 401
    locked = login(client, "Ravi", code)
    assert locked.status_code == 429 and locked.json()["error"] == "too_many_attempts"


def test_guard_sees_move(setup):
    client, event, gate, stage = setup
    guard = add_staff(client, event, name="Ravi", kind="guard", zone_id=str(gate.id))
    token = login(client, "Ravi", guard["login_code"]).json()["token"]
    client.post(f"/api/events/{event.id}/dispatches/moves",
                json={"moves": [{"staff_id": guard["id"], "to_zone_id": str(stage.id)}], "reason": "Crowding"})
    feed = client.get("/api/staff/me", headers={"X-Staff-Token": token}).json()
    assert feed["staff"]["zone"]["name"] == "Stage"
    assert feed["move"]["from_zone_name"] == "Gate A" and feed["move"]["to_zone_name"] == "Stage"
    assert feed["move"]["reason"] == "Crowding"


def test_medic_sees_attendee_and_zone_until_resolved(setup, session):
    client, event, _, _ = setup
    device = uuid.uuid4()
    attendee = Attendee(event_id=event.id, number=1, device_id=device, name="Asha", phone="+919876543210")
    session.add(attendee)
    session.commit()
    report = client.post(
        f"/api/attendees/{attendee.id}/reports", headers={"X-Device-Id": str(device)},
        json={"type": "Medical Attention", "details": "Fainted", "urgency": "High",
              "coords": {"lat": 12.5, "lng": 77.5, "accuracy_m": 12}},
    ).json()
    medic = add_staff(client, event, name="Dr Rao", kind="doctor")
    token = login(client, "Dr Rao", medic["login_code"]).json()["token"]
    client.post(f"/api/events/{event.id}/grievances/{report['id']}/assign",
                json={"staff_id": medic["id"], "reason": "Medical"})

    a = client.get("/api/staff/me", headers={"X-Staff-Token": token}).json()["assignment"]
    assert a["attendee_name"] == "Asha" and a["attendee_phone"] == "+919876543210"
    assert a["zone_name"] == "Gate A" and a["type"] == "Medical Attention" and a["urgency"] == "High"

    client.post(f"/api/events/{event.id}/grievances/{report['id']}/resolve", json={"action_taken": "Treated"})
    assert client.get("/api/staff/me", headers={"X-Staff-Token": token}).json()["assignment"] is None


def test_attendee_closes_own_report_and_frees_the_medic(setup, session):
    client, event, _, _ = setup
    device = uuid.uuid4()
    attendee = Attendee(event_id=event.id, number=1, device_id=device, name="Asha")
    session.add(attendee)
    session.commit()
    mine = {"X-Device-Id": str(device)}
    report = client.post(f"/api/attendees/{attendee.id}/reports", headers=mine,
                         json={"type": "Medical Attention", "details": "Fainted"}).json()
    medic = add_staff(client, event, name="Dr Rao", kind="doctor")
    token = login(client, "Dr Rao", medic["login_code"]).json()["token"]
    client.post(f"/api/events/{event.id}/grievances/{report['id']}/assign",
                json={"staff_id": medic["id"], "reason": "Medical"})

    url = f"/api/attendees/{attendee.id}/reports/{report['id']}/resolve"
    assert client.post(url, headers={"X-Device-Id": str(uuid.uuid4())}).status_code == 404
    done = client.post(url, headers=mine)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "resolved"
    assert done.json()["action_taken"] == "Closed by the attendee: help received from Dr Rao"
    assert client.post(url, headers=mine).json()["resolved_at"] == done.json()["resolved_at"]

    assert client.get("/api/staff/me", headers={"X-Staff-Token": token}).json()["assignment"] is None
    staff = client.get(f"/api/events/{event.id}/staff").json()
    assert next(s for s in staff if s["id"] == medic["id"])["status"] == "available"


def test_reset_code_and_new_login_end_old_sessions(setup):
    client, event, _, _ = setup
    guard = add_staff(client, event, name="Ravi", kind="guard")
    first = login(client, "Ravi", guard["login_code"]).json()["token"]
    second = login(client, "Ravi", guard["login_code"]).json()["token"]
    assert client.get("/api/staff/me", headers={"X-Staff-Token": first}).status_code == 401

    new = client.post(f"/api/events/{event.id}/staff/{guard['id']}/login-code").json()["login_code"]
    assert new != guard["login_code"]
    assert client.get("/api/staff/me", headers={"X-Staff-Token": second}).status_code == 401
    assert login(client, "Ravi", guard["login_code"]).status_code == 401
    token = login(client, "Ravi", new).json()["token"]
    assert client.post("/api/staff/logout", headers={"X-Staff-Token": token}).status_code == 204
    assert client.get("/api/staff/me", headers={"X-Staff-Token": token}).status_code == 401
