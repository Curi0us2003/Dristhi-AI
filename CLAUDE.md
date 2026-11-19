# Dristhi AI — guide for Claude Code

Dristhi AI is a crowd-safety command center for large events. CCTV video is analysed to count
people per zone; operators watch density, get alerts, dispatch guards and medical help, and
handle reports from attendees. We are turning the single-venue demo into a multi-event product
on Google Cloud.

**Before any task, read:** this file, `docs/architecture.md` (target design and decisions), and
the task file you were given from `docs/tasks/`. For UI work also read `docs/design/README.md`.

## How the team uses this repo

Work is split into numbered task files in `docs/tasks/`. A teammate starts a session with:

> Read CLAUDE.md, docs/architecture.md and docs/tasks/NN-name.md, then do that task.

When you get a task file:

1. Check its **Depends on** list. If a dependency is not merged into `main` (look for the code
   it describes), stop and say which one is missing.
2. Create the branch named in the task (`git switch -c <branch>` from an up-to-date `main`).
3. Follow the **Steps** in order. Stay inside **Scope**; list anything else you notice under
   "Follow-ups" in your final report instead of doing it.
4. Run every command under **Verify** and fix failures before reporting.
5. Finish with a short report: what changed (files), how it was verified, what is left,
   any **HUMAN** steps the teammate must do (cloud consoles, secrets, billing).
6. Do not commit, push or open a PR unless the teammate asks.

Steps marked **HUMAN** need cloud access, secrets or a decision. Explain them; do not try to
do them yourself, and never ask the teammate to paste secrets into the chat.

## Repo map

```
backend/            FastAPI app (app.py), feeds.json camera list, Dockerfile, deploy.sh / deploy.ps1
frontend/           Next.js 15 static export (App Router), Tailwind + shadcn/ui
  src/app/(app)/    operator pages: dashboard, live-feed, alerts, map-view, grievances
  src/app/user/     attendee dashboard
  src/ai/           Gemini calls (moving to the backend in task 08)
  src/lib/          firebase.ts, auth-service.ts, backend-url.ts
  functions/        Cloud Function proxy for /api/** (removed in task 02)
docs/architecture.md   target architecture, data model, API and auth rules
docs/design/           design tokens + HTML mockups of the redesigned screens
docs/tasks/            ordered task prompts
docs/reference/        exported plan (PDF), architecture deck (PPTX), redesign concepts (PDF)
```

## Run locally

```bash
# backend (Python 3.10+)
cd backend && python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt && python app.py              # http://localhost:5000/docs

# frontend (Node 20+)
cd frontend && npm install && cp .env.example .env && npm run dev   # http://localhost:9002
```

## Checks to run before reporting

- Backend: `python -m compileall -q backend` and, once tests exist, `cd backend && pytest -q`.
- Frontend: `cd frontend && npm run typecheck && npm run build`.

## Rules that matter here

- **Static export.** `frontend/next.config.ts` uses `output: 'export'`: no API routes, no server
  actions, no middleware, and no dynamic route segments without `generateStaticParams`. Pass ids
  in query strings (`/pass?c=...`, `/events?id=...`) instead of `[param]` folders.
- **One backend instance until task 03 lands.** Crowd counts live in process memory, so Cloud Run
  must keep `--max-instances 1`.
- **The browser never writes data directly** once task 04 lands: every write goes through the
  backend, which verifies the Firebase ID token and the user's role and event.
- **No secrets in code or in `NEXT_PUBLIC_*` variables.** Server secrets go in Secret Manager.
  `.env` files are git-ignored; keep `.env.example` files up to date when you add variables.
- **Everything is scoped by `event_id`** once task 05 lands. Never return or change data from
  another event than the caller's.
- **Status is never colour alone.** Every coloured status also shows its word (Critical, Warning).
- Region is `asia-south1` for every Google Cloud resource.
- Keep changes small and reviewable; do not reformat files you are not changing.
