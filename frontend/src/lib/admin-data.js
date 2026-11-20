/**
 * Admin app data: events, zones, staff, dispatches and reports, served by the backend from
 * Cloud SQL (backend/dristhi/routers/admin.py). Every call is scoped to the signed-in admin's
 * organization by the backend.
 */
import { api, apiBlob, toGrievance, ts, watch } from '@/lib/api';
import { parseVenue } from '@/lib/venue';

/**
 * Shapes the screens use (camelCase). The backend sends snake_case; the mappers below convert.
 *
 * @typedef {'draft' | 'live' | 'ended'} EventStatus
 * @typedef {'guard' | 'supervisor' | 'medic' | 'doctor' | 'ambulance' | 'volunteer'} StaffKind
 * @typedef {'available' | 'dispatched' | 'on_scene' | 'off_duty'} StaffStatus
 *
 * @typedef {object} EventDoc  table `events`
 * @property {string} id
 * @property {string} name
 * @property {string} venue
 * @property {string} city
 * @property {string} startsAt      datetime-local string, e.g. 2026-11-21T18:00
 * @property {string} endsAt
 * @property {EventStatus} status
 * @property {number} warningPct    zone density % that shows Warning
 * @property {number} criticalPct   zone density % that shows Critical
 * @property {number} peoplePerGuard
 * @property {string} slug         used in the attendee QR link /join?e=<slug>
 * @property {string} joinUrl      what the attendee QR code opens (backend PUBLIC_APP_URL + /join?e=<slug>)
 * @property {number | null} lat    venue pin
 * @property {number | null} lng
 *
 * @typedef {object} ZoneDoc  table `zones`
 * @property {string} id
 * @property {string} eventId
 * @property {string} name
 * @property {number} capacity
 * @property {number} minGuards
 * @property {string | null} feedId  backend camera id (feeds.json key, e.g. feed_1)
 *
 * @typedef {object} StaffDoc  table `staff`
 * @property {string} id
 * @property {string} eventId
 * @property {string} name
 * @property {string} phone
 * @property {StaffKind} kind
 * @property {StaffStatus} status
 * @property {string | null} zoneId
 *
 * @typedef {object} DispatchDoc  table `dispatches`
 * @property {string} id
 * @property {string} eventId
 * @property {string} staffId
 * @property {string} staffName
 * @property {string | null} fromZoneName
 * @property {string | null} toZoneName
 * @property {string | null} grievanceId  set when the staff member was sent to a report
 * @property {string} reason
 * @property {{ seconds: number } | null} createdAt
 *
 * @typedef {{ staff: StaffDoc, fromZone: ZoneDoc | null, toZone: ZoneDoc }} StaffMove
 */

export const STAFF_KINDS = ['guard', 'supervisor', 'medic', 'doctor', 'ambulance', 'volunteer'];
export const STAFF_STATUSES = ['available', 'dispatched', 'on_scene', 'off_duty'];

export const STAFF_KIND_LABEL = {
  guard: 'Guard',
  supervisor: 'Supervisor',
  medic: 'Medic',
  doctor: 'Doctor',
  ambulance: 'Ambulance',
  volunteer: 'Volunteer',
};

export const STAFF_STATUS_LABEL = {
  available: 'Available',
  dispatched: 'On the way',
  on_scene: 'On scene',
  off_duty: 'Off duty',
};

export const DEFAULT_EVENT = {
  name: '',
  venue: '',
  city: '',
  startsAt: '',
  endsAt: '',
  status: 'draft',
  warningPct: 70,
  criticalPct: 90,
  peoplePerGuard: 100,
  lat: null,
  lng: null,
};

// ── Mappers (backend snake_case → screen camelCase) ─────────────

/** ISO time → value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

function toEvent(e) {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    venue: e.venue ?? '',
    city: e.city ?? '',
    startsAt: toLocalInput(e.starts_at),
    endsAt: toLocalInput(e.ends_at),
    status: e.status,
    warningPct: e.warning_pct,
    criticalPct: e.critical_pct,
    peoplePerGuard: e.people_per_guard,
    attendeeCount: e.attendee_count,
    lat: e.lat,
    lng: e.lng,
    joinUrl: e.join_url ?? '',
  };
}

function fromEvent(input) {
  const out = {};
  const map = {
    name: 'name', venue: 'venue', city: 'city', status: 'status', warningPct: 'warning_pct',
    criticalPct: 'critical_pct', peoplePerGuard: 'people_per_guard', lat: 'lat', lng: 'lng',
  };
  for (const [from, to] of Object.entries(map)) if (input[from] !== undefined) out[to] = input[from];
  if (input.startsAt !== undefined) out.starts_at = fromLocalInput(input.startsAt);
  if (input.endsAt !== undefined) out.ends_at = fromLocalInput(input.endsAt);
  return out;
}

const toZone = (z) => ({
  id: z.id, eventId: z.event_id, name: z.name, capacity: z.capacity, minGuards: z.min_guards, feedId: z.feed_id,
});

function fromZone(input) {
  const out = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.capacity !== undefined) out.capacity = input.capacity;
  if (input.minGuards !== undefined) out.min_guards = input.minGuards;
  if (input.feedId !== undefined) out.feed_id = input.feedId || null;
  return out;
}

const toStaff = (s) => ({
  id: s.id, eventId: s.event_id, name: s.name, phone: s.phone ?? '', kind: s.kind, status: s.status,
  zoneId: s.zone_id, lat: s.lat, lng: s.lng,
});

function fromStaff(input) {
  const out = {};
  for (const key of ['name', 'kind', 'status', 'lat', 'lng']) if (input[key] !== undefined) out[key] = input[key];
  if (input.phone !== undefined) out.phone = input.phone || null;
  if (input.zoneId !== undefined) out.zone_id = input.zoneId || null;
  return out;
}

const toDispatch = (d) => ({
  id: d.id, eventId: d.event_id, staffId: d.staff_id, staffName: d.staff_name,
  fromZoneName: d.from_zone_name, toZoneName: d.to_zone_name, grievanceId: d.grievance_id,
  reason: d.reason, createdAt: ts(d.created_at),
});

const ev = (eventId) => `/api/events/${encodeURIComponent(eventId)}`;

// ── Subscriptions (polling) ──────────────────────────────────────

export function watchEvents(cb, onError) {
  return watch(async () => (await api('/api/events')).map(toEvent), cb, onError);
}

export function watchZones(eventId, cb) {
  return watch(async () => (await api(`${ev(eventId)}/zones`)).map(toZone), cb);
}

export function watchStaff(eventId, cb) {
  return watch(async () => (await api(`${ev(eventId)}/staff`)).map(toStaff), cb);
}

export function watchDispatches(eventId, cb) {
  return watch(async () => (await api(`${ev(eventId)}/dispatches`)).map(toDispatch), cb);
}

/** Reports of the event, newest first. `status` = 'new' for open ones only. */
export function watchGrievances(eventId, cb, status) {
  const q = status ? `?status=${status}` : '';
  return watch(async () => (await api(`${ev(eventId)}/grievances${q}`)).map(toGrievance), cb);
}

/** Zones and facilities of the event from Cloud SQL (same data as the attendee map, any status). */
export async function fetchAdminVenueMap(eventId) {
  return parseVenue(await api(`${ev(eventId)}/venue-map`));
}

// ── Events ───────────────────────────────────────────────────────

export async function createEvent(input) {
  const created = await api('/api/events', { method: 'POST', body: fromEvent(input) });
  return created.id;
}

export function updateEvent(id, input) {
  return api(ev(id), { method: 'PATCH', body: fromEvent(input) });
}

// ── Zones ────────────────────────────────────────────────────────

export function createZone(input) {
  return api(`${ev(input.eventId)}/zones`, { method: 'POST', body: fromZone(input) });
}

/** Zone ids are unique, but the route is nested under the event: pass the zone's eventId. */
export function updateZone(id, input, eventId = input.eventId) {
  return api(`${ev(eventId ?? currentEventId)}/zones/${id}`, { method: 'PATCH', body: fromZone(input) });
}

/** Deletes a zone; the backend unassigns the staff who were in it. */
export function deleteZone(zone) {
  return api(`${ev(zone.eventId)}/zones/${zone.id}`, { method: 'DELETE' });
}

// ── Staff ────────────────────────────────────────────────────────

export function createStaff(input) {
  return api(`${ev(input.eventId)}/staff`, { method: 'POST', body: [fromStaff(input)] });
}

export async function createStaffMany(inputs) {
  if (!inputs.length) return;
  await api(`${ev(inputs[0].eventId)}/staff`, { method: 'POST', body: inputs.map(fromStaff) });
}

export function updateStaff(id, input, eventId = input.eventId) {
  return api(`${ev(eventId ?? currentEventId)}/staff/${id}`, { method: 'PATCH', body: fromStaff(input) });
}

export function deleteStaff(id, eventId) {
  return api(`${ev(eventId ?? currentEventId)}/staff/${id}`, { method: 'DELETE' });
}

/** Moves staff between zones in one transaction and logs each move as a dispatch. */
export function approveMoves(eventId, moves, reason) {
  return api(`${ev(eventId)}/dispatches/moves`, {
    method: 'POST',
    body: { moves: moves.map((m) => ({ staff_id: m.staff.id, to_zone_id: m.toZone.id })), reason },
  });
}

/** Sends a staff member to a report: report assigned, staff on scene, move logged. */
export function assignStaffToGrievance(eventId, staff, grievanceId, reason) {
  return api(`${ev(eventId)}/grievances/${grievanceId}/assign`, {
    method: 'POST',
    body: { staff_id: staff.id, reason },
  });
}

// ── Reports and attendee messages ────────────────────────────────

export function resolveGrievance(eventId, grievanceId, actionTaken) {
  return api(`${ev(eventId)}/grievances/${grievanceId}/resolve`, {
    method: 'POST',
    body: { action_taken: actionTaken },
  });
}

export function deleteGrievance(eventId, grievanceId) {
  return api(`${ev(eventId)}/grievances/${grievanceId}`, { method: 'DELETE' });
}

export function notifyAttendee(eventId, attendeeId, message) {
  return api(`${ev(eventId)}/notifications`, {
    method: 'POST',
    body: { attendee_id: attendeeId, message },
  });
}

/**
 * Routes for zones and staff are nested under the event. Screens that only pass an id use the
 * event picked in the switcher (contexts/event-context.jsx sets this).
 */
let currentEventId = null;
export function setCurrentEventId(id) {
  currentEventId = id;
}

export function densityStatus(pct, event) {
  if (pct === null) return 'No data';
  if (pct >= event.criticalPct) return 'Critical';
  if (pct >= event.warningPct) return 'Warning';
  return 'Normal';
}

// ── Roster views for older screens ───────────────────────────────

export const GUARD_KINDS = ['guard', 'supervisor'];
export const MEDICAL_KINDS = ['medic', 'doctor'];

/**
 * The Dashboard summary was written for the old `guards`,
 * `ambulances` and `medical_staff` collections. This builds the same shapes from the event's
 * staff roster so those screens read one source of truth. `id` is always the staff doc id.
 *
 * @param {StaffDoc[]} staff
 * @param {ZoneDoc[]} zones
 */
export function rosterViews(staff, zones) {
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? null;
  const onDuty = staff.filter((s) => s.status !== 'off_duty');

  const guards = onDuty
    .filter((s) => GUARD_KINDS.includes(s.kind))
    .map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      sector: zoneName(s.zoneId) ?? 'Standby Pool',
      // Old vocabulary: Active = posted in a zone, Standby = free to move, Alert = busy at an incident.
      status: s.status === 'on_scene' ? 'Alert' : s.status === 'available' && !s.zoneId ? 'Standby' : 'Active',
    }));

  const ambulances = staff
    .filter((s) => s.kind === 'ambulance')
    .map((s) => ({
      id: s.id,
      ambulanceNumber: s.name,
      zone: zoneName(s.zoneId) ?? 'Unassigned',
      isAvailable: s.status === 'available',
    }));

  const medicalStaff = staff
    .filter((s) => MEDICAL_KINDS.includes(s.kind))
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status === 'available' ? 'available' : s.status === 'off_duty' ? 'off-duty' : 'on-duty',
      specialization: STAFF_KIND_LABEL[s.kind],
    }));

  return { guards, ambulances, medicalStaff };
}

// ── Attendee QR code ─────────────────────────────────────────────

/** PNG of the event's attendee QR code (opens /join?e=<slug>), as a Blob. */
export function fetchEventQr(eventId) {
  return apiBlob(`${ev(eventId)}/qr.png`);
}
