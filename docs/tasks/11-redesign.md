# 11 — Frontend redesign

**Branch:** `feat/redesign-<screen>` (one per screen) · **Depends on:** 04 for data access · **Size:** medium per screen

## Prompt

```
Read CLAUDE.md, docs/design/README.md and docs/tasks/11-redesign.md, then do task 11 for the
<screen name> screen only. The mockup is docs/design/mockups/<file>.dc.html.
```

Do step 1 once (first PR), then one screen per PR.

## Goal

Rebuild every screen in the minimal style of the mockups, keeping behaviour and data access unchanged.

## Steps

1. **Foundation (first PR only):**
   - Add the tokens from `docs/design/README.md` as CSS variables in
     `frontend/src/app/globals.css` (light and dark) and map them in `tailwind.config.js`.
   - Load Inter and Space Grotesk with `next/font/google` in `src/app/layout.jsx`.
   - Update the shadcn/ui components in `src/components/ui/` (button, card, input, badge,
     tabs, table) to use the tokens, radii and sizes from the design README.
   - Add a `StatusBadge` component (Critical / Warning / Predicted / Normal: colour plus word).
   - Add an operator shell: left nav per the dashboard mockup (stacks on mobile), header with
     event switcher, live pill, search and account button.
2. **Screens, in this order** (each its own PR):

   | Screen | Route | Mockup |
   | --- | --- | --- |
   | Login (operators only) | `/login` | `Login.dc.html` |
   | Operator dashboard | `/dashboard` | `Dashboard.dc.html` |
   | Alerts | `/alerts` | dashboard alert card style |
   | Live cameras | `/live-feed` | dashboard camera tile style |
   | Reports (grievances) | `/grievances` | dashboard card and table style |
   | Venue map | `/map-view` | `VenueSetup.dc.html` map styling |
   | Setup wizard | `/setup` | `VenueSetup.dc.html` |
   | Attendee join (loading and errors) | `/join` | `AttendeeChat.dc.html` colours, plus the error layout of screen 4 in `AttendeePass.dc.html` |
   | Attendee chat | `/user/dashboard` | `AttendeeChat.dc.html` |
   | Attendee map | attendee map view | `AttendeeMap.dc.html` |

3. For each screen: match layout, spacing, type and colours of the mockup; keep all existing
   data loading and actions; make it work at 390 px wide; keyboard focus visible; every icon-only
   button has an `aria-label`; text contrast at least 4.5:1.
4. Remove components that become unused (old nav, old header) in the same PR.

## Scope

In: visual layer and layout. Out: API changes, new features. If a screen needs data that does
not exist yet, show a placeholder and list it under Follow-ups.

## Acceptance criteria

- Side-by-side with the mockup at 1440 px, the screen matches in structure, spacing and colour.
- At 390 px wide there is no horizontal scroll.
- `npm run build` passes; no console errors on the page.

## Verify

```
cd frontend && npm run build
```

Then check the screen in a browser at 1440 px and 390 px wide and describe any differences from the mockup.
