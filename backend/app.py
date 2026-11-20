from fastapi import FastAPI, Body, Request
from fastapi.responses import JSONResponse, StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import cv2
import pandas as pd
from datetime import datetime, timedelta, timezone
import asyncio
import threading
import time
import numpy as np
import json
from collections import defaultdict, deque
from typing import Dict
import io
import os
import warnings
import gc

import sys

# Windows consoles default to cp1252, which cannot print the emoji in our logs
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from crowd_counter import load_counter, render_density_overlay
from forecast import forecast_feed
from dristhi.config import cors_origins
from dristhi.errors import register_error_handlers
from dristhi.routers import attendees as attendees_router
from dristhi.routers import venue as venue_router
from dristhi.routers import admin as admin_router
from dristhi.routers import reports as reports_router

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

# ─────────────────────────────────────────────────────────────
# Crowd counting model (DM-Count from Hugging Face by default,
# see crowd_counter.py for alternatives and benchmark numbers)
# ─────────────────────────────────────────────────────────────
counter = load_counter()

# Seconds between two analyses of the same feed. On CPU one analysis takes ~1-3 s and all feeds
# share the model, so with many feeds each one is refreshed roughly every (feeds x analysis time).
ANALYSIS_INTERVAL = float(os.environ.get("ANALYSIS_INTERVAL", "5"))
# Minutes of history the forecast fits its trend on
PREDICTION_WINDOW_MIN = float(os.environ.get("PREDICTION_WINDOW_MIN", "5"))


class FairLock:
    """First come, first served lock, so every feed gets its turn on the model.

    A plain Lock lets whichever thread wakes first win, and a feed can wait several rounds.
    """

    def __init__(self):
        self._mutex = threading.Lock()
        self._waiting = deque()
        self._busy = False

    def __enter__(self):
        with self._mutex:
            if not self._busy and not self._waiting:
                self._busy = True
                return self
            turn = threading.Event()
            self._waiting.append(turn)
        turn.wait()  # the releasing thread hands the lock straight to us
        return self

    def __exit__(self, *exc):
        with self._mutex:
            if self._waiting:
                self._waiting.popleft().set()
            else:
                self._busy = False


MODEL_TURN = FairLock()


# ─────────────────────────────────────────────────────────────
# Global State
# ─────────────────────────────────────────────────────────────
feeds_data = {}
analytics_data = defaultdict(lambda: deque(maxlen=400))  # ~30 min at the fastest refresh
# Alert levels as % of each feed's max_capacity (configurable via /api/config/thresholds)
alert_threshold = int(os.environ.get("ALERT_THRESHOLD", "90"))        # critical
congestion_threshold = int(os.environ.get("CONGESTION_THRESHOLD", "70"))  # warning

# ─────────────────────────────────────────────────────────────
# CCTV Feed Configuration
# ─────────────────────────────────────────────────────────────
def load_feeds():
    """Load CCTV feed definitions from feeds.json (or the file in $FEEDS_FILE).

    Each feed's "url" may be an HTTP(S)/RTSP URL or a local video path;
    relative paths are resolved against this folder.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.environ.get("FEEDS_FILE", os.path.join(base_dir, "feeds.json"))
    with open(path, encoding="utf-8") as f:
        feeds = json.load(f)
    for cfg in feeds.values():
        url = cfg["url"]
        if "://" not in url and not os.path.isabs(url):
            cfg["url"] = os.path.join(base_dir, url)
    print(f"📋 Loaded {len(feeds)} feeds from {path}")
    return feeds


CCTV_FEEDS = load_feeds()


# ─────────────────────────────────────────────────────────────
# Video Validation
# ─────────────────────────────────────────────────────────────
def validate_video_files():
    import requests
    missing_files = []
    valid_files = []

    for feed_id, config in CCTV_FEEDS.items():
        video_url = config['url']
        try:
            if video_url.startswith(('http://', 'https://')):
                response = requests.head(video_url, timeout=10)
                if response.status_code == 200:
                    cap = cv2.VideoCapture(video_url)
                    if cap.isOpened():
                        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        valid_files.append({
                            "feed_id": feed_id,
                            "url": video_url,
                            "frame_count": frame_count,
                            "fps": fps,
                            "resolution": f"{width}x{height}"
                        })
                        cap.release()
                    else:
                        missing_files.append(f"{feed_id}: Cannot open video stream {video_url}")
                else:
                    missing_files.append(f"{feed_id}: HTTP {response.status_code} for {video_url}")
            else:
                if os.path.exists(video_url):
                    cap = cv2.VideoCapture(video_url)
                    if cap.isOpened():
                        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                        fps = cap.get(cv2.CAP_PROP_FPS)
                        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        valid_files.append({
                            "feed_id": feed_id,
                            "path": video_url,
                            "frame_count": frame_count,
                            "fps": fps,
                            "resolution": f"{width}x{height}"
                        })
                        cap.release()
                    else:
                        missing_files.append(f"{feed_id}: Cannot open {video_url}")
                else:
                    missing_files.append(f"{feed_id}: File not found {video_url}")
        except Exception as e:
            missing_files.append(f"{feed_id}: Error checking {video_url} - {str(e)}")

    return valid_files, missing_files


def check_video_setup():
    print("Validating video files...")
    valid_files, missing_files = validate_video_files()

    if missing_files:
        print("❌ Missing or invalid video files:")
        for missing in missing_files:
            print(f"   {missing}")

    if valid_files:
        print("✅ Valid video files found:")
        for valid in valid_files:
            print(f"   {valid['feed_id']}: {valid['resolution']} @ {valid['fps']:.1f}fps ({valid['frame_count']} frames)")

    return len(valid_files), len(missing_files)


# ─────────────────────────────────────────────────────────────
# Feed Processor
# ─────────────────────────────────────────────────────────────
class FeedProcessor:
    """Background worker: samples one frame per ANALYSIS_INTERVAL and counts people.

    Video files are sampled at wall-clock position (looping), so analytics follow the
    footage in real time without decoding every frame; live streams (RTSP/HTTP) are
    read continuously so the analysed frame is always the latest one.
    """

    def __init__(self, feed_id, feed_config):
        self.feed_id = feed_id
        self.config = feed_config
        self.cap = None
        self.running = False
        self.current_count = 0
        self.latest_frame = None     # last analysed frame (BGR)
        self.latest_density = None   # its density map
        self.analysed_at = None      # epoch seconds when that frame was taken
        self.retry_count = 0
        self.max_retries = 3
        self.started = time.time()   # wall clock that video-file playback is synced to

    def playback_ms(self, duration_ms):
        """Position (ms) a looping video file should be at right now."""
        return ((time.time() - self.started) * 1000) % duration_ms if duration_ms else 0

    def start_processing(self):
        self.running = True
        thread = threading.Thread(target=self._process_feed, daemon=True)
        thread.start()

    def _open(self):
        cap = cv2.VideoCapture(self.config['url'])
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def _process_feed(self):
        try:
            self.cap = self._open()
            if not self.cap.isOpened():
                print(f"Failed to open video stream for {self.feed_id}")
                return

            fps = self.cap.get(cv2.CAP_PROP_FPS) or 25
            frames = self.cap.get(cv2.CAP_PROP_FRAME_COUNT)
            duration_ms = frames / fps * 1000 if frames > 0 else 0  # 0 => live stream
            next_analysis = 0.0

            while self.running:
                if not duration_ms and time.time() < next_analysis:
                    # Live stream between analyses: keep draining so the connection stays current
                    if self.cap.grab():
                        continue
                    ret = False
                else:
                    if duration_ms:
                        time.sleep(max(0.0, next_analysis - time.time()))
                    # Read the frame only once it is our turn on the model, so the published
                    # count describes what the camera shows now, not what it showed while we
                    # waited behind the other feeds.
                    with MODEL_TURN:
                        ret, frame = self._file_frame(duration_ms) if duration_ms else self._live_frame(fps)
                        if ret:
                            captured_at = time.time()
                            try:
                                person_count, density = counter.count(frame)
                            except Exception as e:
                                print(f"Counting error for {self.feed_id}: {e}")
                                person_count = None

                if not ret:
                    print(f"No frame from {self.feed_id}, reconnecting...")
                    self.cap.release()
                    time.sleep(2)
                    self.cap = self._open()
                    if not self.cap.isOpened():
                        self.retry_count += 1
                        if self.retry_count >= self.max_retries:
                            print(f"Max retries reached for {self.feed_id}")
                            break
                        time.sleep(5)
                    continue

                self.retry_count = 0
                next_analysis = time.time() + ANALYSIS_INTERVAL
                if person_count is None:
                    continue

                self.current_count = person_count
                self.latest_frame, self.latest_density = frame, density
                self.analysed_at = captured_at
                self._log_data(person_count, captured_at)

        except Exception as e:
            print(f"Error processing {self.feed_id}: {e}")
        finally:
            if self.cap:
                self.cap.release()
            gc.collect()

    def _file_frame(self, duration_ms):
        """Frame of a looping video file at the current wall-clock position."""
        self.cap.set(cv2.CAP_PROP_POS_MSEC, self.playback_ms(duration_ms))
        ret, frame = self.cap.read()
        if not ret:  # seek past the last keyframe; restart from the top
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()
        return ret, frame

    def _live_frame(self, fps):
        """Newest frame of a live stream: skip whatever buffered while we waited for our turn."""
        deadline = time.time() + 2.0
        while time.time() < deadline:
            started = time.time()
            if not self.cap.grab():
                return False, None
            if time.time() - started > 0.5 / fps:  # had to wait for this frame, so it is live
                break
        return self.cap.retrieve()

    def _log_data(self, count, captured_at):
        timestamp = datetime.fromtimestamp(captured_at, timezone.utc)
        density_percentage = (count / self.config['max_capacity']) * 100

        alert_level = "normal"
        if density_percentage >= alert_threshold:
            alert_level = "critical"
        elif density_percentage >= congestion_threshold:
            alert_level = "warning"

        data_point = {
            "ts": captured_at,
            "timestamp": timestamp.isoformat(),
            "count": count,
            "density_percentage": round(density_percentage, 2),
            "alert_level": alert_level,
            "location": self.config['location'],
            "area": self.config['area']
        }
        analytics_data[self.feed_id].append(data_point)

        feeds_data[self.feed_id] = {
            "name": self.config['name'],
            "current_count": count,
            "max_capacity": self.config['max_capacity'],
            "density_percentage": round(density_percentage, 2),
            "alert_level": alert_level,
            "last_updated": timestamp.isoformat(),
            "location": self.config['location'],
            "area": self.config['area']
        }

    def stop_processing(self):
        self.running = False
        if self.cap:
            self.cap.release()


# ─────────────────────────────────────────────────────────────
# Initialize Feed Processors
# ─────────────────────────────────────────────────────────────
feed_processors = {}
for feed_id, config in CCTV_FEEDS.items():
    feed_processors[feed_id] = FeedProcessor(feed_id, config)

# ─────────────────────────────────────────────────────────────
# Shared preview frames (one reader per camera, shared by every viewer)
# ─────────────────────────────────────────────────────────────
PREVIEW_FPS = float(os.environ.get("PREVIEW_FPS", "4"))   # JPEGs per second per camera
PREVIEW_WIDTH = 640


class PreviewReader:
    """Decodes one camera in a background thread and keeps its latest frame as JPEG.

    Snapshots and MJPEG streams read these bytes, so video work stays at one reader per
    camera however many browsers watch, and no request ever opens the video itself (that
    used to block the server once per viewer, which jammed Cloud Run).
    """

    def __init__(self, feed_id, config):
        self.feed_id, self.url = feed_id, config["url"]
        self.jpeg = None          # latest frame, plain
        self.overlay_jpeg = None  # latest frame with the density heatmap and count
        self.updated = 0.0
        self.running = False

    def start(self):
        self.running = True
        threading.Thread(target=self._run, name=f"preview-{self.feed_id}", daemon=True).start()

    def stop(self):
        self.running = False

    def _run(self):
        proc = feed_processors[self.feed_id]
        while self.running:
            cap = cv2.VideoCapture(self.url)
            if not cap.isOpened():
                cap.release()
                time.sleep(5)
                continue
            src_fps = cap.get(cv2.CAP_PROP_FPS) or 15
            step = max(1, round(src_fps / PREVIEW_FPS))  # decode every frame, encode every `step`-th
            n = 0
            started = time.time()
            while self.running:
                if not cap.grab():
                    break  # end of a video file (or a dropped stream): reopen and loop
                n += 1
                if n % step == 0:
                    ok, frame = cap.retrieve()
                    if ok:
                        self._publish(frame, proc)
                # Play files in real time instead of as fast as they decode.
                wait = started + n / src_fps - time.time()
                if wait > 0:
                    time.sleep(wait)
            cap.release()

    def _publish(self, frame, proc):
        h, w = frame.shape[:2]
        frame = cv2.resize(frame, (PREVIEW_WIDTH, round(PREVIEW_WIDTH * h / w)))
        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
        if ok:
            self.jpeg = buf.tobytes()
        if proc.latest_density is not None:
            try:
                over = render_density_overlay(frame.copy(), proc.latest_density, proc.current_count)
                ok, buf = cv2.imencode(".jpg", over, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ok:
                    self.overlay_jpeg = buf.tobytes()
            except Exception:
                pass
        self.updated = time.time()

    def frame(self, overlay=False):
        return (self.overlay_jpeg or self.jpeg) if overlay else self.jpeg


preview_readers = {fid: PreviewReader(fid, cfg) for fid, cfg in CCTV_FEEDS.items()}



# ─────────────────────────────────────────────────────────────
# Lifespan (replaces deprecated @app.on_event)
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    print("🚀 Starting Crowd Monitoring API...")
    print("📹 Initializing video feeds...")
    check_video_setup()
    print("🔄 Starting feed processors...")
    for processor in feed_processors.values():
        processor.start_processing()
    for reader in preview_readers.values():
        reader.start()
    print("✅ API startup completed!")
    print("📊 Available endpoints:")
    print("   - Health Check:  GET /api/health")
    print("   - All Feeds:     GET /api/feeds")
    print("   - Video Stream:  GET /api/video/stream/{feed_id}")
    print("   - Analytics:     GET /api/analytics/summary")
    port = os.environ.get("PORT", "5000")
    print(f"   - Swagger UI:    http://localhost:{port}/docs")


    yield  # App runs here

    # ── Shutdown ──
    print("🛑 Shutting down feed processors...")
    for processor in feed_processors.values():
        processor.stop_processing()
    for reader in preview_readers.values():
        reader.stop()
    print("✅ Shutdown complete.")


# ─────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────
app = FastAPI(title="Crowd Monitoring API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(attendees_router.router)
app.include_router(venue_router.router)
app.include_router(admin_router.router)
app.include_router(reports_router.router)


# ─────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────
def create_error_frame(message):
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame.fill(50)
    try:
        cv2.putText(frame, message, (50, 240), cv2.FONT_HERSHEY_SIMPLEX,
                    1, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(frame, "Reconnecting...", (50, 280), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, (200, 200, 200), 1, cv2.LINE_AA)
    except Exception:
        pass
    return frame


# ─────────────────────────────────────────────────────────────
# API Routes
# ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "model": counter.name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "active_feeds": len([f for f in feed_processors.values() if f.running])
    }


@app.get("/api/feeds")
async def get_all_feeds():
    """Feeds that have been counted at least once. `age_seconds` = how old the count is."""
    now = time.time()
    feeds = {
        fid: {**data, "age_seconds": round(now - feed_processors[fid].analysed_at)}
        for fid, data in list(feeds_data.items())
        if feed_processors[fid].analysed_at
    }
    return {
        "feeds": feeds,
        "total_count": sum(feed.get("current_count", 0) for feed in feeds_data.values()),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/feeds/{feed_id}")
async def get_feed_details(feed_id: str):
    if feed_id not in feeds_data:
        return JSONResponse(status_code=404, content={"error": "Feed not found"})
    return {
        "feed": feeds_data[feed_id],
        "recent_analytics": list(analytics_data[feed_id])[-10:],
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/video/health/{feed_id}")
async def check_feed_health(feed_id: str):
    if feed_id not in CCTV_FEEDS:
        return JSONResponse(status_code=404, content={"error": "Feed not found"})
    try:
        cap = cv2.VideoCapture(CCTV_FEEDS[feed_id]['url'])
        is_opened = cap.isOpened()
        if is_opened:
            ret, frame = cap.read()
            cap.release()
            return {
                "feed_id": feed_id,
                "status": "healthy" if ret else "unhealthy",
                "accessible": True,
                "can_read_frame": ret,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        else:
            cap.release()
            return {
                "feed_id": feed_id,
                "status": "unhealthy",
                "accessible": False,
                "can_read_frame": False,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
    except Exception as e:
        return {
            "feed_id": feed_id,
            "status": "error",
            "accessible": False,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


@app.get("/api/video/stream/{feed_id}")
async def get_video_stream(feed_id: str, request: Request, overlay: bool = False):
    """MJPEG stream from the camera's shared preview frames (`?overlay=true` adds the density
    heatmap and count). Async and thread-free: an open stream costs almost nothing."""
    if feed_id not in CCTV_FEEDS:
        return JSONResponse(status_code=404, content={"error": "Feed not found"})
    reader = preview_readers[feed_id]

    async def frames():
        last = None
        while not await request.is_disconnected():
            jpeg = reader.frame(overlay)
            if jpeg is not None and jpeg is not last:
                last = jpeg
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
            await asyncio.sleep(1 / PREVIEW_FPS)

    return StreamingResponse(
        frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"},
    )


@app.get("/api/video/snapshot/{feed_id}")
async def get_video_snapshot(feed_id: str, overlay: bool = False):
    """Latest JPEG of the camera from its shared preview reader (`?overlay=true`: with the
    density heatmap and count). Returns at once; never opens the video."""
    if feed_id not in CCTV_FEEDS:
        return JSONResponse(status_code=404, content={"error": "Feed not found"})
    jpeg = preview_readers[feed_id].frame(overlay)
    if jpeg is None:
        return JSONResponse(status_code=503, content={"error": "Camera starting, try again shortly"})
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/video/info")
async def get_video_info():
    video_info = {}
    for feed_id, config in CCTV_FEEDS.items():
        try:
            cap = cv2.VideoCapture(config['url'])
            if cap.isOpened():
                fps = cap.get(cv2.CAP_PROP_FPS)
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                video_info[feed_id] = {
                    "name": config['name'],
                    "resolution": f"{width}x{height}",
                    "fps": fps,
                    "duration_seconds": frame_count / fps if fps > 0 else 0,
                    "total_frames": frame_count,
                    "status": "active"
                }
            else:
                video_info[feed_id] = {
                    "name": config['name'],
                    "status": "inactive",
                    "error": "Cannot open video source"
                }
            cap.release()
        except Exception as e:
            video_info[feed_id] = {
                "name": config['name'],
                "status": "error",
                "error": str(e)
            }
    return {"video_info": video_info}


@app.get("/api/analytics/summary")
async def get_analytics_summary():
    total_current = sum(feed.get("current_count", 0) for feed in feeds_data.values())
    total_capacity = sum(CCTV_FEEDS[feed_id]["max_capacity"] for feed_id in CCTV_FEEDS)
    alert_counts = {"critical": 0, "warning": 0, "normal": 0}

    for feed in feeds_data.values():
        alert_counts[feed.get("alert_level", "normal")] += 1

    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    trend_data = []
    for feed_id, data_points in analytics_data.items():
        for point in data_points:
            if datetime.fromisoformat(point["timestamp"]) >= one_hour_ago:
                trend_data.append({
                    "feed_id": feed_id,
                    "feed_name": CCTV_FEEDS[feed_id]["name"],
                    **point
                })

    return {
        "summary": {
            "total_current_count": total_current,
            "total_capacity": total_capacity,
            "overall_density": round((total_current / total_capacity) * 100, 2) if total_capacity else 0,
            "alert_distribution": alert_counts,
            "active_feeds": len([f for f in feed_processors.values() if f.running])
        },
        "trend_data": trend_data,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/alerts")
async def get_current_alerts():
    alerts = [
        {
            "feed_id": fid,
            "feed_name": data["name"],
            "alert_level": data["alert_level"],
            "current_count": data["current_count"],
            "density_percentage": data["density_percentage"],
            "location": data["location"],
            "area": data["area"],
            "timestamp": data["last_updated"]
        }
        for fid, data in feeds_data.items()
    ]
    return {"alerts": alerts, "count": len(alerts), "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/heatmap")
async def get_heatmap_data():
    heatmap_data = [
        {
            "feed_id": feed_id,
            "location": data["location"],
            "intensity": data.get("density_percentage", 0),
            "count": data.get("current_count", 0),
            "area": data["area"],
            "name": data["name"],
            "alert_level": data.get("alert_level", "normal")
        }
        for feed_id, data in feeds_data.items()
    ]
    return {"heatmap": heatmap_data, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/predictions")
async def get_crowd_predictions():
    """15/30-minute forecast per feed from the trend of the last PREDICTION_WINDOW_MIN minutes.

    A feed is left out until it has enough history (6 counts over at least 3 minutes).
    """
    now = time.time()
    predictions = {}
    for feed_id, data_points in list(analytics_data.items()):
        f = forecast_feed(
            [(p["ts"], p["count"]) for p in list(data_points)],
            capacity=CCTV_FEEDS[feed_id]["max_capacity"],
            critical_pct=alert_threshold,
            warning_pct=congestion_threshold,
            now=now,
            window_min=PREDICTION_WINDOW_MIN,
        )
        if f is None:
            continue
        predictions[feed_id] = {
            "feed_name": CCTV_FEEDS[feed_id]["name"],
            "current": f.current,
            "trend_per_min": f.trend_per_min,
            "predictions": f.predicted,
            "predicted_pct": f.predicted_pct,
            "minutes_to_critical": f.minutes_to_critical,
            "risk_level": f.risk_level,
            "reason": f.reason,
            "samples": f.samples,
            "window_minutes": f.window_minutes,
        }
    return {"predictions": predictions, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/export/csv")
async def export_data_csv():
    try:
        all_data = []
        for feed_id, data_points in analytics_data.items():
            for point in data_points:
                all_data.append({
                    "feed_id": feed_id,
                    "feed_name": CCTV_FEEDS[feed_id]["name"],
                    **point
                })
        df = pd.DataFrame(all_data)
        buffer = io.StringIO()
        df.to_csv(buffer, index=False)
        buffer.seek(0)
        return Response(
            content=buffer.read(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=crowd_analytics_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/controls/start")
async def start_monitoring():
    try:
        for processor in feed_processors.values():
            if not processor.running:
                processor.start_processing()
        return {"message": "Monitoring started", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/controls/stop")
async def stop_monitoring():
    try:
        for processor in feed_processors.values():
            processor.stop_processing()
        return {"message": "Monitoring stopped", "timestamp": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/config/thresholds")
async def get_thresholds():
    return {
        "alert_threshold": alert_threshold,
        "congestion_threshold": congestion_threshold,
        "unit": "percent_of_max_capacity"
    }


@app.post("/api/config/thresholds")
async def update_thresholds(body: Dict[str, int] = Body(...)):
    global alert_threshold, congestion_threshold
    if "alert_threshold" in body:
        alert_threshold = int(body["alert_threshold"])
    if "congestion_threshold" in body:
        congestion_threshold = int(body["congestion_threshold"])
    return {
        "message": "Thresholds updated",
        "alert_threshold": alert_threshold,
        "congestion_threshold": congestion_threshold
    }


@app.get("/api/stream/updates")
async def stream_updates():
    def event_stream():
        while True:
            data = {
                "feeds": feeds_data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            yield f"data: {json.dumps(data)}\n\n"
            time.sleep(2)
    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 5000))
    # Disable reload in production to reduce container overhead
    reload = os.environ.get("ENV") != "production"
    uvicorn.run("app:app" if reload else app, host="0.0.0.0", port=port, reload=reload)