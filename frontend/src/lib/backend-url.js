/**
 * Origin of the crowd-monitoring FastAPI backend.
 * - Unset            → local dev default http://127.0.0.1:5000
 * - Set to a URL     → that backend directly (deployed: the Cloud Run URL)
 */
export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:5000').replace(
  /\/$/,
  '',
);

/**
 * Origin to use for long-lived MJPEG streams.
 *
 * Browsers allow only 6 concurrent HTTP/1.1 connections per host, and each
 * camera stream holds one open, so 8 cameras on a local (HTTP/1.1) backend
 * starve each other. For a local backend we alternate between the two names of
 * the loopback host, giving each its own connection pool. Remote backends
 * (Cloud Run serves HTTP/2) are returned unchanged.
 */
export function streamOrigin(index) {
  if (index % 2 === 0) return BACKEND_URL;
  if (BACKEND_URL.includes('//127.0.0.1')) return BACKEND_URL.replace('//127.0.0.1', '//localhost');
  if (BACKEND_URL.includes('//localhost')) return BACKEND_URL.replace('//localhost', '//127.0.0.1');
  return BACKEND_URL;
}
