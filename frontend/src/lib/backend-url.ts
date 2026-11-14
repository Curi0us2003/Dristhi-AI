/**
 * Origin of the crowd-monitoring FastAPI backend.
 * - Unset            → local dev default http://127.0.0.1:5000
 * - Set to ""        → same-origin "/api/**" (Firebase Hosting proxies it via the Cloud Function)
 * - Set to a URL     → that backend directly
 */
export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://127.0.0.1:5000').replace(/\/$/, '');
