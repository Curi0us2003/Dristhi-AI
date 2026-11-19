# 09 — Navigation, offline mode and SOS

**Branch:** `feat/offline-sos` · **Depends on:** 06, 08 · **Size:** medium

## Prompt

```
Read CLAUDE.md, docs/architecture.md, docs/design/README.md and docs/tasks/09-offline-sos.md,
then do task 09. Match docs/design/mockups/AttendeeMap.dc.html for the map.
```

## Goal

Attendees can find the nearest facility, and the attendee app stays useful when mobile networks
are jammed or overloaded: the map works offline, reports queue until a connection returns, and
an SOS button never pretends a message was sent.

## Steps

1. `GET /api/events/{id}/pois/nearest?kind=washroom&lat=&lng=&limit=3`: PostGIS
   `ST_Distance` on `geography`, returns name, distance in metres, location. Attendee of that event only.
2. Attendee map page per the mockup: "you are here" from `navigator.geolocation` with accuracy;
   nearest list with distance and walking time (distance ÷ 1.2 m/s); legend.
   Location is requested only when needed. If denied or accuracy > 50 m, show "Pick your zone"
   and measure from the zone centre.
3. Offline (PWA):
   - Web app manifest and a service worker that caches the app shell and, per event, the
     `/map` GeoJSON and help-point list. Check the tool you pick works with `output: 'export'`
     (for example Serwist, or a small hand-written `public/sw.js`).
   - Nearest-facility works offline using the cached GeoJSON and a haversine distance on the device.
   - Reports created offline go to an IndexedDB queue and are sent when `online` fires or on
     the next app open. The UI shows "Not sent yet" until the server confirms.
4. SOS button (attendee app, always visible):
   - Tries the API (`POST /api/events/{id}/sos` with location; creates an urgent medical
     grievance and alerts the dashboard).
   - If that fails: offers an `sms:` link to the event's control-room number with a prefilled
     message including location; add `control_room_phone` to events.
   - If that fails or there is no signal: full-screen "MEDICAL HELP NEEDED" view, nearest help
     point and first-aid post from the offline map, optional loud alarm (Web Audio) and flashlight
     where the browser supports the camera `torch` constraint; keeps retrying in the background.
   - Never show "sent" unless the server confirmed.
5. Operator dashboard: SOS alerts appear at the top with a sound and the attendee's location.

## Acceptance criteria

- In Chrome DevTools with the network offline, the attendee map and nearest washroom still work.
- A report written offline is delivered after going back online, without user action.
- With the network offline, SOS shows the help screen and clearly says the alert was not sent.

## Verify

```
cd backend && pytest -q
cd frontend && npm run typecheck && npm run build
```

Then test offline behaviour manually in DevTools → Network → Offline and report the result.
