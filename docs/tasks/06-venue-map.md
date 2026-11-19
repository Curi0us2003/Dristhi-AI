# 06 — Venue map editor

**Branch:** `feat/venue-map` · **Depends on:** 05 · **Size:** medium

## Prompt

```
Read CLAUDE.md, docs/architecture.md, docs/design/README.md and docs/tasks/06-venue-map.md,
then do task 06. Match docs/design/mockups/VenueSetup.dc.html.
```

## Goal

Step 3 of the setup wizard: the admin draws zones and places facilities and cameras on a Google
Map; the operator map and the attendee map show them with a legend.

## Steps

1. Backend:
   - `zones` CRUD: polygon in and out as GeoJSON; validate the polygon is closed and valid
     (`ST_IsValid`); capacity required.
   - `pois` CRUD with `kind` from the architecture list.
   - Camera location and `zone_id` editable from the map.
   - `GET /api/events/{id}/map`: zones, POIs and cameras as one GeoJSON FeatureCollection,
     readable by admins and by attendees of that event (attendees get no camera URLs).
2. Frontend editor (`@react-google-maps/api`, already installed):
   - The Maps Drawing Library is deprecated; do not use it. Draw zones with click-to-add
     vertices and an editable `google.maps.Polygon` (`editable: true`), or with Terra Draw.
   - Toolbar buttons from the mockup: Zone, Camera, Washroom, First aid, Exit, Water, Lost and
     found, Cloak room, Help point. Markers use the legend colours in `docs/design/README.md`.
   - Side panel: zone list with capacity and camera count; legend with counts.
   - Undo the last vertex, delete a selected item, autosave on change.
3. Operator map page: zones coloured by live density (normal / warning / critical), with the
   status word in the zone label; markers for facilities and cameras.
4. Tests: zone and POI endpoints, GeoJSON round trip, attendee cannot see camera URLs.

## Acceptance criteria

- An admin can draw three zones and place one of each facility type in under five minutes.
- Reloading the page shows exactly what was drawn.
- The operator map colours zones by density with the status word visible.

## Verify

```
cd backend && pytest -q
cd frontend && npm run typecheck && npm run build
```

## HUMAN

- Google Maps API key restricted by HTTP referrer to the app's domains and to the Maps JavaScript API.
