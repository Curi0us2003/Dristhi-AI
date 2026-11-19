# 12 — Security hardening and pilot readiness

**Branch:** `chore/pilot-readiness` · **Depends on:** all earlier tasks · **Size:** medium

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/12-security-pilot.md, then do task 12.
Report each checklist item as done, not applicable, or needs a HUMAN step.
```

## Goal

Make the system safe to run at a first real event, and give the team a runbook for event day.

## Checklist (code)

- [ ] Firestore rules deny everything not still in use.
- [ ] Every endpoint except `/api/health` requires a token; add a test that walks all routes in
      the FastAPI app and asserts 401 without a token.
- [ ] Every event-scoped query filters by the caller's event; add a cross-organization test per router.
- [ ] CORS limited to `CORS_ORIGINS`; no `*`.
- [ ] Rate limits on pass check / claim, chat and SOS (for example `slowapi`).
- [ ] Request size limits on uploads; only images for photos, only video types for camera uploads.
- [ ] Logs contain no phone numbers, emails, pass codes or ID tokens.
- [ ] Retention job: delete report photos, attendee phone numbers and passes N days after an
      event ends (N is an event setting, default 30).
- [ ] Health endpoint reports database, model and processor status for uptime checks.
- [ ] Load test script (`backend/scripts/load_test.py`): 8 cameras, 20 operators on SSE,
      500 attendees sending chat messages; report CPU, memory and latency on Cloud Run.

## Runbook

Write `docs/runbook.md` with:

1. **Day before:** scale up, mark the event live, check every camera shows counts, test SOS and
   one report end to end, confirm medic coverage has no gaps.
2. **During:** what to watch (CPU, errors, camera health), how to restart a camera, what to do
   if the backend restarts, how to reset a pass.
3. **After:** end the event, scale down, export the report CSV, confirm the retention job ran.
4. **If things fail:** backend down (help points and radios continue; restart command),
   Cloud SQL down, a camera feed lost, mobile networks jammed (venue Wi-Fi, offline mode).

## HUMAN

- Restrict the Maps and Firebase API keys by HTTP referrer.
- Review IAM: no shared Owner accounts; the Cloud Run service account has only the roles it needs.
- Turn on Cloud SQL automated backups.
- Get privacy obligations reviewed for attendee data under India's DPDP Act.
