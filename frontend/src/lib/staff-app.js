/**
 * Staff app sign-in and feed. Staff sign in with their name and the 6-character app code shown
 * on the admin Setup → Staff page; the backend returns a session token kept in localStorage and
 * sent as X-Staff-Token.
 *
 * @typedef {{ id: string, name: string }} ZoneRef
 * @typedef {{ id: string, name: string, kind: string, status: string, event_slug: string,
 *   event_name: string, zone: ZoneRef|null }} StaffMe
 * @typedef {{ id: string, from_zone_name: string|null, to_zone_name: string|null, reason: string,
 *   created_at: string }} StaffMove
 * @typedef {{ id: string, type: string, details: string, urgency: string|null,
 *   attendee_name: string|null, attendee_phone: string|null, zone_name: string|null,
 *   location_text: string|null, accuracy_m: number|null, person_name: string|null,
 *   last_seen: string|null, submitted_at: string, assigned_at: string|null }} StaffAssignment
 * @typedef {{ staff: StaffMe, move: StaffMove|null, assignment: StaffAssignment|null }} StaffFeed
 */
import { BACKEND_URL } from '@/lib/backend-url';

const TOKEN_KEY = 'dristhi.staff_token';
const SEEN_MOVE_KEY = 'dristhi.staff_seen_move';

export class StaffError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the session lasts for this visit only.
  }
}

let memoryToken = null;
export const getToken = () => read(TOKEN_KEY) ?? memoryToken;
function setToken(token) {
  memoryToken = token;
  write(TOKEN_KEY, token);
}

export const getSeenMove = () => read(SEEN_MOVE_KEY);
export const setSeenMove = (id) => write(SEEN_MOVE_KEY, id);

async function call(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${BACKEND_URL}/api/staff${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'X-Staff-Token': token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new StaffError(0, 'network', 'Can’t reach the control room service. Check your mobile data.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new StaffError(res.status, data?.error ?? `http_${res.status}`, typeof data?.detail === 'string' ? data.detail : undefined);
  }
  return data;
}

/** @returns {Promise<StaffFeed>} */
export async function staffLogin(event, name, code) {
  const data = await call('/login', { method: 'POST', body: { event, name, code } });
  setToken(data.token);
  setSeenMove(null);
  const { token: _token, ...feed } = data;
  return feed;
}

/** @returns {Promise<StaffFeed>} Throws StaffError with status 401 when the session ended. */
export async function staffFeed() {
  const token = getToken();
  if (!token) throw new StaffError(401, 'not_signed_in');
  try {
    return await call('/me', { token });
  } catch (err) {
    if (err.status === 401) setToken(null);
    throw err;
  }
}

export async function staffLogout() {
  const token = getToken();
  setToken(null);
  setSeenMove(null);
  if (token) await call('/logout', { method: 'POST', token }).catch(() => {});
}
