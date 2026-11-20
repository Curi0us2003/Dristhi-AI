# Dristhi AI: session handoff, 20–21 Nov 2026 (Cloud SQL, deployment, production fixes)

Summary of a long Claude Code session so the work can continue in a new session. Start with:

> Read CLAUDE.md, docs/architecture.md and docs/sessions/2026-11-20-cloud-sql-session.md, then continue.

## Update, 21 Nov 2026 night (supersedes "Deployed vs not" below)

- **Everything is deployed.** Cloud Run revision 8 (image `ccb1aff` with `INFERENCE_THREADS=1`,
  `DENSITY_MAX_SIDE=768`); Firebase Hosting has the snapshot-based Live cameras page. Old revisions
  2–6 were deleted: they kept an instance each alive (leaked streams), held 22 of the ~14 usable
  database connections and made report actions fail with 500.
- **Load test** (5 min: 8 snapshots/s + dashboard + map polling against the live backend): 2,702
  requests, all 200, median 120–140 ms, max 0.3 s, no 429.
- **Trade-off:** counts refresh every ~2.5 min per camera, so the 15/30-min forecast appears about
  15 min after a backend start. Restart the backend 30+ min before a demo. More headroom: 4 vCPU
  with `INFERENCE_THREADS=2` for the demo window only.
- **Main** already had the CORS/UTC fix as `b441ec1` (same change as `bf0d6e2`), so this branch was
  rebased onto it.
- **Teammates:** `docs/run-locally.md` (also as a PDF on the owner's Desktop) explains running locally.

## Where things stand (21 Nov 2026)

- **Live:**
  - Admin console: https://dhristi-ai-buildathon.web.app
  - Attendee app: https://dhristi-ai-attendee.web.app/join?e=demo
  - Backend (Cloud Run, asia-south1): https://crowd-monitoring-api-954199733576.asia-south1.run.app
- **GitHub `main`** has PRs #10 (Firestore → Cloud SQL), #11 (admin venue map, Cloudinary feeds,
  attendee QR, agent panel removed), #12 (deploy to Cloud Run + Hosting) and Curi0us2003's
  "Fresh crowd counts and a real-time 15/30-minute forecast". **`main`'s `backend/app.py` is broken**
  (see problem 4); do not deploy from `main` until the branch below is merged.
- **Local branch `fix/restore-cors-utc` (not pushed)** holds the production fixes, on top of `main`:

  | Commit | Fix |
  | --- | --- |
  | `bf0d6e2` | Restore CORS, UTC timestamps and heatmap `feed_id` lost in a merge |
  | `f359a5e` | Serve camera video from one shared reader per camera |
  | `aadd2ee` | Stop Live cameras from leaking video streams on Cloud Run |
  | `2e9a569` | Cap each backend's database pool at 10 connections |
  | (this file) | Session notes |

  Next: push it and open a PR into `main`.
- **Deployed vs not:** Cloud Run runs `f359a5e` (revision 5). `aadd2ee` and `2e9a569` are **not
  deployed yet**, and the frontend fix in `aadd2ee` (Live cameras snapshots) is not on Hosting yet.
- **Cloud SQL** (`dhristi-ai-buildathon:asia-south1:dristhi-fdc`, db `dristhi`) is on migration
  **0003**. 25 connections in total.

## Deploy steps still to run (in order)

```bash
gcloud run services update crowd-monitoring-api --region asia-south1 --project dhristi-ai-buildathon --concurrency 1000
```

Close every open Live cameras tab (old page code keeps leaking streams), then:

```bash
cd ~/Dristhi-AI/backend && ./deploy.sh -p dhristi-ai-buildathon
```

```bash
cd ~/Dristhi-AI/frontend && npm run deploy
```

Then check: `/api/health` 200, a Live cameras tab left open for 5+ minutes does not make the backend
return 429, counts and the 15/30-min forecast appear about 5 minutes after the backend starts.

HUMAN: Google Maps API key (Cloud Console → APIs & Services → Credentials) must list
`https://dhristi-ai-buildathon.web.app/*` and `https://dhristi-ai-attendee.web.app/*` under Website
restrictions; same for the Gemini key if it has website restrictions.

## What was done (in order)

1. **Two Hosting sites** (`feat/two-hosting-sites`, merged in #9): one build, `admin` and `attendee`
   targets with redirects in `frontend/firebase.json`.
2. **Login page restyle** to the light design system.
3. **Firestore removed; all data in Cloud SQL** (#10). Migration `0003_admin_app`: `events`
   (venue location, thresholds), `zones` (`min_guards`, `feed_id`, optional `polygon`), new `admins`,
   `staff` (one roster with `kind`), `grievances`, `dispatches`, `notifications`. Backend:
   `dristhi/auth.py` (Firebase token → admin in Cloud SQL), `routers/admin.py`, `routers/reports.py`
   (attendee via `X-Device-Id`), `scripts/create_admin.py`. Frontend: `src/lib/api.js`, polling
   instead of listeners.
4. **Admin venue map from Cloud SQL** (#11): zones and facilities from `/api/events/{id}/venue-map`,
   coloured by live camera counts; cameras without a zone outline are drawn as labelled pins at
   their `feeds.json` position. `feeds.json` now uses Cloudinary video URLs.
5. **Removed** the Autonomous Command Agent panel; **restyled** the AI Intel Summary dialog
   (`components/admin/summary-content.jsx`).
6. **Demo zones linked to cameras** (`demo_venue.geojson` `feed_id`; `seed_demo.py` fills missing
   links without recreating zones).
7. **Deployment** (#12): `backend/deploy.sh` / `deploy.ps1` (asia-south1, commit-tagged image,
   Cloud SQL connector, `DATABASE_URL` from Secret Manager `dristhi-database-url`,
   `CORS_ORIGINS` = both Hosting sites, one always-on instance), `scripts/scale.sh` up/down,
   `backend/.gcloudignore`, Cloud Function proxy removed (browser calls Cloud Run directly).
   One-time cloud setup done: APIs, Artifact Registry `crowd-monitoring`, secret, IAM roles,
   Firebase Email/Password sign-in, Hosting site `dhristi-ai-attendee`, authorized domains, web app
   "Dristhi web".
8. **Teammate's forecast merged** (`backend/forecast.py`, Theil-Sen trend, 15/30-min horizons, no
   forecast until 6 counts over 3 minutes; feeds take turns on the model so counts are fresh).
9. **Deck material:** tech stack doc (Claude Docs artifact "Dristhi AI: Technology Stack"), six
   slide-10 screenshots in `deck-screenshots/` (untracked; do not commit),
   `docs/demo/demo-staff.csv` (50 demo staff for the roster CSV import).

## Problems found in production and how they were fixed

1. **"Updated 330 min ago" on the attendee app.** Cloud Run runs in UTC and the backend used naive
   `datetime.now()`; browsers in India read the times as local. Fix: every timestamp is
   timezone-aware UTC (`+00:00`) (`7e37b09`, restored again in `bf0d6e2`).
2. **`.env` and `.venv` would be uploaded to Cloud Build.** `backend/` had no `.gcloudignore`, so
   `gcloud builds submit` sent the database password and the 685 MB virtualenv to the build bucket.
   Fix: `backend/.gcloudignore` (`ebcb6b2`).
3. **Command page showed "No camera data".** Demo zones in Cloud SQL had no `feed_id`. Fix: linked
   in the GeoJSON and backfilled by `seed_demo.py`.
4. **A merge undid three fixes.** Merging `main` into `fix/crowd-counts-and-forecast` kept the
   branch's `backend/app.py`: CORS back to `*`, naive timestamps, `feed_id` gone from `/api/heatmap`.
   The new `datetime.fromtimestamp(captured_at)` was naive too. Fix: `bf0d6e2`. **Lesson:** when
   merging `main` into a branch, resolve `app.py` conflicts by combining both sides, and check
   `grep -n "allow_origins\|datetime.now()" backend/app.py` before pushing.
5. **Backend "down" (HTTP 429 "Rate exceeded") several times.** Not a crash: the single Cloud Run
   instance had all its request slots (160) taken, so new requests were refused. Causes, in the
   order they were found:
   - Every MJPEG stream and every snapshot opened its own copy of the Cloudinary video; streams
     held a worker thread for up to an hour and snapshots downloaded inside the event loop, so a
     few viewers froze the server. Fix `f359a5e`: `PreviewReader`, one background reader per
     camera keeping the latest JPEG (plain and overlay); snapshot returns it at once, stream is an
     async generator. Local load test: 48 streams + snapshot bursts, health 1–3 ms.
   - The Live cameras page's "frozen stream" watchdog: an `<img>` MJPEG stream fires `load` only for
     the first frame, so after 10 s the page reopened all 8 streams, every 10 s. Cloud Run does not
     always tell the backend a viewer left, so abandoned streams kept their slots: one open tab
     filled 160 slots in about 3 minutes. Fix `aadd2ee`: Live cameras polls snapshots (1 s, density
     overlay 2.5 s); streams end after `STREAM_MAX_SECONDS` (120); `--concurrency 1000`.
   - Quick recovery when it happens: `gcloud run services update crowd-monitoring-api --region
     asia-south1 --project dhristi-ai-buildathon --update-env-vars RESTARTED_AT=$(date +%s)`
     (new revision, clears stuck requests; counts and forecast refill in about 5 minutes).
6. **Cloud SQL out of connections** ("remaining connection slots are reserved"). The instance allows
   25 connections; ~11 are Cloud SQL's own and each backend pool could open 25. Fix `2e9a569`: pool
   5 + 5 (`DB_POOL_SIZE`, `DB_MAX_OVERFLOW`). The concurrency test
   (`test_concurrent_joins_get_distinct_numbers`) still needs the local backend stopped.
7. **Venue map blank on the live sites.**
   - Google Maps `RefererNotAllowedMapError`: the Maps key only allowed `localhost:9002` and
     `192.168.0.7:9002`. HUMAN fix above.
   - A second event, also named "Dristhi Demo Event" (venue KTPO, slug
     `dristhi-demo-event-4a43a2`), was created from Event setup on the live site. Its 8 zones have
     cameras but no outlines and no facilities (Event setup cannot draw them), so the map shows only
     camera pins. The original event (slug `demo`, venue Phoenix Marketcity) has outlines and 15
     facilities. Both look the same in the event selector; rename one.
8. **Admin sign-in 403 on the live site.** Password was right; username/employee ID were the demo
   ones. Live login: username `arkajyoti`, employee ID `EMP002`, the email/password created in
   Firebase Authentication. The demo `control` / `EMP001` exists only in the local emulator.
9. **Counts on Cloud Run are 10–55 s old** (8 cameras take turns on 2 vCPU), so the forecast needs
   about 5 minutes after each start. Faster: 4 vCPU or `DENSITY_MAX_SIDE=768`.
10. **Demo clips loop every 60 s from quiet to packed**, so all cameras swing together and the
    forecast trend looks steep ("189% in 15 min"). Real feeds will not loop.

## How to run locally (macOS)

Five things: Cloud SQL proxy, backend, Auth emulator, seed, frontend.

```bash
cloud-sql-proxy dhristi-ai-buildathon:asia-south1:dristhi-fdc --port 5433
```

```bash
cd backend && .venv/bin/python app.py
```

```bash
cd frontend && npm run emulators
```

```bash
cd frontend && npm run seed:emulator
```

```bash
cd frontend && cp .env.local-dev .env && npm run dev
```

- **`frontend/.env` is currently the production one** (Cloud Run URL, real Firebase, emulators off).
  `frontend/.env.local-dev` holds the local settings. Copy production back before `npm run deploy`;
  a deploy built from the local `.env` would point both sites at `127.0.0.1`.
- `backend/.env`: `DATABASE_URL`, `TEST_DATABASE_URL`, `PUBLIC_APP_URL`,
  `FIREBASE_PROJECT_ID=demo-dristhi`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`; optional
  `CORS_ORIGINS` (add a LAN address to test from a phone).
- Local login: `control` / `EMP001`, email and password in `frontend/scripts/seed-emulator.mjs`.
- In the in-app browser pane use `127.0.0.1:9002` (the `localhost` origin's storage got stuck);
  the Maps key does not allow `127.0.0.1` unless added.
- The backend runs with auto-reload in development; editing backend files while video is open can
  hang the reload ("Waiting for connections to close"). Stop it by port:
  `lsof -t -iTCP:5000 -sTCP:LISTEN | xargs kill -9`. `pkill -f "python app.py"` misses it (the
  process is `Python app.py`).
- `npm run build` overwrites the dev server's `.next`; restart `npm run dev` after a build.
- Checks: `cd backend && pytest -q -k "not concurrent"` (29 tests) and `cd frontend && npm run build`.

## Next steps

1. Run the deploy steps above; verify Live cameras open for several minutes; record the
   submission video.
2. Push `fix/restore-cors-utc` and open a PR into `main`.
3. KTPO: real coordinates for the 8 cameras (`feeds.json`), zone outlines and facilities
   (`demo_venue.geojson` or a new GeoJSON + `seed_demo.py --reset-venue`), or the venue map editor
   from the roadmap.
4. Before a real event: bigger Cloud SQL tier, real camera capacities in `feeds.json`, budget and
   `scale.sh down` when idle, task 08 (Gemini from the backend, key out of the browser).
