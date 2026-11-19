# Task prompts

Each file here is one unit of work that a teammate hands to Claude Code. The files are written
so that Claude Code knows what to read, what to change, how to check it, and what a human must
do in a cloud console.

## How to start a task

1. `git switch main && git pull`
2. Open Claude Code in the repo root and paste the **Prompt** block from the task file. They all
   follow this pattern:

   ```
   Read CLAUDE.md, docs/architecture.md and docs/tasks/NN-name.md, then do task NN.
   ```

3. Do the **HUMAN** steps Claude Code lists (cloud console, secrets, approvals).
4. Review the diff, commit, open a PR. One task = one branch = one PR.

## Order and dependencies

| # | Task | Depends on | Typical owner |
| --- | --- | --- | --- |
| 00 | [Quick fixes from code review](00-quick-fixes.md) | – | Any engineer |
| 01 | [Swap in the OpenCV people counter](01-model-swap.md) | 00 | ML engineer + backend |
| 02 | [Deploy to Cloud Run and Firebase Hosting](02-deploy-cloud-run.md) | 01 | Backend + whoever has GCP access |
| 03 | [Cloud SQL data model and backend restructure](03-cloud-sql.md) | 02 | Backend |
| 04 | [Backend auth and moving writes behind the API](04-auth-and-api.md) | 03 | Backend + frontend |
| 05 | [Multi-event: events, cameras, guards](05-multi-event.md) | 04 | Full stack |
| 06 | [Venue map editor](06-venue-map.md) | 05 | Frontend + backend |
| 07 | [Attendee passes and QR login](07-passes-qr.md) | 05 | Full stack |
| 08 | [Chatbot and AI on the backend](08-chatbot.md) | 04, 06 | Full stack |
| 09 | [Navigation, offline mode and SOS](09-offline-sos.md) | 06, 08 | Frontend |
| 10 | [CCTV incident detection and medic coverage (pilot)](10-incident-detection.md) | 05 | ML engineer + backend |
| 11 | [Frontend redesign](11-redesign.md) | 04 (per screen) | Frontend |
| 12 | [Security hardening and pilot readiness](12-security-pilot.md) | all | Lead |

```
00 → 01 → 02 → 03 → 04 → 05 ┬→ 06 ┬→ 08 → 09
                             │     └────────┘
                             ├→ 07
                             └→ 10
          11 runs alongside from 04, one screen per PR
          12 last
```

Tasks on separate branches after 05 (06, 07, 10) can run in parallel. 11 can start any screen
whose data source is settled.

## Reference material

- `docs/architecture.md`: the decisions every task follows.
- `docs/design/`: tokens and mockups for UI work.
- `docs/reference/platform-plan.pdf`: the full written plan (deployment guide, costs, feature plans).
- `docs/reference/architecture-deck.pptx`: architecture slides with data flows.
