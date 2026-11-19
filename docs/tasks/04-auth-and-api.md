# 04 — Backend auth and moving writes behind the API

**Branch:** `feat/backend-auth` · **Depends on:** 03 · **Size:** large

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/04-auth-and-api.md, then do task 04.
Start with the backend (steps 1–4), then the frontend (5–7).
```

## Goal

Every request is authenticated and authorised on the backend, and the browser stops writing
to Firestore. This closes the biggest security hole (Firestore rules open to everyone).

## Steps

1. `dristhi/auth.py` with `firebase-admin`:
   - `current_user`: reads `Authorization: Bearer <token>`, verifies it with
     `firebase_admin.auth.verify_id_token`, returns `uid`, `email`, `phone_number`.
   - `require_admin(event_id)`: user is in `admins` for the event's organization, else 403.
   - `require_attendee(event_id)`: user has a claimed pass for that event, else 403.
   - On Cloud Run use default credentials; locally `GOOGLE_APPLICATION_CREDENTIALS`.
2. Routers with Pydantic schemas, all scoped to an event:
   guards, grievances, ambulances, medical_staff, notifications (list, create, update, delete as
   each page needs). Grievance status changes and dispatch create a notification for the attendee.
3. Protect the existing read endpoints (`/api/feeds`, `/api/alerts`, `/api/video/*`, …) with
   `require_admin`. `<img>` tags cannot send headers, so for MJPEG and snapshots accept a
   short-lived signed `?t=` token from `POST /api/video/token` (HMAC, 5 min expiry).
4. Port `frontend/src/scripts/create-admin.js` to `backend/scripts/create_admin.py` (creates the
   Firebase user if needed and the `admins` row). Add `backend/scripts/migrate_firestore.py`
   that copies guards, ambulances, medical_staff and grievances from Firestore into the demo event.
5. Frontend `src/lib/api.ts`: a `fetch` wrapper that adds the Firebase ID token, refreshes it on
   401 once, and throws typed errors.
6. Replace every direct Firestore read and write with API calls. Find them with
   `grep -rn "firebase/firestore" frontend/src`. Today they are in: `app/(app)/dashboard/page.tsx`,
   `app/(app)/grievances/page.tsx`, `app/(app)/live-feed/page.tsx`, `app/(app)/alerts/page.tsx`,
   `app/user/dashboard/page.tsx`, `components/autonomous-agent.tsx`,
   `components/map-view-component.tsx`, `components/user-dashboard/chatbot.tsx`,
   `services/grievance-service.ts`, `lib/auth-service.ts`.
   Replace `onSnapshot` live lists with the SSE stream or 5 s polling.
   The Firestore seed scripts in `frontend/src/scripts/` (`seed-*.js`, `create-admin.js`) are
   replaced by the backend scripts from step 4; delete them and their `package.json` entries.
7. Login: `auth-service.ts` checks the operator role through `GET /api/me` instead of querying
   the Firestore `admin` collection.
8. `frontend/firestore.rules`: deny all reads and writes (or only allow what notifications still
   need, if you kept them in Firestore).

## Scope

In: auth, the listed routers, frontend data access. Out: events/cameras CRUD (05), passes (07).

## Acceptance criteria

- Calling any endpoint except `/api/health` without a token returns 401; with an attendee token
  on an admin endpoint, 403.
- No file in `frontend/src` imports `firebase/firestore` except, if kept, notifications.
- Operator login, dashboard, guards, grievances and the attendee report flow work end to end.

## Verify

```
cd backend && pytest -q          # include tests for 401/403 using a stubbed verify_id_token
cd frontend && npm run typecheck && npm run build
grep -rn "firebase/firestore" frontend/src
```

## HUMAN

- Deploy the new Firestore rules: `npx firebase deploy --only firestore:rules`.
- Run `create_admin.py` for each operator and `migrate_firestore.py` once.
