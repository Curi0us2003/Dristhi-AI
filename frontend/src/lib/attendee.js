/**
 * Anonymous attendee identity (task 07a).
 *
 * Scanning the event QR opens /join?e=<slug>. The browser gets a random device id, the backend
 * hands out the next "Attendee N" for that event, and both are kept in localStorage so a reload
 * or a second scan keeps the same number. There is no sign-in: the attendee id is only used to
 * label reports and to show the attendee their own reports and notifications.
 */
import { BACKEND_URL } from '@/lib/backend-url';

export class JoinError extends Error {
  code;
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
    this.name = 'JoinError';
  }
}

const DEVICE_KEY = 'dristhi.device_id';
const ATTENDEE_KEY = 'dristhi.attendee';
const LOCAL_COUNTER_KEY = 'dristhi.local_attendee_number';

/** Lets the app run before the join API (task 07a part A) is deployed. Not a secret. */
const LOCAL_JOIN_ALLOWED = process.env.NEXT_PUBLIC_ATTENDEE_LOCAL_JOIN === '1';

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode, strict settings): the app still works for this visit.
  }
}

let memoryDeviceId = null;

function randomId() {
  // randomUUID needs a secure context (https or localhost); fall back to getRandomValues.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function getDeviceId() {
  const saved = readStorage(DEVICE_KEY);
  if (saved) return saved;
  if (!memoryDeviceId) memoryDeviceId = randomId();
  writeStorage(DEVICE_KEY, memoryDeviceId);
  return memoryDeviceId;
}

export function getSavedAttendee() {
  const raw = readStorage(ATTENDEE_KEY);
  if (!raw) return null;
  try {
    const a = JSON.parse(raw);
    return a && a.attendee_id && a.event?.slug ? a : null;
  } catch {
    return null;
  }
}

export function saveAttendee(a) {
  writeStorage(ATTENDEE_KEY, a ? JSON.stringify(a) : null);
}

function localAttendee(slug) {
  const saved = getSavedAttendee();
  if (saved && saved.event.slug === slug) return saved;
  const n = Number(readStorage(LOCAL_COUNTER_KEY) ?? '0') + 1;
  writeStorage(LOCAL_COUNTER_KEY, String(n));
  return {
    attendee_id: `local-${getDeviceId()}`,
    number: n,
    display_name: `Attendee ${n}`,
    event: { slug, name: slug === 'demo' ? 'Demo event' : slug },
    local: true,
  };
}

export async function joinEvent(slug) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/events/${encodeURIComponent(slug)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: getDeviceId() }),
    });
  } catch {
    if (LOCAL_JOIN_ALLOWED) return keep(localAttendee(slug));
    throw new JoinError('network');
  }

  if (res.ok) return keep(await res.json());

  const body = await res.json().catch(() => ({}));
  const code = body?.detail?.code ?? body?.code ?? body?.detail;
  if (res.status === 404 && code === 'event_not_found') throw new JoinError('event_not_found');
  if (res.status === 503) {
    if (LOCAL_JOIN_ALLOWED) return keep(localAttendee(slug));
    throw new JoinError('database_not_configured');
  }
  // 404 without our code means the backend has no join route yet (part A not deployed).
  if (res.status === 404 && LOCAL_JOIN_ALLOWED) return keep(localAttendee(slug));
  throw new JoinError(res.status === 404 ? 'event_not_found' : 'network', `HTTP ${res.status}`);
}

function keep(a) {
  saveAttendee(a);
  return a;
}

/** Refreshes the saved attendee from the backend. Returns null if it no longer exists. */
export async function refreshAttendee(a) {
  if (a.local) return a;
  try {
    const res = await fetch(`${BACKEND_URL}/api/attendees/${encodeURIComponent(a.attendee_id)}`);
    if (res.status === 404) return null;
    if (!res.ok) return 'offline';
    return keep(await res.json());
  } catch {
    return 'offline';
  }
}

/** Who a report comes from, as stored on grievances and notifications. */
export function toReporter(a) {
  return a ? { attendeeId: a.attendee_id, displayName: a.display_name, eventSlug: a.event.slug } : null;
}
