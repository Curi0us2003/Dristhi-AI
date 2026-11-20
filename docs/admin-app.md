# Admin app — product spec

Status: draft for review · Owner: admin app team · Read with `docs/architecture.md`.

The product is splitting into three apps on one backend:

| App | Users | Device | Owner |
| --- | --- | --- | --- |
| **Admin app** (this spec) | Event company: owner, control-room operators, read-only viewers | Laptop / control-room screen | Admin team |
| Attendee app | People at the event | Phone (offline-capable) | Attendee team |
| Staff app | Guards, medics, volunteers on the ground | Phone | Not yet assigned (see "Interfaces") |

This spec covers only the admin app and the backend endpoints it needs. Where a feature depends
on another app, the dependency is written as an interface, so that each team can build its own side.

## Hackathon build (1 day) — what we are building now

Everything below this section is the longer-term plan. For the hackathon only these five pieces are
built, on **Firestore** (the app's existing database) and the existing FastAPI people counter. The
staff app comes after the hackathon. (Data Connect was the first choice, but its emulator is blocked
by Windows Smart App Control on the dev machine; the schema is kept in `frontend/dataconnect/` for later.)

| # | Feature | Page | Store (Firestore collection) |
| --- | --- | --- | --- |
| H1 | **Event:** create, pick and edit an event; thresholds (warning %, critical %, people per guard) | `/setup` → Event | `events` |
| H2 | **Zones:** name, capacity, minimum guards, linked camera feed (from `/api/feeds`) | `/setup` → Zones | `zones` |
| H3 | **Staff roster:** guards, supervisors, medics, doctors, ambulances, volunteers in one list; add one or import CSV; zone and status | `/setup` → Staff | `staff` |
| H4 | **Command:** live density per zone with status word, 15-minute prediction, guards present vs needed, suggested guard moves from quiet to busy zones, one-click Approve (moves the guards and logs a dispatch), "Arrived" for staff on the way | `/command` | `zones`, `staff`, `dispatches` + `/api/feeds`, `/api/predictions` |
| H5 | **Reports queue:** send a staff member from the roster to a grievance (medical staff listed first for medical reports), timers for assign and resolve with Overdue labels, resolve (frees the staff member and notifies the reporter) | `/grievances` | `grievances` + `staff`, `dispatches` |

Code (JavaScript, like the rest of the frontend):
`frontend/src/lib/admin-data.js` (data, with JSDoc shapes), `src/lib/redistribution.js` (guard-move
rules), `src/contexts/event-context.jsx` (selected event), `src/components/admin/`,
`src/app/(app)/command|setup|grievances/page.jsx`.

Rules of the hackathon build:
- Firestore rules are still the open demo rules. Lock them down before any real event.
- Grievances keep their shape so that the attendee app works unchanged. Assignment is stored as extra
  fields (`assignedStaffId`, `assignedStaffName`, `assignedStaffKind`, `assignedAt`); `status` stays
  `new` / `resolved`. Grievances have no `eventId` yet, so every event sees all of them.
- The selected event is remembered in the browser (`localStorage`), not the URL.
- The Dashboard (Guard Status, Active Guards, AI summary) and the autonomous agent read and write the event's `staff` roster (`rosterViews` in `admin-data.js`). The old `guards`, `medical_staff` and `ambulances` collections are no longer read; only the old seed scripts in `src/scripts/` still write them.

Run locally without a Firebase project (needs Java for the Firestore emulator):

```
cd frontend
# .env.local:  NEXT_PUBLIC_USE_EMULATORS=true
npm run emulators          # terminal 1: Auth + Firestore emulators (demo-dristhi)
npm run seed:emulator      # once: demo admin, event, 8 zones, 23 staff, 3 reports
npm run dev                # terminal 2: http://localhost:9002 (backend on :5000 for live counts)
```

The demo login (operator username, employee id, email, password) is in `frontend/scripts/seed-emulator.mjs`.

Not in the hackathon build: map drawing, shifts, playbooks, broadcasts, gates, team roles, alerts
inbox, event log page, post-event report, staff app.

## Scope (full plan)

**In scope:** everything an admin does before, during and after an event: setting up the
organization, event, venue map, cameras, staff and attendees; running the live control room
(density, redistribution, dispatch, reports, alerts, broadcasts, emergencies); and closing the
event with a report.

**Out of scope (other teams):** attendee chatbot, attendee reporting forms, attendee map and offline
mode (tasks 07–09, attendee side); the staff phone app; the ML people counter and incident detectors
(tasks 01, 10); cloud infrastructure (task 02, 03); security hardening (task 12).

## The admin's journey

```
Hired for an event
  └─ SETUP ─────────── create event → map the venue → cameras → staff roster → attendees/passes
                       → rules & thresholds → playbooks & contacts → go-live checklist
  └─ LIVE ──────────── watch density → move staff → handle reports & alerts → broadcast
                       → run a playbook if needed
  └─ AFTER ─────────── end event → post-event report → export log
```

The app's navigation follows the same three groups.

## Roles

| Role | Setup | Live | After |
| --- | --- | --- | --- |
| `owner` | Create events, invite admins, edit everything | Everything | Everything |
| `operator` | View; edit cameras and staff of assigned events | Act: approve moves, dispatch, resolve, broadcast, run playbooks | View report |
| `viewer` (new) | View | View only (police liaison, client representative) | View report |

`viewer` is new: add it to `admins.role`. The backend checks every write with `require_admin`
plus the role; a viewer gets 403 on every write.

## Pages and routes

Static export rule applies: ids go in query strings, never `[param]` folders.

| Group | Page | Route |
| --- | --- | --- |
| — | Login | `/login` |
| — | Events list / create first event | `/events` |
| — | Team (owner only) | `/team` |
| Setup | Event setup wizard | `/setup?event=<id>&step=<n>` |
| Setup | Go-live checklist | `/setup?event=<id>&step=checklist` |
| Live | Overview | `/dashboard?event=<id>` |
| Live | Live map | `/map-view?event=<id>` |
| Live | Cameras | `/live-feed?event=<id>` |
| Live | Alerts and incidents | `/alerts?event=<id>` |
| Live | Reports (grievances) | `/grievances?event=<id>` |
| Live | Staff and dispatch | `/staff?event=<id>` |
| Live | Broadcasts | `/broadcasts?event=<id>` |
| Live | Emergency (playbooks) | `/emergency?event=<id>` |
| After | Event report | `/report?event=<id>` |
| After | Event log | `/log?event=<id>` |

The current `frontend/` app becomes the admin app. The `/user/*` and `/signup` routes leave it
when the attendee app exists (attendee team's task); until then, leave them alone.

---

## Features

Priority: **P0** = needed for the first real event · **P1** = strongly wanted for the pilot ·
**P2** = later. "Covered by" points to an existing task that already builds part of it.

### Setup (before the event)

#### S1. Organization and team — P1 (the `create_admin.py` script is enough for the first event)
- Owner invites admins by email with a role (`owner` / `operator` / `viewer`); can change roles and
  remove admins. Operators can be limited to certain events (`admin_events` link table).
- Replaces the `create_admin.py` script as the normal way to add admins (keep the script for the
  first owner).
- Covered by: task 04 (admins table, `/api/me`). New: invite flow, viewer role, per-event access.

#### S2. Event creation and lifecycle — P0
- Create an event: name, venue, city, start/end, expected attendance, indoor/outdoor.
- Status `draft → live → ended`. Going live is only allowed once the go-live checklist (S10) has no
  blocking items (owner can override with a reason, which is logged).
- Event switcher in the header.
- Covered by: task 05.

#### S3. Venue map — P0 (task 06 part); additions below are P1
- Draw zones (polygon + **required capacity**), place facilities and cameras. Covered by: task 06.
- **New — floor-plan overlay:** upload a venue plan (PNG/JPG/PDF page) and pin it to the map by
  dragging two or three corners, with an opacity slider. Indoor venues and stadiums are often
  useless on satellite imagery. Stored in Cloud Storage; `events.floorplan_path` and its bounds.
- **New — staff posts:** mark fixed posts (gate, stage barrier, exit) as POIs of kind `post`, so that
  staff can be rostered to a post, not just a zone.
- **New — gates:** mark entry/exit gates (POI kind `gate`) with a direction (in / out / both). Used by S5
  and L9.

#### S4. Cameras — P0
- Add camera: name, stream URL or uploaded video, zone, location on the map, max capacity.
  Covered by: task 05.
- **New — camera health:** each camera reports last frame time; a camera with no frame for 30 s is
  `offline` and raises an alert (L7). A "Test stream" button in setup shows one snapshot.

#### S5. Staff roster — P0
One list for everyone on the ground, instead of separate guards / medical staff / ambulances.

- Fields: name, phone (E.164), **kind** (`guard`, `supervisor`, `doctor`, `paramedic`, `nurse`,
  `volunteer`, `ambulance`), skills (first-aid trained, has radio, female staff, language), team /
  agency, notes.
- **CSV import** with per-row errors and nothing imported on error (same pattern as task 07's attendee
  import). Downloadable template.
- **Shifts:** each staff member gets one or more shifts (start, end, assigned zone or post). The roster
  view shows a timeline per zone so that gaps are visible ("Zone C has no guard 18:00–19:00").
- **Ambulances** are staff of kind `ambulance` with a vehicle number and a staging point.
- **Invite to staff app:** "Send invite" texts the staff member a link (when the staff app exists).
  Until then, operators update status by hand.
- Covered by: task 05 builds `guards` CRUD; this replaces it with a unified `staff` table (see "Data
  model changes").

#### S6. Attendees and passes — P0 (admin side only)
- CSV import, claim status table, reset a claim, export QR ZIP. Covered by: task 07 (step 2,
  wizard step 5). Nothing new here; it is listed so that the admin app owns the screen.

#### S7. Rules and thresholds — P0
Per-event settings, replacing the global in-memory thresholds in `app.py`:

| Setting | Default | Used by |
| --- | --- | --- |
| Warning density % | 70 | Status everywhere |
| Critical density % | 90 | Status everywhere |
| Per-zone override of the above | none | Zones with different risk (stage front) |
| Target people per guard | 250 | L3 redistribution |
| Minimum guards per zone | 1 | L3, L10 |
| Max medic distance (m) | 150 | L10 (shared with task 10) |
| Report acknowledge SLA (min) by type | medical 2, missing person 2, lost & found 15, general 30 | L5 escalation |
| Report resolve SLA (min) by type | medical 15, missing person 30, lost & found 120, general 120 | L5 |
| Prediction horizon (min) | 15 | L1, L3 |

#### S8. Emergency playbooks — P1
- Pre-written plans for: evacuation (whole venue or a zone), crush/stampede risk, fire, medical mass
  casualty, severe weather, bomb threat, power failure.
- Each playbook has: steps checklist for the control room; staff assignments ("all guards in Zone B
  to Exit 2 and Exit 3"); attendee broadcast text in each language; which gates to close/open; who to
  call (from S9).
- Start from built-in templates; admins edit per event.
- Run from L11.

#### S9. Emergency contacts — P1
- Police, fire, nearest hospitals (name, phone, distance, trauma care yes/no), event client contact,
  venue manager, electricity, ambulance service. One-tap call (`tel:` link) and visible on the live map.

#### S10. Go-live checklist — P0
Automatic readiness check shown before going live, each item `OK` / `Warning` / `Blocking`:

- Every zone has a capacity (Blocking) and at least one camera (Warning: "Zone D is a blind zone").
- Every camera shows a frame (Warning per offline camera).
- Every zone has guards rostered for the whole event time (Warning, lists gaps).
- Every zone is within max medic distance of a medic or first-aid post (Warning).
- At least one exit per zone mapped (Warning).
- Thresholds set; at least the evacuation playbook filled in; emergency contacts present (Warning).
- Attendees imported (Warning; some events have no passes).

### Live (control room)

#### L1. Overview — P0
- KPIs: people inside (from cameras, and from gates when L9 exists), overall density, zones by status
  (Critical / Warning / Normal, with words), open reports and how many are overdue, staff on duty vs
  rostered, offline cameras.
- Zone list sorted by risk, each row: current density, predicted density at the horizon, trend arrow,
  guards present / target.
- "Needs attention" feed: the top items from L3, L5, L7 and L10 in one list.
- Covered by: task 11 dashboard mockup. New: predicted column, staff columns, needs-attention feed.

#### L2. Live map — P0
- Zones coloured by density with the status word (task 06 step 3).
- New layers, each toggleable: staff positions (by zone/post, or GPS when the staff app sends it),
  open reports as pins coloured by urgency, cameras with online/offline state, gates open/closed,
  emergency contacts (hospitals).
- Click a zone: density chart for the last hour, cameras, staff in it, open reports, "Send staff here".

#### L3. Staff redistribution suggestions — P0
The admin's main lever. The system proposes moves; the admin approves.

- Every 30 s, for each zone: `needed = max(min_guards, ceil(predicted_count / people_per_guard))`.
  Zones with a surplus give guards to zones with a deficit, nearest first.
- Suggestion card: "Zone C: 92% Critical, 3 guards, needs 6. Move 2 from Zone A (30% Normal, 6 guards),
  1 from Zone B. Approve / Edit / Dismiss."
- Approve creates dispatches (L4) for named staff; Edit lets the operator pick other people.
- Uses **predicted** density at the horizon, so that guards arrive before a zone turns Critical.
- Rule-based first; the AI agent plan (task 08 step 4) can add reasoning text and medic moves on top.
  The rule-based result is always shown, even if the AI call fails.

#### L4. Staff and dispatch board — P0
- Staff list with live status: `off_duty`, `available`, `dispatched`, `on_scene`, `break`, plus zone.
- Dispatch: pick staff → target (zone, post, report, or map point) → reason → send. Creates a
  `dispatch` row with states `sent → acknowledged → en_route → arrived → done` (or `declined`).
- Columns or filters by state; time since sent; overdue acknowledgements highlighted.
- Until the staff app exists, operators move states by hand (radio confirmation). The backend API is
  the same either way.
- Shift check-in: staff marked present at shift start (by operator now, by staff app later). Only
  checked-in staff count as "on duty".

#### L5. Reports (grievances) queue — P0
- Statuses extended to `new → assigned → acknowledged → en_route → on_scene → resolved` (plus
  `cancelled`, `duplicate`).
- Each card: type, urgency, where (zone and map pin), photo, time open, **SLA timer** (S7) turning
  Warning then Overdue.
- Assign = dispatch (L4) linked to the report. Assigning the nearest available suitable staff is the
  default suggestion (medic for medical, nearest guard for others).
- **Escalation:** not acknowledged within SLA → shows in "Needs attention", sound alert, and can
  auto-reassign (setting).
- Merge duplicates (several people report the same incident).
- Every status change notifies the attendee (task 04 already creates notifications).
- Covered by: task 04 (grievances router), task 11 (screen). New: statuses, SLA, escalation, merge.

#### L6. Missing person and lost child — P0
- A missing-person report is shown as a banner across all pages until closed.
- "Alert all staff": sends name, description, photo and last-seen place to every on-duty staff member
  (staff app) and optionally a broadcast to attendees near the last-seen zone.
- "Found" closes it, records where and by whom, and notifies the reporter.

#### L7. Alerts and incidents — P0
- One inbox for: density Critical/Warning, prediction going Critical, camera offline, CCTV incident
  detections (task 10), SLA breaches, SOS from attendees (task 09).
- Each alert: acknowledge, link to a report or dispatch, dismiss with reason. Nothing disappears
  without a recorded action.
- Covered by: task 10 (incident alerts). New: single inbox across sources.

#### L8. Broadcasts — P1
- Compose a message to: all attendees, attendees of selected zones, all staff, staff of a kind or zone.
- Templates (gate closed, use other exit, weather, lost child found); multiple languages.
- Shows delivery counts when the attendee app reports them. Attendee side receives through
  `notifications` (attendee team builds the display).

#### L9. Gates and headcount — P1
- Live in/out counts per gate from pass scans (needs a scanning client — see "Interfaces") or a camera
  pointed at the gate.
- People inside the venue vs venue capacity; alert at 90%.
- Mark a gate open / closed / one-way; shown on the live map and pushed to attendees as a broadcast.

#### L10. Coverage warnings — P0
Continuously checked, shown in Overview and on the map:
- Blind zones (no online camera).
- Zones below minimum guards (by checked-in staff, not roster).
- Zones beyond max medic distance (task 10 step 5).
- Ambulance not at staging point.

#### L11. Run a playbook — P1
- "Emergency" button in the header (owner/operator), choose a playbook and a scope (venue or zones).
- Confirm screen shows what will happen: dispatches, broadcasts, gate changes. One confirm sends all.
- Then a live checklist of the playbook steps with who ticked each and when.
- "Stand down" ends it and sends the all-clear broadcast.

#### L12. Event log — P0
- Every action and system event appended automatically: alerts, approvals, dispatches and state changes,
  report changes, broadcasts, playbooks, threshold edits, logins. Who, what, when, linked items.
- Operators can add free-text notes ("Police informed of fight near Gate 4").
- Append-only (no edit or delete through the API).

### After the event

#### A1. Post-event report — P1
- Attendance: peak people inside and when; peak density per zone and minutes spent in Warning / Critical.
- Reports: count by type, median and 90th-percentile time to acknowledge and to resolve, SLA hit rate.
- Staff: shifts worked, dispatches per person, moves approved from L3.
- Alerts and incidents: count by kind, confirmed vs dismissed (task 10 precision).
- Printable page (browser print to PDF) and CSV export. This is the document handed to the client.

#### A2. Log export — P1
- Export L12 as CSV, filterable by time and type, for police or insurance.

---

## Data model changes

Proposed changes to the table in `docs/architecture.md`. The backend owner should agree before task 05
is built, because task 05 creates `guards`.

| Change | Detail |
| --- | --- |
| `admins.role` | add `viewer` |
| `admin_events` (new) | admin_id, event_id — operators limited to these events |
| `events` | add expected_attendance, indoor, floorplan_path, floorplan_bounds, settings (JSONB for S7) |
| `zones` | add warning_pct?, critical_pct? overrides, min_guards? |
| `pois.kind` | add `post`, `gate`; gates get direction and state (`open` / `closed` / `in_only` / `out_only`) |
| `staff` (replaces `guards`, `medical_staff`, `ambulances`) | id, event_id, name, phone, kind, skills (text[]), team, vehicle_no?, staging_poi_id?, status, zone_id?, poi_id?, firebase_uid?, last_seen_at, location? |
| `shifts` (new) | id, staff_id, starts_at, ends_at, zone_id?, poi_id?, checked_in_at? |
| `dispatches` (new) | id, event_id, staff_id, grievance_id?, alert_id?, target_zone_id?, target_location?, reason, state, created_by, timestamps per state |
| `grievances.status` | extend as in L5; add merged_into_id?, ack_due_at, resolve_due_at |
| `alerts` (new, single inbox) | id, event_id, source (`density`, `prediction`, `camera`, `incident`, `sla`, `sos`), severity, ref_id, status, acted_by, action, timestamps — `incident_alerts` from task 10 can feed it |
| `broadcasts` (new) | id, event_id, audience (JSONB), message per language, sent_by, sent_at, delivered_count |
| `playbooks` (new) | id, event_id, kind, name, steps (JSONB), staff_actions (JSONB), broadcast (JSONB), gate_actions (JSONB) |
| `playbook_runs` (new) | id, playbook_id, scope, started_by, started_at, ended_at, step_log (JSONB) |
| `contacts` (new) | id, event_id, kind, name, phone, location?, notes |
| `event_log` (new) | id, event_id, at, actor (admin/staff/system), action, ref_type, ref_id, data (JSONB) |
| `gate_counts` (new, P1) | id, event_id, gate_poi_id, taken_at, in_count, out_count |

## API additions (admin side)

All under `/api/events/{event_id}/…`, admin role required, `viewer` read-only.

```
staff            GET POST PATCH DELETE; POST staff/import (CSV); GET staff/template.csv
shifts           GET POST PATCH DELETE; POST shifts/{id}/check-in
dispatches       GET POST; POST dispatches/{id}/state {state}
suggestions      GET  (L3 rule-based moves); POST suggestions/{id}/approve
grievances       existing + POST {id}/merge, POST {id}/assign
alerts           GET; POST {id}/ack, {id}/dismiss
broadcasts       GET POST
playbooks        GET POST PATCH DELETE; POST {id}/run; POST runs/{run_id}/step; POST runs/{run_id}/stand-down
contacts         GET POST PATCH DELETE
gates            GET; POST {poi_id}/state
coverage         GET  (L10)
readiness        GET  (S10)
log              GET (filters); POST (operator note); GET log.csv
report           GET; GET report.csv
team             /api/org/admins GET POST PATCH DELETE (owner)
```

The SSE stream (`/api/stream/updates`) gains event types: `alert`, `dispatch`, `grievance`, `staff`,
`suggestion`, `playbook`, so that every live page updates without polling.

## Interfaces with other teams

The admin app must work **without** these, and gets better when they arrive.

| Needed from | What | Admin app until then |
| --- | --- | --- |
| Staff app (unassigned) | Staff sign in by phone; receive dispatches and alerts; call `POST dispatches/{id}/state`; check in to shifts; optional location ping | Operator updates states by hand after radio confirmation |
| Attendee app | Shows `notifications` / broadcasts; sends grievances and SOS | Grievances from the current `/user` page |
| Gate scanning (staff app or a simple scanner page) | `POST gates/{id}/scan {pass_code, direction}` | Gate counts from a camera, or L9 left off |
| ML team | `count_people`, incident detectors (tasks 01, 10), camera last-frame time | Current counter |

**Decision needed:** who builds the staff app. Without it, dispatch and "is the report being handled"
both depend on radio and manual updates.

## Conflicts with current task files

- **Task 05** builds a `guards` CRUD and the setup wizard step "Guards". Proposal: build `staff`
  (S5) instead, and call the step "Staff".
- **Task 04** builds routers for guards, ambulances and medical_staff. Proposal: one `staff` router.
- **Task 10 step 2** creates `incident_alerts`; L7 proposes a general `alerts` table that it feeds.
- **Task 11** lists screens for one frontend including attendee screens; the attendee screens move to
  the attendee app's plan.
- **Architecture** data model needs the changes above.

## Suggested build order (admin team)

Each is one branch and one PR; numbers are proposals for new task files.

| # | Feature(s) | Depends on |
| --- | --- | --- |
| A01 | Unified `staff` + shifts + CSV import (S5) | 05 (or replaces its guards part) |
| A02 | Per-event rules and thresholds (S7), per-zone overrides | 05 |
| A03 | Dispatch board + check-in (L4) | A01 |
| A04 | Reports queue: statuses, SLA, escalation, merge, missing person (L5, L6) | A02, A03 |
| A05 | Alerts inbox + camera health (L7, S4 health) | 05 |
| A06 | Redistribution suggestions (L3) + coverage (L10) | A01, A02, A03, 06 |
| A07 | Event log (L12) | A03 (start logging from then) |
| A08 | Go-live checklist (S10) + overview additions (L1) + live-map layers (L2) | A06 |
| A09 | Team: invites, viewer role, per-event access (S1) | 04 |
| A10 | Floor-plan overlay, posts and gates on the map (S3 additions) | 06 |
| A11 | Broadcasts (L8) | 04 |
| A12 | Playbooks + contacts + run mode (S8, S9, L11) | A03, A11 |
| A13 | Gates and headcount (L9) | A10, gate scanning interface |
| A14 | Post-event report + log export (A1, A2) | A04, A07 |

P0 for the first event: A01–A08. P1 for the pilot: A09–A14.
