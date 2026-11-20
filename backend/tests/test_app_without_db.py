"""The camera API keeps working when no database is configured (task 07a)."""
from fastapi.testclient import TestClient

from dristhi import db


def test_feeds_ok_and_join_503_without_database(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    db.reset_engine()
    import app  # loads the crowd model; no `with`, so camera threads don't start

    client = TestClient(app.app)
    assert client.get("/api/feeds").status_code == 200
    res = client.post("/api/events/demo/join", json={"device_id": "6f1c1f6e-3f5a-4a59-9a43-2f4b8a3c6d10"})
    assert res.status_code == 503
    assert res.json()["error"] == "database_not_configured"
