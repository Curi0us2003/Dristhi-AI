/**
 * Browser geolocation for the attendee app.
 *
 * The position stays in memory. It is only sent with a help request or report the attendee
 * submits. Geolocation needs a secure context: https or localhost.
 */

const ASKED_KEY = 'dristhi.location_asked';

export const POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 30000,
};

export function geolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;
}

export function toCoords(p) {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy_m: Math.round(p.coords.accuracy),
    at: p.timestamp,
  };
}

/** Reads the permission without prompting. Safari < 16 and some webviews lack the API. */
export async function queryPermission() {
  if (!geolocationSupported()) return { state: 'unsupported' };
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return { state: status.state, status };
  } catch {
    return { state: 'prompt' };
  }
}

/** Triggers the browser prompt (when the state is `prompt`) and resolves with a position. */
export function requestPosition() {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported()) {
      reject(Object.assign(new Error('unsupported'), { code: 0 }));
      return;
    }
    navigator.geolocation.getCurrentPosition((p) => resolve(toCoords(p)), reject, POSITION_OPTIONS);
  });
}

export function wasAsked() {
  try {
    return window.localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAsked() {
  try {
    window.localStorage.setItem(ASKED_KEY, '1');
  } catch {
    // ignore
  }
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
