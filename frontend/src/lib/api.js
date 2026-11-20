/**
 * Calls to the FastAPI backend, which owns all data (Cloud SQL). The browser never talks to a
 * database directly.
 *
 * - `api()` is for operator screens: it sends the Firebase ID token of the signed-in admin.
 * - `attendeeApi()` is for the attendee app: no sign-in, it sends the device id it joined with.
 * - `watch()` replaces live database listeners: it polls, and `refreshWatchers()` re-runs every
 *   active poll right after a change so the screen updates at once.
 */
import { auth } from '@/lib/firebase';
import { BACKEND_URL } from '@/lib/backend-url';
import { getDeviceId } from '@/lib/attendee';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Backend errors are {"error": "<code>", "detail": "<text>"}; validation errors are FastAPI's 422.
    const code = data?.error ?? (res.status === 422 ? 'invalid_input' : `http_${res.status}`);
    const detail = typeof data?.detail === 'string' ? data.detail : undefined;
    throw new ApiError(res.status, code, detail);
  }
  return data;
}

/** Operator request with the admin's Firebase ID token. */
export async function api(path, options = {}) {
  // After a page load Firebase restores the session asynchronously; wait for it.
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'not_signed_in', 'Sign in first.');
  const token = await user.getIdToken();
  const result = await request(path, { ...options, headers: { Authorization: `Bearer ${token}` } });
  if (options.method && options.method !== 'GET') refreshWatchers();
  return result;
}

/** Attendee request, identified by the device id the browser joined with. */
export async function attendeeApi(path, options = {}) {
  const result = await request(path, { ...options, headers: { 'X-Device-Id': getDeviceId() } });
  if (options.method && options.method !== 'GET') refreshWatchers();
  return result;
}

/** Public request (no identity), e.g. the event's missing-person alerts. */
export function publicApi(path) {
  return request(path);
}

// ── Polling in place of live listeners ──────────────────────────

const watchers = new Set();

/**
 * Calls `load()` now and every `intervalMs`, passing results to `cb`. Returns an unsubscribe
 * function, like the listeners it replaces.
 */
export function watch(load, cb, onError, intervalMs = 5000) {
  let stopped = false;
  const run = async () => {
    try {
      const value = await load();
      if (!stopped) cb(value);
    } catch (err) {
      if (!stopped) (onError ?? ((e) => console.error('watch', e)))(err);
    }
  };
  watchers.add(run);
  run();
  const timer = setInterval(run, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
    watchers.delete(run);
  };
}

export function refreshWatchers() {
  watchers.forEach((run) => run());
}

// ── Shapes ──────────────────────────────────────────────────────

/** ISO time → `{ seconds }`, the shape screens already format. */
export function ts(iso) {
  return iso ? { seconds: Math.floor(new Date(iso).getTime() / 1000) } : null;
}

/** Backend grievance → the camelCase shape the screens use. */
export function toGrievance(g) {
  return {
    id: g.id,
    eventId: g.event_id,
    attendeeId: g.attendee_id,
    type: g.type,
    details: g.details,
    submittedBy: g.submitted_by,
    email: g.email,
    urgency: g.urgency,
    location: g.location_text,
    personName: g.person_name,
    lastSeen: g.last_seen,
    photoDataUri: g.photo_data_uri,
    coords: g.coords,
    status: g.status,
    assignedStaffId: g.assigned_staff_id,
    assignedStaffName: g.assigned_staff_name,
    assignedStaffKind: g.assigned_staff_kind,
    assignedAt: ts(g.assigned_at),
    actionTaken: g.action_taken,
    resolvedAt: ts(g.resolved_at),
    submittedAt: ts(g.submitted_at),
  };
}
