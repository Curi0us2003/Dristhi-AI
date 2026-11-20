# Dristhi AI: session handoff, 20 Nov 2026 (Firestore → Cloud SQL)

Summary of a Claude Code session so the work can continue in a new session. To pick it up, start
with:

> Read CLAUDE.md, docs/architecture.md and docs/sessions/2026-11-20-cloud-sql-session.md, then continue.

## Where things stand

- **Branch:** `feat/cloud-sql-admin-data`, pushed. **PR:** Curi0us2003/Dristhi-AI#10 into `main`,
  open for review, no CI on the repo.
- **`main`** already has Curi0us2003's PR #9 (two hosting sites and the venue map, branch
  `integrate/hosting-sites-venue-map`, last commit `a45c730`). This branch is built on top of it.
- **Cloud SQL** (`dhristi-ai-buildathon:asia-south1:dristhi-fdc`, database `dristhi`) is on
  migration **0003**, applied from this branch. Pull this branch before running `alembic upgrade`
  from any other branch.

## What was done

1. **Reviewed `feat/two-hosting-sites`.** One build deployed to two Firebase Hosting sites
   (`admin`, `attendee`) with redirects in `frontend/firebase.json`, `npm run deploy:admin` /
   `deploy:attendee`, `NEXT_PUBLIC_ATTENDEE_URL`. It is merged into `main` through PR #9.
2. **Restyled the admin login page** (`frontend/src/app/login/page.jsx`) to the light design system:
   plain white panel, teal accent, the sidebar's brand mark; removed the logo image, scanline,
   particles and glows. `/login` no longer forces the dark theme (`app-theme-provider.jsx`).
3. **Removed Firestore. All data is in Cloud SQL behind the FastAPI backend.** Firebase is only the
   sign-in provider.
   - **Migration `backend/migrations/versions/0003_admin_app.py`:**
     - `events`: venue `location` (point), `warning_pct`, `critical_pct`, `people_per_guard`
     - `zones`: `min_guards`, `feed_id` (CCTV feed, `feeds.json` key); `polygon` now optional
     - new `admins`, `staff`, `grievances`, `dispatches`, `notifications`
     - `staff` is one roster for guards, supervisors, medics, doctors, ambulances, volunteers
       (`kind`), with `status` available / dispatched / on_scene / off_duty, `zone_id`, `location`.
       This matches the existing screens. Splitting guards, medical staff and ambulances into
       separate tables was discussed; ask the teammate if they want that.
   - **Backend:** `dristhi/auth.py` (verifies the Firebase ID token, finds the admin by uid or email
     and links the uid), `routers/admin.py` (admin login check, events, zones, staff, staff moves,
     reports, notifications; scoped to the admin's organization), `routers/reports.py` (attendee
     reports, notifications, missing-person alerts; attendee identified by the `X-Device-Id` it
     joined with), `scripts/create_admin.py`, `tests/test_admin_api.py`. New dependency
     `firebase-admin`.
   - **Frontend:** `src/lib/api.js` (backend client; polling every 5 s plus refresh after each
     change replaces Firestore listeners). `src/lib/admin-data.js` keeps its function names, so
     setup, Command and roster screens did not change. Login, Reports, Dashboard, nav badge,
     autonomous agent and the attendee hooks call the backend. Removed `firestore.rules`, the
     Firestore seed scripts and emulator, and the Firestore caches on Alerts, Live cameras, Venue
     map and Dashboard.
   - **Docs:** `docs/architecture.md` data model and `docs/admin-app.md` updated.

## How to run locally (macOS)

Four things run at once; each in its own terminal tab.

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
cd frontend && npm run dev
```

After each emulator start, create the admin's sign-in account once:

```bash
cd frontend && npm run seed:emulator
```

- `gcloud` and `cloud-sql-proxy` are installed in `~/google-cloud-sdk` and on PATH through
  `~/.zshrc`; application-default credentials are set for `dhristi-ai-buildathon`.
- `backend/.env` (git-ignored) needs `DATABASE_URL`, `TEST_DATABASE_URL`, `PUBLIC_APP_URL`,
  `FIREBASE_PROJECT_ID=demo-dristhi` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (see
  `backend/.env.example`).
- `frontend/.env` (git-ignored) needs `NEXT_PUBLIC_USE_EMULATORS=true` and
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-dristhi` (or empty), `NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:5000`.
- **Login:** http://127.0.0.1:9002/login with username `control`, employee ID `EMP001`; email and
  password are in `frontend/scripts/seed-emulator.mjs`. The admin row is in Cloud SQL (re-create
  with `backend/scripts/create_admin.py` if needed).
- Checks: `cd backend && pytest -q` (21 tests; needs `TEST_DATABASE_URL`) and
  `cd frontend && npm run build`. Running `npm run build` overwrites the dev server's `.next`
  folder: stop `npm run dev`, delete `frontend/.next`, start it again.

## Known problems

- **Dashboard and Live cameras show no data.** `backend/videos/` (the demo CCTV clips) does not
  exist on this Mac: it is git-ignored and built by `backend/tools/make_demo_videos.py`, which
  downloads the ShanghaiTech crowd dataset from Hugging Face. Every feed logs
  `Failed to open video stream`, so counts, density, alerts and trends are 0. The teammate had not
  yet approved running the download. After it runs, restart the backend.
- **No staff or reports in Cloud SQL yet.** The Firestore demo data was not migrated; the demo event
  only has its zones and map facilities. Either add staff in Event setup → Staff or write a small
  Cloud SQL seed script (guards, medics, ambulances, a few reports) for the demo event.
- **Cloud SQL allows only 25 connections** (about 11 used by Cloud SQL itself). The test
  `test_concurrent_joins_get_distinct_numbers` only passes with the local backend stopped. Resize
  the instance before a real event (HUMAN step).
- **Not yet clicked through in a browser:** Command, Reports, Alerts, Live cameras, Venue map and the
  attendee app on the new backend. Checked: login, Dashboard load, adding staff in Event setup.
- In the in-app browser pane, use `127.0.0.1:9002`, not `localhost:9002`: clearing site storage
  there left the `localhost` origin's Firebase IndexedDB stuck.
- When stopping the backend, the process shows as `Python app.py` (capital P); stop it by port
  (`lsof -t -iTCP:5000 -sTCP:LISTEN`) rather than `pkill -f "python app.py"`.

## Next steps

1. Decide on the demo CCTV clips download, then run `python tools/make_demo_videos.py` in `backend/`.
2. Seed the Cloud SQL demo event with staff and reports.
3. Click through every operator page and the attendee app; fix what breaks.
4. Admin features still to build: venue pin (lat/lng) inputs in Event setup → Event (the API already
   accepts `lat`/`lng`), a "Generate QR for attendees" button (the event `slug` gives the
   `/join?e=<slug>` link; `backend/scripts/make_event_qr.py` makes the image), washroom and facility
   points editing on the map (`pois` table exists).
5. HUMAN: real Firebase web config in `frontend/.env` and `FIREBASE_PROJECT_ID=dhristi-ai-buildathon`
   in the backend to sign in without the emulator; resize the Cloud SQL instance.
6. Optional: delete `frontend/dataconnect/` (unused Firebase Data Connect schema).
