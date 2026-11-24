"""Web video feeds are downloaded once and then read from local disk (video_cache.py)."""
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

import video_cache

CLIP = b"\x00\x00\x00\x18ftypmp42" + b"x" * 4096  # stands in for an mp4; never decoded here


@pytest.fixture
def server():
    """Local HTTP server: /clip.mp4 returns CLIP, anything else 404. Counts GET requests."""
    hits = {"n": 0}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            hits["n"] += 1
            if self.path.startswith("/clip.mp4"):
                self.send_response(200)
                self.send_header("Content-Length", str(len(CLIP)))
                self.end_headers()
                self.wfile.write(CLIP)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, *args):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}", hits
    httpd.shutdown()


@pytest.fixture(autouse=True)
def cache_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setenv("FEED_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.delenv("FEED_CACHE", raising=False)


def test_downloads_once_then_reuses_the_local_copy(server):
    base, hits = server
    feeds = {"feed_1": {"url": f"{base}/clip.mp4"}}

    first = video_cache.localize_feeds(feeds)
    assert first == {"cached": 0, "downloaded": 1, "failed": 0}
    local = feeds["feed_1"]["url"]
    assert feeds["feed_1"]["source_url"] == f"{base}/clip.mp4"
    with open(local, "rb") as f:
        assert f.read() == CLIP

    # A restart on the same disk: fresh config from feeds.json, no new download.
    again = {"feed_1": {"url": f"{base}/clip.mp4"}}
    second = video_cache.localize_feeds(again)
    assert second == {"cached": 1, "downloaded": 0, "failed": 0}
    assert again["feed_1"]["url"] == local
    assert hits["n"] == 1


def test_failed_download_keeps_the_web_link_and_leaves_no_file(server, tmp_path):
    base, _ = server
    feeds = {"feed_1": {"url": f"{base}/missing.mp4"}}

    stats = video_cache.localize_feeds(feeds)
    assert stats == {"cached": 0, "downloaded": 0, "failed": 1}
    assert feeds["feed_1"]["url"] == f"{base}/missing.mp4"
    assert list((tmp_path / "cache").iterdir()) == []


def test_live_streams_and_local_files_are_left_alone():
    feeds = {
        "rtsp": {"url": "rtsp://10.0.0.5/stream1"},
        "hls": {"url": "https://example.com/live/index.m3u8"},
        "local": {"url": "/videos/lobby.mp4"},
    }
    before = {k: dict(v) for k, v in feeds.items()}
    assert video_cache.localize_feeds(feeds) == {"cached": 0, "downloaded": 0, "failed": 0}
    assert feeds == before


def test_cache_can_be_turned_off(server, monkeypatch):
    base, hits = server
    monkeypatch.setenv("FEED_CACHE", "0")
    feeds = {"feed_1": {"url": f"{base}/clip.mp4"}}
    video_cache.localize_feeds(feeds)
    assert feeds["feed_1"]["url"] == f"{base}/clip.mp4"
    assert hits["n"] == 0


def test_a_changed_link_is_a_new_cache_file(tmp_path):
    d = str(tmp_path)
    a = video_cache.local_path("https://res.cloudinary.com/a/video/upload/v1/lobby_x.mp4", d)
    b = video_cache.local_path("https://res.cloudinary.com/b/video/upload/v2/lobby_x.mp4", d)
    assert a != b and a.endswith(".mp4") and "lobby_x" in a
