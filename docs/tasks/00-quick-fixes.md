# 00 — Quick fixes from the code review

**Branch:** `fix/code-review-quick-fixes` · **Depends on:** nothing · **Size:** small

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/00-quick-fixes.md, then do task 00.
```

## Goal

Fix three known bugs before any bigger change, so later work starts from a correct baseline.

## Steps

1. **Predictions never show on the Alerts page.**
   - `GET /api/predictions` in `backend/app.py` returns `{"predictions": {<feed_id>: {feed_name,
     current, trend, predictions: {"15_min", "30_min"}, risk_level}}}`: an object keyed by feed.
   - `frontend/src/app/(app)/alerts/page.jsx` (around line 181) expects an array with `sectorId`,
     `riskLevel`, `predictedCrowd`, `recommendations`, so the list is always empty.
   - Fix the frontend: update the `Prediction` / `PredictionsResponse` types to the real shape,
     read `Object.entries(predictionsData.predictions)`, keep entries with `risk_level === 'high'`,
     and build the `PredictedAlert` from `feed_id`, `feed_name` and `predictions['15_min']`.
     Write a short recommendation string on the frontend (for example "Expected to reach N in
     15 min; consider sending a guard"). Do not change the backend response.
2. **A camera thread that gives up still reports as running.**
   - In `FeedProcessor._process_feed` (`backend/app.py`), set `self.running = False` in the
     `finally` block so `/api/health` and `/api/analytics/summary` report real active feeds.
   - Make `start_processing` a no-op if a thread is already alive (keep a reference to it).
3. **Deploy scripts break long video streams.**
   - In `backend/deploy.sh` and `backend/deploy.ps1`: default region `asia-south1`, add
     `--timeout 3600` to `gcloud run deploy`. Leave CPU and memory as they are (task 01 changes them).

## Scope

In: the three fixes above. Out: refactoring `app.py`, new features, the Cloud Function proxy.

## Acceptance criteria

- With the backend running for about a minute, the Alerts page lists predicted alerts whenever
  `/api/predictions` has a `high` risk entry.
- Stopping a feed source (bad URL) makes `/api/health` `active_feeds` drop.
- Both deploy scripts use `asia-south1` and `--timeout 3600`.

## Verify

```
python -m compileall -q backend
cd frontend && npm run build
```
