# 05 — Multi-event: events, cameras and guards

**Branch:** `feat/multi-event` · **Depends on:** 04 · **Size:** large

## Prompt

```
Read CLAUDE.md, docs/architecture.md, docs/design/README.md and docs/tasks/05-multi-event.md,
then do task 05.
```

## Goal

An admin can create several events, switch between them, register cameras and guards per event,
and camera analysis runs only for events that are live.

## Steps

1. Backend routers:
   - `events`: list (caller's organization), create (`owner` only), get, update, and
     `POST /api/events/{id}/status` with `live` / `ended` transitions.
   - `cameras`: CRUD under an event; creating or deleting a camera of a live event starts or
     stops its processor through `ProcessorManager`.
   - `guards`: CRUD under an event with `zone_id` (zones may be empty until task 06).
   - `POST /api/events/{id}/uploads/video`: returns a Cloud Storage signed upload URL for demo
     videos; the camera's `source_url` then points to the object (signed read URL or `gs://`
     resolved by the backend).
2. Event lifecycle: when an event goes `live`, start processors for its cameras; when `ended`,
   stop them. On backend startup, start processors for all `live` events.
3. Remove the remaining reads of `feeds.json` from the request path (keep it only for the seed).
4. Frontend:
   - Event switcher in the operator header; the selected event id lives in a React context and
     in the URL query (`?event=<id>`); every page reads it. No dynamic route folders (static export).
   - First login with no events → "Create your first event" screen.
   - Setup wizard page `/setup?event=<id>` with five steps: Event, Cameras, Venue map, Guards,
     Passes. Build steps 1, 2 and 4 now; steps 3 and 5 show "Coming in task 06 / 07".
   - Follow `docs/design/mockups/VenueSetup.dc.html` for the wizard header and stepper.
5. Tests: event scoping (an operator of org A gets 404 for an event of org B), lifecycle starts
   and stops processors (mock the manager).

## Scope

In: events, cameras, guards, wizard shell, lifecycle. Out: map drawing (06), passes (07).

## Acceptance criteria

- Two events can exist side by side; switching events changes every page's data.
- Ending an event stops its camera threads (check `/api/health` active feeds).
- No endpoint returns data from another organization's event.

## Verify

```
cd backend && pytest -q
cd frontend && npm run typecheck && npm run build
```

## HUMAN

- Create the Cloud Storage bucket `dristhi-media-<env>` in `asia-south1` and grant the Cloud Run
  service account Storage Object Admin on it. Set `GCS_BUCKET` on the service.
