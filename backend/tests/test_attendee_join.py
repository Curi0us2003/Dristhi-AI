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


def join(client, slug="demo", device_id=None):
    return client.post(f"/api/events/{slug}/join", json={"device_id": str(device_id or uuid.uuid4())})


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
