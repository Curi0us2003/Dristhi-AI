# Design system for the redesign

The mockups in `mockups/` are the source of truth for the look. Each is a self-contained HTML
file with inline styles; open it in a browser or read its markup for exact values.

| Mockup | Screen |
| --- | --- |
| `mockups/Login.dc.html` | Operator login (attendees never see this page) |
| `mockups/Dashboard.dc.html` | Operator overview dashboard |
| `mockups/VenueSetup.dc.html` | Event setup step 3: drawing the venue map |
| `mockups/AttendeeChat.dc.html` | Attendee chatbot with a report draft to review |
| `mockups/AttendeeMap.dc.html` | Attendee nearest-facility map |
| `mockups/AttendeePass.dc.html` | **Later (task 07):** personal pass with phone verification. During the demo phase (task 07a) the event QR opens the attendee app directly, with no sign-in screens. |

The `.dc.html` files contain a small `<script type="text/x-dc">` block and `{{ }}` holes used by
the design tool. Ignore those; use the markup and inline styles as the reference.

## Principles

- Minimal: off-white ground, white cards with a 1px border, one teal accent, generous spacing.
- One primary action per view, in the accent colour.
- Status always shows a word next to its colour (Critical, Warning, Predicted, Normal).
- Real buttons, links and labelled inputs; touch targets at least 44px on mobile.
- Every page works at phone width: side nav stacks, grids collapse, wide tables scroll.

## Tokens

Add these as CSS variables in `frontend/src/app/globals.css` and map them in `tailwind.config.ts`.

| Token | Value | Use |
| --- | --- | --- |
| `--ground` | `#F4F5F1` | Page background |
| `--surface` | `#FCFCFA` | Cards, nav, inputs |
| `--border` | `#E3E6E0` | Card and nav borders |
| `--divider` | `#ECEFE9` | Row dividers, bar tracks |
| `--input-border` | `#D3D9D1` | Inputs, secondary buttons |
| `--ink` | `#14202E` | Main text |
| `--ink-2` | `#3B4655` | Secondary text, nav items |
| `--muted` | `#5B6675` | Captions, meta |
| `--accent` | `#0E7C6B` | Primary buttons, normal bars, active nav |
| `--accent-ink` | `#0B5E52` | Text on accent tint, links |
| `--accent-tint` | `#E3F1EC` | Active nav, info notes, selected chips |
| `--dark` | `#0F1B2A` | Login brand panel |
| `--dark-2` | `#14202E` | AI plan card |
| `--accent-on-dark` | `#5CC9B0` | Accent on dark surfaces |
| `--critical` / `--critical-tint` / `--critical-bar` | `#9A3412` / `#FBE4DA` / `#C2410C` | Critical status |
| `--warning` / `--warning-tint` / `--warning-bar` | `#8A5A00` / `#FBF0D9` / `#D99A2B` | Warning status |
| `--predicted` / `--predicted-tint` | `#234E86` / `#E3ECF8` | Predicted status |

Map legend colours (also used for map markers):

| Kind | Colour |
| --- | --- |
| Washroom | `#234E86` |
| First aid | `#C2410C` |
| Exit | `#0E7C6B` |
| Water | `#2B6CB0` |
| Lost and found | `#8A5A00` |
| Cloak room | `#6B4FA0` |
| Camera | `#14202E` |
| You are here | `#2B6CB0` with a pale halo |

## Type and shape

- Fonts: Inter (body, 400/500/600) and Space Grotesk (headings and big numbers, 500/600),
  loaded with `next/font/google`.
- Sizes: 13px meta, 14px body and nav, 15–16px card titles, 26–32px page titles, 32px KPI numbers.
- Radius: 10px buttons and inputs, 12px small tiles, 16px cards, 999px pills.
- Icons: `lucide-react` (already installed), 18–20px, 1.75 stroke.
- Dark mode: keep the existing theme toggle; derive dark values from the same hues.
