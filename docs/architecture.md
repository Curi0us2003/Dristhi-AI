# Target architecture and decisions

This is the design the task files build toward. If a task and this file disagree, follow the
task and point out the conflict in your report.

## At a glance

```
Operators (laptop) ─┐                         ┌─ Google Maps JS API (browser)
Attendees (phone) ──┼─► Firebase Hosting (static Next.js app)
                    ├─► Firebase Auth (email, Google, phone SMS code)
                    └─► Cloud Run: FastAPI backend (asia-south1) ◄── cameras / demo videos
                           ├─ REST API + Server-Sent Events (checks Firebase ID token + role)
                           ├─ Chatbot + AI agent (Gemini on Vertex AI, function calling)
                           └─ Camera analysis (OpenCV people counter, one thread per camera)
                                 │
                 Cloud SQL Postgres + PostGIS · Cloud Storage · Vertex AI · Secret Manager
```

## Decisions

| Area | Decision | Why |
| --- | --- | --- |
| Backend hosting | FastAPI on Cloud Run, `asia-south1`, CPU always allocated during events | HTTPS built in, no servers, scale to zero between events |
| Frontend hosting | Firebase Hosting, static export, calls the Cloud Run URL directly | Free tier; the Cloud Function proxy is removed |
| People counting | OpenCV-based model from Hugging Face behind one function `count_people(frame) -> int` | Smaller image than PyTorch; licence must allow commercial use |
| Database | Cloud SQL for PostgreSQL 16 + PostGIS; SQLAlchemy 2 + GeoAlchemy2; Alembic migrations | Relational, multi-event data; map queries like nearest washroom |
| Firestore | Not used. Firebase is only the sign-in provider; every read and write goes through the backend to Cloud SQL | One source of truth |
| Live updates | Server-Sent Events from the backend | Already exists at `/api/stream/updates` |
| Files | Cloud Storage (videos, report photos, model files); signed URLs | No base64 images in database rows |
| AI | Gemini on Vertex AI via the `google-genai` SDK (`vertexai=True`), called only from the backend | No API key in the browser; uses the service account |
| Auth | Firebase Auth on the client; backend verifies ID tokens with `firebase-admin` | Already integrated |
| Secrets | Secret Manager, mounted as env vars on Cloud Run | No secrets in the repo |

## Backend layout (from task 03 on)

```
backend/
  app.py                 entry point: builds the FastAPI app, starts camera processors
  dristhi/
    config.py            settings from env vars
    db.py                engine, session, Base
    models.py            SQLAlchemy models (tables below)
    auth.py              Firebase token check, role and event guards (FastAPI dependencies)
    detection/
      counter.py         count_people(frame) -> int  (the only place the model is used)
      processor.py       FeedProcessor threads, ProcessorManager (start/stop per camera)
    routers/             one module per resource: events, cameras, zones, guards, passes,
                         grievances, chat, analytics, video
    services/            ai.py (Gemini), storage.py (Cloud Storage), notify.py
  migrations/            Alembic
  tests/                 pytest
```

## Data model

All tables except `organizations` have `event_id` (or reach an event through a parent).
Primary keys are UUIDs; timestamps are `timestamptz`.

| Table | Key columns |
| --- | --- |
| organizations | id, name |
| admins | id, organization_id, firebase_uid, email, username, employee_id, role (`owner` / `operator`) |
| events | id, organization_id, slug (unique, used in the event QR link), name, venue, city, starts_at, ends_at, status (`draft` / `live` / `ended`), attendee_count, location (venue pin, `POINT` 4326), warning_pct, critical_pct, people_per_guard |
| zones | id, event_id, name, capacity, min_guards, feed_id (CCTV camera, `feeds.json` key), polygon? (PostGIS `POLYGON`, SRID 4326). Also the zone list attendees pick from |
| pois | id, event_id, zone_id?, kind (`washroom` / `first_aid` / `exit` / `water` / `lost_found` / `cloak_room` / `help_point` / `stage`), name, location (`POINT`, 4326) |
| cameras | (later) id, event_id, zone_id, name, source_url, max_capacity, location (`POINT`), status. Until then a zone's feed_id names its camera |
| crowd_readings | id, camera_id, event_id, taken_at, count, density_pct, alert_level |
| staff | id, event_id, zone_id?, name, phone?, kind (`guard` / `supervisor` / `medic` / `doctor` / `ambulance` / `volunteer`), status (`available` / `dispatched` / `on_scene` / `off_duty`), location?, updated_at. Guards, medical staff and ambulances in one roster; an ambulance's name is its vehicle number |
| dispatches | id, event_id, staff_id?, staff_name, from_zone_id?/name, to_zone_id?/name, grievance_id?, reason, created_by (admin), created_at |
| attendees | id, event_id, number ("Attendee 12"), device_id, name?, phone?, email?, created_at |
| passes | id, event_id, attendee_id, code_hash, expires_at, claimed_by_uid?, claimed_device_id?, claimed_at? |
| grievances | id, event_id, attendee_id?, type (`Medical Attention` / `Missing Person` / `Lost & Found` / `General`), details, urgency?, location_text?, location (`POINT`)?, person_name?, last_seen?, photo_data_uri? (moves to Cloud Storage later), status (`new` / `resolved`), assigned_staff_*, action_taken, submitted_at |
| notifications | id, event_id, attendee_id, message, created_at, read_at? |

## API conventions

- Prefix `/api`. Resource routes are nested under events where they belong:
  `GET /api/events/{event_id}/zones`, `POST /api/events/{event_id}/cameras`.
- JSON in and out, `snake_case` fields, Pydantic models for every request and response.
- Errors: `{"error": "<code>", "detail": "<human text>"}` with the right HTTP status.
- `GET /api/health` stays public. Everything else needs `Authorization: Bearer <Firebase ID token>`.

## Roles

| Role | Can |
| --- | --- |
| `owner` (org admin) | Create events; everything an operator can do in the org's events |
| `operator` | Read and act on events of their organization: cameras, map, guards, grievances, dispatch |
| `attendee` | Only their own pass, reports and notifications, plus the public map data of their event |

Role is resolved on every request: admin by `admins.firebase_uid`, attendee by `passes.claimed_by_uid`.

**Demo phase (task 07a):** attendees do not sign in. One QR code per event opens
`/join?e=<slug>`; the backend gives each phone the next number ("Attendee 12") and the app keeps
it in `localStorage`. The join routes are the only unauthenticated routes besides
`/api/health`. Task 07 replaces this with personal passes and phone verification.

## Environment variables (backend)

| Name | Example | Notes |
| --- | --- | --- |
| `PORT` | 8080 | Set by Cloud Run |
| `ENV` | production | Disables auto-reload |
| `DATABASE_URL` | `postgresql+psycopg://user:pass@/dristhi?host=/cloudsql/PROJECT:asia-south1:dristhi-db` | From Secret Manager |
| `GCP_PROJECT`, `GCP_REGION` | my-project, asia-south1 | |
| `GCS_BUCKET` | dristhi-media-dev | Photos, videos, models |
| `GEMINI_MODEL` | current Gemini Flash model id | Pick the latest Flash model at implementation time |
| `CORS_ORIGINS` | `https://app.example.com,http://localhost:9002` | Comma-separated |
| `FEEDS_FILE` | backend/feeds.json | Only until cameras live in the database |
| `PUBLIC_APP_URL` | `https://<project>.web.app` | Base of the event QR link `/join?e=<slug>` |

## Limits to design around

- During the demo phase anyone with the event QR link can join as a new attendee. That is
  accepted until task 07.

- QR passes cannot be made fully share-proof: if the holder forwards both the QR and their SMS
  code, software cannot tell. A photo-ID check at the gate covers that.
- Phone GPS is often off by tens of metres indoors; always offer "pick your zone" as a fallback.
- Mass events may have jammed or overloaded mobile networks. Core monitoring must not depend on
  attendee phones (cameras and control room are wired); the attendee app works offline where it
  can and says clearly when something was not sent (task 09).
