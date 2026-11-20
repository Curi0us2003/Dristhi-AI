# 03 — Cloud SQL data model and backend restructure

**Branch:** `feat/cloud-sql` · **Depends on:** 02 · **Size:** large

## Prompt

```
Read CLAUDE.md, docs/architecture.md and docs/tasks/03-cloud-sql.md, then do task 03.
Do part A first and show me the diff summary before starting part B.
```

## Goal

Split `backend/app.py` into the package layout from `docs/architecture.md`, add PostgreSQL +
PostGIS with migrations, and store crowd readings so history survives restarts.

## Part A — restructure without changing behaviour

1. Move code from `app.py` into `backend/dristhi/` as described in "Backend layout":
   `config.py`, `detection/processor.py` (FeedProcessor + a `ProcessorManager` with
   `start(camera)`, `stop(camera_id)`, `stop_all()`), `routers/*.py` for the existing endpoints.
2. `app.py` becomes a thin entry point that builds the app and starts processors in `lifespan`.
3. Every existing endpoint keeps the same path and response shape. Add
   `backend/tests/test_api_smoke.py` that calls each GET endpoint with FastAPI's `TestClient`
   (camera threads disabled through a `DISABLE_PROCESSORS=1` env var) and checks status 200.

## Part B — database

**If task 07a is merged**, `dristhi/db.py`, `dristhi/models.py` (organizations, events,
attendees), Alembic and `docker-compose.yml` already exist. Reuse them: move their code into
the new layout where needed, add the remaining tables in a **new** migration (the first one
also creates the `postgis` extension), and skip the items below that are already done.

1. Dependencies: `sqlalchemy>=2`, `psycopg[binary]`, `geoalchemy2`, `alembic`.
2. `dristhi/db.py`: engine from `DATABASE_URL`, `SessionLocal`, `get_db` FastAPI dependency.
3. `dristhi/models.py`: every table in the architecture data model, with PostGIS columns via
   GeoAlchemy2 (SRID 4326) and indexes on `event_id`, `(camera_id, taken_at)`, and GiST on geometry.
4. Alembic in `backend/migrations/`; first migration creates the `postgis` extension and all tables.
5. `docker-compose.yml` at the repo root with `postgis/postgis:16-3.4` for local development,
   and a `make`-free note in the README: `docker compose up -d db`, then `alembic upgrade head`.
6. `backend/scripts/seed_demo.py`: creates one organization, one `live` demo event, one zone and
   one camera per entry in `feeds.json` (zone capacity = `max_capacity`, camera location from
   `location`). Idempotent.
7. Processors read cameras from the database (status `live` events only) instead of `feeds.json`
   when `DATABASE_URL` is set; `FeedProcessor._log_data` writes a `crowd_readings` row every 10 s.
   Keep `feeds.json` as the fallback when `DATABASE_URL` is unset, so local runs without a
   database still work.
8. `/api/analytics/summary`, `/api/predictions` and `/api/export/csv` read history from
   `crowd_readings`. Current counts can stay in memory.
9. Tests: `backend/tests/conftest.py` creates a throwaway database on the compose Postgres
   (skip DB tests with a clear message if `TEST_DATABASE_URL` is unset); test the seed script
   and one reading write.

## Scope

In: package layout, models, migrations, readings, analytics from DB. Out: auth, new endpoints
for events/zones/guards (tasks 04 and 05), frontend changes.

## Acceptance criteria

- `alembic upgrade head` on an empty PostGIS database creates every table.
- After a backend restart, `/api/analytics/summary` still returns the last hour of trend data.
- Existing frontend pages keep working unchanged.

## Verify

```
docker compose up -d db
cd backend && alembic upgrade head && python scripts/seed_demo.py && pytest -q
```

## HUMAN

1. **Already done:** the instance was created through Firebase **SQL Connect** to get the
   90-day no-cost trial (project *Dhristi AI Buildathon*, region `asia-south1`, service
   `dristhi`). Find its instance ID under Google Cloud console → SQL. Do **not** create
   another instance with `gcloud sql instances create`: that has no trial and is billed at
   once.
2. **Keep the trial:**
   - Don't change instance settings: machine size, storage, private IP, high availability,
     replicas, or stopping it with `--activation-policy`.
   - Adding database users and running `CREATE EXTENSION postgis` are fine.
   - The trial ends about 18 Feb 2027. After that, normal Cloud SQL pricing applies.
   - Don't deploy a SQL Connect schema from the Firebase console; Alembic owns the tables.
3. Under SQL → your instance → **Users**, add a built-in user for the backend. Store the
   connection string as secret `DATABASE_URL`; never paste it into the chat.
4. Run migrations once against Cloud SQL from a laptop with the Cloud SQL Auth Proxy:
   `cloud-sql-proxy <project>:asia-south1:<instance-id> --port 5433`, then point
   `DATABASE_URL` at `localhost:5433`. This needs `gcloud auth application-default login`.
5. Redeploy with `--add-cloudsql-instances <project>:asia-south1:<instance-id> --set-secrets DATABASE_URL=DATABASE_URL:latest`.

Keep `--max-instances 1`: camera threads would run twice on two instances.
