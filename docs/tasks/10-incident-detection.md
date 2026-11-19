# 10 — CCTV incident detection and medic coverage (pilot)

**Branch:** `feat/incident-detection` · **Depends on:** 05 (uses `detect_people` from 01) · **Size:** medium
**Owner:** ML engineer + backend engineer

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/10-incident-detection.md, then do task 10.
This is a pilot: put it behind a per-event feature flag and log every alert for evaluation.
```

## Goal

Notice possible medical incidents from cameras, without anyone reporting them, and make sure
every zone has a medic or first-aid post within reach.

## Steps

1. `dristhi/detection/incidents.py`, fed by the boxes from `detect_people` in each processor:
   - **Person down:** a box much wider than tall (ratio configurable, start at 1.3) that stays
     in roughly the same place for N seconds (start at 10).
   - **Sudden gathering:** people count inside a small area of the frame rises quickly while
     the rest of the frame does not (simple grid of cells, configurable thresholds).
   - **Scatter:** many boxes moving away from one point between samples.
   - Each detector returns a confidence; only emit when above a threshold.
2. Alerts: table `incident_alerts` (event, camera, kind, confidence, snapshot path, status
   `new` / `confirmed` / `dismissed`, reviewed_by, reviewed_at). Save a JPEG snapshot to Cloud Storage.
3. Dashboard: incidents appear in Alerts with "Possible incident", the snapshot, Confirm and
   Dismiss. Confirm creates an urgent medical grievance for the AI agent to plan dispatch.
4. Evaluation: `backend/scripts/incident_report.py` prints precision (confirmed ÷ total) per kind
   per event, so the team can tune thresholds.
5. Medic coverage:
   - Event setting `max_medic_distance_m` (default 150).
   - For each zone, distance from its centroid to the nearest available medical staff (by their
     zone) or first-aid POI. Zones over the limit show "No medic within N m" on the dashboard.
   - The AI agent plan considers coverage gaps when proposing medical staff moves.
6. Feature flag: `events.incident_detection_enabled` (default false).

## Acceptance criteria

- On a test video with a person lying still, a "person down" alert appears within 15 s.
- Dismiss and Confirm are recorded; the report script shows precision.
- Removing the only medic from a zone shows a coverage warning within one refresh.

## Verify

```
cd backend && pytest -q
cd frontend && npm run typecheck && npm run build
```

## HUMAN

- ML engineer: collect a few test clips (person lying down, crowd gathering) and tune thresholds.
- Present accuracy honestly: dense crowds hide people; this is decision support, not a guarantee.
