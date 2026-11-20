# 07 — Attendee passes and QR login

**Branch:** `feat/passes-qr` · **Depends on:** 05 · **Size:** large

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/07-passes-qr.md, then do task 07.
Security matters here: list every check you implemented in your final report.
```

**Builds on 07a.** Task 07a already has the `attendees` table and the anonymous `/join` flow.
This task adds personal passes and phone verification and then turns off anonymous join for
events that use passes. Make that a per-event setting, `events.join_mode` (`open` / `pass`).
Screens: `docs/design/mockups/AttendeePass.dc.html`. The attendee types their full number
(the pass shows only the last 4 digits), and the backend checks it matches before any SMS is
sent, so the browser never receives the full number.

## Goal

Each attendee gets a personal QR pass. A pass can be claimed once, by the person whose phone
number is on it, on one device. A forwarded QR fails at the SMS step.

## Steps

1. Backend:
   - `POST /api/events/{id}/attendees/import`: CSV upload (name, phone in E.164, optional email).
     Validate every row; return per-row errors without importing a partial file.
   - Pass codes: `secrets.token_urlsafe(24)` (≥ 128 bits). Store only `sha256(code)` in
     `passes.code_hash`; the plain code exists only in the QR and the export.
   - `GET /api/events/{id}/passes/export`: ZIP with one QR PNG per attendee (`qrcode` library)
     and a CSV of name, phone, link. The link is `https://<app domain>/pass?c=<code>`
     (query string: the frontend is a static export).
   - `POST /api/passes/check` `{code}` → event name, attendee first name, masked phone
     (`+91 •••••• 4821`), claimed or not. Rate-limit by IP (for example 10 per minute).
   - `POST /api/passes/claim` `{code, device_id}` with a Firebase ID token from **phone** sign-in:
     in one transaction (`SELECT … FOR UPDATE`): pass exists, not expired, event live or draft;
     the token's `phone_number` equals the pass phone; if unclaimed, set `claimed_by_uid`,
     `claimed_device_id`, `claimed_at`; if already claimed by the same uid and device, succeed;
     anything else → 409 "already claimed".
   - `POST /api/events/{id}/passes/{pass_id}/reset` (admin): clears the claim.
2. Frontend:
   - Page `/pass?c=…`:
     1. Shows the check result.
     2. The attendee types their full number. `POST /api/passes/verify-phone` `{code, phone}`
        returns 204 on a match, otherwise 403. It is rate-limited and stops SMS being sent to
        numbers that aren't on the pass.
     3. Firebase phone sign-in (`RecaptchaVerifier` + `signInWithPhoneNumber`).
     4. Calls claim.
   - `device_id`: a random UUID stored in `localStorage` on first visit.
   - Success → attendee app for that event. 409 → clear message and "ask staff to reset".
   - Setup wizard step 5: CSV upload with row errors, attendee table with claim status and
     a reset button, export button.
3. Remove attendee email/password signup from the attendee path (`/signup` stays for admins
   only, or remove it if admins are created by script).
4. Tests: claim happy path; wrong phone → 403; second device → 409; same device again → 200;
   two concurrent claims → exactly one wins; plain code never stored.

## Acceptance criteria

- A pass opened on a second phone with a different number cannot be claimed.
- The database never contains plain pass codes.
- An admin can import 500 attendees and download the QR ZIP.

## Verify

```
cd backend && pytest -q
cd frontend && npm run build
```

## HUMAN

- Firebase Auth → enable the Phone provider; add test phone numbers for development.
- Decide the SMS budget; Firebase phone auth is billed per SMS beyond the free allowance.
- Known limit to state in docs: a holder who forwards both the QR and their SMS code cannot be
  stopped by software; gate staff check photo ID.
