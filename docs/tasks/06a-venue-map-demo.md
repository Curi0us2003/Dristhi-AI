# 06a — Venue map and nearest facility (demo)

**Branch:** `feat/venue-map-demo` · **Depends on:** 07a part A (database, `events`) · **Size:** medium

## Prompt

```
Read CLAUDE.md, docs/architecture.md, docs/design/README.md and docs/tasks/06a-venue-map-demo.md,
then do task 06a. Match docs/design/mockups/AttendeeMap.dc.html for the attendee map.
```

## Goal

Attendees see the real venue on Google Maps: zones, facilities with the legend colours, where they
are, and the nearest washroom / water / first aid / exit with distance and walking time. The venue
comes from Cloud SQL. Drawing the venue in the admin setup wizard stays in task 06, which needs
operator login (04) and events (05); until then the demo venue is loaded by the seed script.

## Steps

1. **Database** (new migration `0002`; never edit `0001`):
   - `CREATE EXTENSION IF NOT EXISTS postgis`.
   - `zones`: id, event_id, name, capacity, polygon (`POLYGON`, SRID 4326), GiST index.
   - `pois`: id, event_id, zone_id?, kind (`washroom` / `first_aid` / `exit` / `water` /
     `lost_found` / `cloak_room` / `help_point` / `stage`), name, location (`POINT`, 4326), GiST index.
   - Models with GeoAlchemy2.
2. **Demo venue:** `backend/data/demo_venue.geojson` with one zone per camera in `feeds.json`
   (capacity = `max_capacity`) and at least one facility of each kind. `seed_demo.py` loads it
   for the `demo` event when the event has no zones yet (`--reset-venue` replaces it), and sets
   each facility's `zone_id` with `ST_Contains`.
3. **API:** `GET /api/events/{slug}/map`, public like the join route (same 404 rules):
   one GeoJSON FeatureCollection. Zones: `Polygon` with `{type: "zone", id, name, capacity,
   center: [lng, lat]}` (`center` from `ST_PointOnSurface`). Facilities: `Point` with
   `{type: "poi", id, kind, name, zone_id}`. No camera data.
4. **Attendee map page** (`/user/map?kind=washroom`), per the mockup:
   - Google Map with the Map ID from `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, zone outlines with
     names, facility markers in the legend colours (`docs/design/README.md`), "you are here"
     dot with an accuracy circle.
   - Kind chips (Washroom, Water, First aid, Exit, Help point, Lost and found) and a nearest
     list: name, distance, "about N min walk" (distance ÷ 1.2 m/s), computed on the phone with
     haversine so it can work offline later (task 09).
   - No position: offer "Use my location" and "Pick your zone" (measures from the zone's
     `center`). Accuracy worse than 50 m: show distances as approximate and suggest picking
     a zone. Always offer "Location wrong? Pick your zone"; the pick is remembered per event.
   - Cache the last map in `localStorage` so the list still works when the network drops.
   - Without a Maps key or when the map fails to load, the nearest list still works.
   - Follow the position (`watchPosition`) only while the page is open.
   - Home "Find nearest" tiles and the assistant's map links open the right kind.
5. **Tests:** migration creates the tables; map endpoint shape; facilities get a zone; unknown or
   draft event → 404; no database → 503; seed is idempotent.

## Scope

In: tables, demo venue, map endpoint, attendee map. Out: drawing the venue (06), operator map
colouring by zone density (06, needs cameras linked to zones in task 03/05), offline cache (09),
walking routes (Google does not know paths inside a venue; straight-line distance is used).

## Verify

```
cd backend && alembic upgrade head && python scripts/seed_demo.py && pytest -q
python -m compileall -q backend
cd frontend && npm run build
```

Then open `/user/map` at 390 px and 1280 px: with location allowed, denied, and with "Pick your zone".

## HUMAN

- Google Cloud: Maps JavaScript API enabled; a browser key restricted to the app's websites and
  to the Maps JavaScript API; a JavaScript vector **Map ID**; a daily quota on map loads.
- Put the key and Map ID in `frontend/.env` (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
  `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`). Add the deployed domain to the key's website list in task 02.
