"""Task 07a: anonymous attendee join."""
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient

from dristhi import db
from dristhi.models import Event

from conftest import make_app

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from seed_demo import seed  # noqa: E402


def join(client, slug="demo", device_id=None, **details):
    body = {"device_id": str(device_id or uuid.uuid4()), **details}
    return client.post(f"/api/events/{slug}/join", json=body)


def test_numbers_go_up_per_device(client, session):
    seed(session)
    first, second = join(client), join(client)
    assert first.status_code == 200, first.text
    assert first.json()["number"] == 1
    assert first.json()["display_name"] == "Attendee 1"
    assert first.json()["event"]["slug"] == "demo"
    assert second.json()["number"] == 2


def test_same_device_keeps_its_number(client, session):
    seed(session)
    device = uuid.uuid4()
    a, b = join(client, device_id=device), join(client, device_id=device)
    assert a.json() == b.json()
    session.expire_all()
    assert session.query(Event).one().attendee_count == 1


def test_get_attendee(client, session):
    seed(session)
    joined = join(client).json()
    got = client.get(f"/api/attendees/{joined['attendee_id']}")
    assert got.status_code == 200
    assert got.json() == joined
    missing = client.get(f"/api/attendees/{uuid.uuid4()}")
    assert missing.status_code == 404
    assert missing.json()["error"] == "attendee_not_found"


def test_concurrent_joins_get_distinct_numbers(client, session):
    seed(session)

    def one(_):
        with TestClient(make_app()) as c:
            return join(c).json()["number"]

    with ThreadPoolExecutor(max_workers=20) as pool:
        numbers = list(pool.map(one, range(20)))
    assert sorted(numbers) == list(range(1, 21))


def test_unknown_and_draft_events_look_the_same(client, session):
    event = seed(session)
    unknown = join(client, slug="no-such-event")
    event.status = "draft"
    session.commit()
    draft = join(client)
    for res in (unknown, draft):
        assert res.status_code == 404
        assert res.json() == {"error": "event_not_found", "detail": "This event is not open for joining."}


def test_device_id_must_be_a_uuid(client, session):
    seed(session)
    res = client.post("/api/events/demo/join", json={"device_id": "not-a-uuid"})
    assert res.status_code == 422


def test_seed_is_idempotent(session):
    a = seed(session)
    b = seed(session, city="Mumbai")
    assert a.id == b.id
    assert session.query(Event).count() == 1
    assert b.city == "Mumbai"


def test_without_database_join_returns_503(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db.reset_engine()
    res = join(TestClient(make_app()))
    assert res.status_code == 503
    assert res.json()["error"] == "database_not_configured"


def test_join_with_name_and_phone(client, session):
    seed(session)
    device = uuid.uuid4()
    res = join(client, device_id=device, name="  Rahul   Sen ", phone="098765 43210")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["display_name"] == "Rahul Sen" and body["name"] == "Rahul Sen"
    assert body["phone"] == "+919876543210"

    # Only the same device gets the name and number back.
    own = client.get(f"/api/attendees/{body['attendee_id']}", headers={"X-Device-Id": str(device)}).json()
    assert own["phone"] == "+919876543210"
    other = client.get(f"/api/attendees/{body['attendee_id']}").json()
    assert other["phone"] is None and other["name"] is None and other["display_name"] == "Attendee 1"


def test_rejoin_and_update_details(client, session):
    seed(session)
    device = uuid.uuid4()
    first = join(client, device_id=device).json()
    assert first["display_name"] == "Attendee 1" and first["phone"] is None
    again = join(client, device_id=device, name="Asha", phone="+44 7700 900123").json()
    assert again["attendee_id"] == first["attendee_id"] and again["number"] == 1
    assert again["phone"] == "+447700900123"

    url = f"/api/attendees/{first['attendee_id']}"
    assert client.patch(url, json={"phone": "9876543210"}).status_code == 422  # no device header
    assert client.patch(url, headers={"X-Device-Id": str(uuid.uuid4())}, json={"name": "X Y"}).status_code == 404
    updated = client.patch(url, headers={"X-Device-Id": str(device)}, json={"phone": "+91 91234 56789"}).json()
    assert updated["phone"] == "+919123456789" and updated["name"] == "Asha"


def test_bad_name_or_phone_is_rejected(client, session):
    seed(session)
    for details, code in (
        ({"name": "A", "phone": "9876543210"}, "invalid_name"),
        ({"name": "Asha", "phone": "12345"}, "invalid_phone"),
        ({"name": "Asha", "phone": "5876543210"}, "invalid_phone"),
    ):
        res = join(client, **details)
        assert res.status_code == 422 and res.json()["error"] == code
    session.expire_all()
    assert session.query(Event).one().attendee_count == 0
