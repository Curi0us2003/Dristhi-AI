"""Download-once cache for camera feeds that are video files on the web (e.g. Cloudinary).

Every reader (the counter every ANALYSIS_INTERVAL, the preview reader in real time) loops
over its video around the clock. Reading straight from the web made each loop and each seek
a fresh download, about 10 GB a day for 48 MB of clips. `localize_feeds` downloads each clip
once at startup and points the feed at the local copy, so later reads never leave the server.

- Only http(s) links to video files are cached. RTSP, HLS (.m3u8) and local paths are live
  or already local and stay as they are.
- A file already in the cache is reused, so a restart on the same disk downloads nothing.
- If a download fails, the feed keeps its web link: slower and costlier, but never blank.

Settings: FEED_CACHE_DIR (default <temp>/dristhi-feeds; on Cloud Run /tmp is memory, ~48 MB),
FEED_CACHE=0 turns the cache off.
"""
import hashlib
import os
import tempfile
from urllib.parse import urlparse

import requests

VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".avi", ".mkv", ".webm"}
DOWNLOAD_TIMEOUT_S = 60


def cache_dir() -> str:
    return os.environ.get("FEED_CACHE_DIR") or os.path.join(tempfile.gettempdir(), "dristhi-feeds")


def is_cacheable(url: str) -> bool:
    """True for an http(s) link to a video file; False for live streams and local paths."""
    parsed = urlparse(url)
    ext = os.path.splitext(parsed.path)[1].lower()
    return parsed.scheme in ("http", "https") and ext in VIDEO_EXTENSIONS


def local_path(url: str, directory: str) -> str:
    """Cache file for `url`: readable name plus a hash, so a changed link is a new file."""
    path = urlparse(url).path
    stem, ext = os.path.splitext(os.path.basename(path))
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    return os.path.join(directory, f"{stem}-{digest}{ext.lower()}")


def download(url: str, dest: str) -> None:
    """Writes `url` to `dest` atomically: a half-finished download is never used."""
    part = f"{dest}.part"
    with requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT_S) as r:
        r.raise_for_status()
        with open(part, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    if os.path.getsize(part) == 0:
        os.remove(part)
        raise IOError("empty download")
    os.replace(part, dest)


def localize_feeds(feeds: dict) -> dict:
    """Points each cacheable feed's "url" at a local copy, downloading it if needed.

    The original link is kept in "source_url". Returns {"cached", "downloaded", "failed"}
    counts for the startup log.
    """
    stats = {"cached": 0, "downloaded": 0, "failed": 0}
    if os.environ.get("FEED_CACHE", "1") == "0":
        return stats
    directory = cache_dir()
    os.makedirs(directory, exist_ok=True)
    for feed_id, cfg in feeds.items():
        url = cfg["url"]
        if not is_cacheable(url):
            continue
        dest = local_path(url, directory)
        try:
            if os.path.exists(dest) and os.path.getsize(dest) > 0:
                stats["cached"] += 1
            else:
                download(url, dest)
                stats["downloaded"] += 1
            cfg["source_url"], cfg["url"] = url, dest
        except Exception as e:  # keep the web link; the feed still works
            stats["failed"] += 1
            print(f"⚠️  {feed_id}: could not cache {url} ({e}); reading it from the web")
    return stats
