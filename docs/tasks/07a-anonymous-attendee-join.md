# 07a — Anonymous attendee join (demo)

**Branches:** `feat/attendee-join-api` (part A), then `feat/attendee-join-app` (part B)
**Depends on:** nothing merged; needs a Postgres database (see HUMAN) · **Size:** medium

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/07a-anonymous-attendee-join.md,
then do part A of task 07a.
```

For the second session, replace "part A" with "part B".

## Goal

The demo flow for attendees, with no sign-in:

```
one QR code for the event ──► /join?e=demo ──► backend gives the next number ──► /user/dashboard
                                                "Attendee 12"                   chat + map
```

- There is **one QR code per event**, printed at the venue. Anyone who scans it can join.
- Each phone gets the next number: Attendee 1, Attendee 2, and so on. Scanning again or
  reloading on the same phone keeps the same number.
- Attendees never see `/login`; that page is for operators only.

This replaces the attendee email/password login for now. Secure, phone-verified personal passes
come later in task 07 (mockup `docs/design/mockups/AttendeePass.dc.html`).

## Part A — backend (`feat/attendee-join-api`)

1. Dependencies in `backend/requirements.txt`: `sqlalchemy>=2,<3`, `psycopg[binary]>=3.2,<4`,
   `alembic>=1.13,<2`, `qrcode[pil]>=7.4,<9`, `python-dotenv>=1,<2`, and `pytest` /
   `httpx` in a new `backend/requirements-dev.txt`.
2. Create the package `backend/dristhi/` with only what this task needs. Do not move existing
   code out of `app.py`; task 03 does that.
   - `config.py`: reads `DATABASE_URL` and `PUBLIC_APP_URL` from the environment
     (`python-dotenv` is fine for local `.env`).
   - `db.py`: engine from `DATABASE_URL`, `SessionLocal`, and a `get_db` FastAPI dependency.
   - `models.py`: three tables from the data model in `docs/architecture.md`:
     - `organizations` (id, name)
     - `events` (id, organization_id, slug unique, name, venue, city, starts_at, ends_at,
       status, attendee_count int default 0)
     - `attendees` (id, event_id, number, device_id, name?, phone?, email?, created_at), with
       unique `(event_id, number)` and unique `(event_id, device_id)`.
   - UUID primary keys, `timestamptz` timestamps.
3. Alembic in `backend/migrations/`, with one migration that creates these three tables.
   Later tasks add tables with new migrations; never edit this one after it is merged.
4. `backend/dristhi/routers/attendees.py`, mounted in `app.py` with `app.include_router(...)`:
   - `POST /api/events/{slug}/join`
     - Request: `{ "device_id": "<uuid from the browser>" }`.
     - Response: `{ attendee_id, number, display_name: "Attendee 12", event: { slug, name, venue, city, starts_at } }`.
   - Rules:
     - Unknown slug, or an event whose status is not `live`, returns 404 `event_not_found`.
       Do not say which of the two it was.
     - If an attendee with this `(event, device_id)` exists, return it unchanged.
     - Otherwise get the next number atomically with
       `UPDATE events SET attendee_count = attendee_count + 1 WHERE id = :id RETURNING attendee_count`,
       then insert the attendee in the same transaction. If two phones join at the same moment
       they must get different numbers.
     - Validate `device_id` as a UUID; anything else returns 422.
   - `GET /api/attendees/{attendee_id}` returns the same shape (used when the app reopens);
     404 if unknown.
   - If `DATABASE_URL` is not set, these routes return 503 `database_not_configured`, and
     every existing endpoint keeps working as before.
5. `backend/scripts/seed_demo.py`: creates one organization and one `live` event with slug
   `demo`. It is idempotent. Accept `--name`, `--venue` and `--city` to override the defaults.
6. `backend/scripts/make_event_qr.py --event demo --base-url <app url>`: writes
   `backend/out/event-demo-qr.png` (the folder is git-ignored) and prints the link
   `<app url>/join?e=demo`. Default base URL: `http://localhost:9002`.
7. `docker-compose.yml` at the repo root with a `db` service (`postgis/postgis:16-3.4`, port
   5432, a named volume), so anyone can run a local database. Add `DATABASE_URL` and
   `PUBLIC_APP_URL` to `backend/.env.example` (create the file if it does not exist).
8. Tests in `backend/tests/`, skipped with a clear message when `TEST_DATABASE_URL` is unset:
   - Join returns number 1, then 2, for two different device ids.
   - The same device id twice returns the same attendee.
   - 20 concurrent joins (threads) produce 20 distinct numbers.
   - Unknown slug and a `draft` event both return 404.
   - Without `DATABASE_URL`, the route returns 503 and `/api/feeds` still returns 200.
9. Add a short "Local database" section to `README.md`:
   `docker compose up -d db`, `alembic upgrade head`, `python scripts/seed_demo.py`.

## Part B — frontend (`feat/attendee-join-app`)

1. `src/lib/attendee.js`:
   - `getDeviceId()`: a random UUID (`crypto.randomUUID()`) kept in `localStorage`, under a key such
     as `dristhi.device_id`.
   - `joinEvent(slug)`: calls the join API using `BACKEND_URL` from `src/lib/backend-url.js`.
   - Saves `{ attendee_id, number, display_name, event }` in `localStorage`.
   - Wrap every `localStorage` call in `try/catch`. If storage is blocked, the app still works
     for that visit.
2. `src/app/join/page.jsx`:
   - Reads `e` with `useSearchParams()`, inside a `<Suspense>` boundary (required by the static
     export).
   - Shows "Joining [event]…", calls `joinEvent`, then `router.replace('/user/dashboard')`.
   - Error states: event not found ("This QR code isn't active. Ask staff at a help desk.") and
     network error (Retry button).
3. `src/app/user/layout.jsx`:
   - Stop requiring Firebase login and the `user` role.
   - Read the saved attendee and refresh it with `GET /api/attendees/{id}` when online.
   - If there is no saved attendee, show "Scan the event QR code to start", not a redirect to
     `/login`.
   - Replace `UserProfileProvider` with a small `AttendeeProvider` (context with `attendee`
     and `event`).
4. Make the attendee pages use the attendee instead of a Firebase user:
   - Files: `app/user/dashboard/page.jsx`, `components/user-dashboard/*.jsx` and
     `services/grievance-service.js`.
   - Where they write `submittedBy` / `email` / `userEmail`, write `attendeeId` and
     `submittedBy: display_name` instead.
   - Filter notifications by `attendeeId`.
   - Firestore stays the store for reports and notifications until task 08. The current rules
     allow these writes without sign-in.
   - Update the operator grievances page only if it breaks without `email`; show
     `submittedBy` there.
5. Responsive attendee shell (`src/components/attendee/attendee-shell.jsx`, used by
   `app/user/layout.jsx`). Frames 2, 4 and 5 of `docs/design/mockups/AttendeeHome.dc.html`:
   - Phones, below 640 px (`sm`): header with event name and "Attendee 12", bottom tab bar
     Home / Assistant / Map / My reports, one column. Pad the tab bar with
     `env(safe-area-inset-bottom)` and set `viewport-fit=cover` so it clears the iPhone home bar.
   - Tablets, 640–1023 px (`sm` to `lg`): the tabs move to a 96 px left rail; cards go two across.
   - Laptops, 1024 px and up (`lg`): a 232 px sidebar with labelled links and "Attendee 12 ·
     Location on/off" at the bottom; content capped at 1040 px.
   - The same page component renders at every size: only the grid and nav change, through
     Tailwind breakpoints, not separate pages or user-agent checks.
   - Check portrait and landscape. Touch targets at least 44 px; no horizontal scroll at 320 px.
   - Use `100dvh`, not `100vh`, for full-height layouts (mobile browser bars).
   - Restyle only the shell and header here; the inside of each page is task 11.
6. Location (frames 1 and 1b of the same mockup), in `src/lib/location.js` plus a
   `LocationProvider` inside `AttendeeProvider`:
   - On the first visit after joining, show the explainer sheet (frame 1) before calling the
     browser API. Its "Allow location" button calls `navigator.geolocation.getCurrentPosition`
     (`enableHighAccuracy: true`, `timeout: 10000`, `maximumAge: 30000`), so the browser's own
     dialog appears right after the tap. Remember that the sheet was shown
     (`dristhi.location_asked` in `localStorage`) so it doesn't come back on every load.
   - State: `granted` / `denied` / `prompt` / `unsupported`. Read it with
     `navigator.permissions.query({ name: 'geolocation' })` where available and listen for its
     `change` event; fall back to the result of the last request.
   - "Not now" or denied: show the "Location is off" banner (frame 1b) at the top of Home.
     "Turn on" asks again when the state is `prompt`; when it is `denied` it shows the
     "blocked in your browser" steps, with "Pick my area instead" (a zone list).
   - Ask again in context: tapping **Get help** or a **Find nearest** tile without location
     opens the same sheet. Get help must still work without location: it asks the attendee to
     pick their area.
   - Keep the position in memory only. Send it (`lat`, `lng`, `accuracy_m`) only with a help
     request or report the attendee submits. No background tracking: use `watchPosition` only
     while the Map tab is open, and clear the watch when it closes.
   - Geolocation needs HTTPS. `localhost` works, but a phone opening `http://192.168…` will not
     get the prompt; test on phones against the deployed URL or an HTTPS tunnel.
7. Do not restyle the inside of the attendee pages beyond the shell; that is task 11.
8. Operator-only `/login` and `/signup`:
   - Remove the attendee/user option from the UI and the `user` branch in `lib/auth-service.js`,
     so an attendee can no longer sign up by email.
   - Leave operator login behaviour unchanged.
9. Add `NEXT_PUBLIC_EVENT_SLUG=demo` to `.env.example`, used only for a "Try the attendee app"
   link on the operator dashboard during demos.

## Scope

- **In:** the three tables, the join API, the QR script, the attendee join page, the responsive
  attendee shell, the location prompt, and removing attendee login.
- **Out:**
  - personal passes, phone sign-in and pass reset (task 07)
  - moving reports to the backend (task 08)
  - map and nearest facility (task 09)
  - restyling (task 11)

## Acceptance criteria

- Scanning the QR (or opening `/join?e=demo`) on a phone opens the attendee dashboard showing
  "Attendee N" with no login screen.
- A second phone gets N+1; reloading or rescanning on the first phone keeps N.
- A medical report and a lost-item report sent from the chatbot appear on the operator
  grievances page, labelled with "Attendee N".
- `/login` shows operator sign-in only.
- The attendee app has no horizontal scroll at 320, 390, 820 and 1280 px wide, with a bottom
  tab bar on phones, a left rail on tablets and a labelled sidebar on laptops.
- On first open the location sheet appears; "Allow location" triggers the browser prompt.
  Denying it shows the "Location is off" banner, and Get help still works by picking an area.
- The backend still starts and serves cameras without `DATABASE_URL`.

## Verify

```
docker compose up -d db
cd backend && alembic upgrade head && python scripts/seed_demo.py && pytest -q
python -m compileall -q backend
cd frontend && npm run build
```

Then open `http://localhost:9002/join?e=demo` in two different browsers (or one normal and one
private window) and report the numbers shown. Check the attendee app at 390, 820 and 1280 px
wide, and allow and deny location once each (browser dev tools can reset the permission).

## HUMAN

- **Database for local development:** either Docker (`docker compose up -d db`), or the Cloud
  SQL trial instance through the Cloud SQL Auth Proxy (instructions in task 03). Put the
  connection string in `backend/.env`; never commit it or paste it into the chat.
- **Cloud SQL:** add a database user under Cloud SQL → your instance → Users (this does not
  end the free trial). Do not change any instance setting.
- **Print the QR:** run `make_event_qr.py` with the deployed app URL once task 02 is live.

## Known limits (say this in demos)

- Anyone with the QR link can join, as many times as they have browsers. That is accepted for
  the demo.
- The attendee id in `localStorage` is the only proof of identity. Do not show other
  attendees' data based on it.
- Task 07 replaces this with personal passes and phone verification.
