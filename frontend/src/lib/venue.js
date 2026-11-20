/** Venue areas and live crowd levels from the crowd backend (`GET /api/feeds`). */
import { BACKEND_URL } from '@/lib/backend-url';

export async function fetchZones() {
  const res = await fetch(`${BACKEND_URL}/api/feeds`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Object.entries(data.feeds ?? {}).map(([id, f]) => ({
    id,
    name: f.name,
    area: f.area,
    level: f.alert_level === 'critical' || f.alert_level === 'warning' ? f.alert_level : 'normal',
    updatedAt: f.last_updated ?? null,
  }));
}

/** Words the attendee sees for each level. Status is never colour alone. */
export const CROWD_WORD = {
  critical: 'Very crowded',
  warning: 'Busy',
  normal: 'Quiet',
};

/* ── Venue map (task 06a) ─────────────────────────────────────────────── */

/**
 * Facility kinds with the legend colours from docs/design/README.md.
 * `short` is the text inside the map marker; every marker also has its full name as a label.
 */
export const POI_KINDS = {
  washroom: { label: 'Washroom', plural: 'Washrooms', short: 'WC', color: '#234E86' },
  water: { label: 'Water', plural: 'Water points', short: 'W', color: '#2B6CB0' },
  first_aid: { label: 'First aid', plural: 'First aid posts', short: '+', color: '#C2410C' },
  exit: { label: 'Exit', plural: 'Exits', short: 'EX', color: '#0E7C6B' },
  help_point: { label: 'Help point', plural: 'Help points', short: '?', color: '#0B5E52' },
  lost_found: { label: 'Lost and found', plural: 'Lost and found', short: 'LF', color: '#8A5A00' },
  cloak_room: { label: 'Cloak room', plural: 'Cloak rooms', short: 'CR', color: '#6B4FA0' },
  stage: { label: 'Stage', plural: 'Stages', short: 'S', color: '#3B4655' },
};

/** Kinds offered as "find nearest" choices, in display order. */
export const NEAREST_KINDS = ['washroom', 'water', 'first_aid', 'exit', 'help_point', 'lost_found'];

/** Maps older free-text names (assistant, earlier links) to a kind. */
export function kindFromName(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  if (POI_KINDS[n]) return n;
  if (/wash|toilet|restroom|wc/.test(n)) return 'washroom';
  if (/water|hydrat|drink/.test(n)) return 'water';
  if (/first|medic|aid|doctor/.test(n)) return 'first_aid';
  if (/exit|gate|way out/.test(n)) return 'exit';
  if (/help|info|desk/.test(n)) return 'help_point';
  if (/lost|found/.test(n)) return 'lost_found';
  if (/cloak|locker|bag/.test(n)) return 'cloak_room';
  if (/stage/.test(n)) return 'stage';
  return null;
}

const MAP_CACHE_KEY = 'dristhi.venue_map';

/**
 * @typedef {{lat: number, lng: number}} LatLng
 * @typedef {{id: string, name: string, capacity: number, feedId: string|null, center: LatLng, paths: LatLng[]}} Zone
 * @typedef {{id: string, kind: string, name: string, zoneId: string|null, position: LatLng}} Poi
 * @returns {Promise<{zones: Zone[], pois: Poi[], cached: boolean}>}
 */
export async function fetchVenueMap(slug) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/events/${encodeURIComponent(slug)}/map`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const venue = parseVenue(await res.json());
    try {
      window.localStorage.setItem(MAP_CACHE_KEY, JSON.stringify({ slug, venue }));
    } catch {
      // Storage blocked: the map still works while online.
    }
    return { ...venue, cached: false };
  } catch (err) {
    // Offline or backend down: fall back to the last map this phone saw for this event.
    try {
      const saved = JSON.parse(window.localStorage.getItem(MAP_CACHE_KEY) ?? 'null');
      if (saved?.slug === slug) return { ...saved.venue, cached: true };
    } catch {
      // ignore
    }
    throw err;
  }
}

/** GeoJSON from the backend → zones (with outline, centre, camera feed) and facilities. */
export function parseVenue(fc) {
  const zones = [];
  const pois = [];
  for (const f of fc.features ?? []) {
    const p = f.properties ?? {};
    if (p.type === 'zone' && f.geometry?.type === 'Polygon') {
      zones.push({
        id: p.id,
        name: p.name,
        capacity: p.capacity,
        feedId: p.feed_id ?? null,
        center: { lng: p.center[0], lat: p.center[1] },
        paths: f.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng })),
      });
    } else if (p.type === 'poi' && f.geometry?.type === 'Point') {
      const [lng, lat] = f.geometry.coordinates;
      pois.push({ id: p.id, kind: p.kind, name: p.name, zoneId: p.zone_id, position: { lat, lng } });
    }
  }
  return { zones, pois };
}

/** Straight-line distance in metres (haversine). Paths inside a venue aren't known. */
export function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Walking time at 1.2 m/s, rounded to whole minutes (at least 1). */
export function walkMinutes(m) {
  return Math.max(1, Math.round(m / 1.2 / 60));
}

export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10 || 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** The `limit` facilities of `kind` closest to `from`, with their distance. */
export function nearestPois(pois, kind, from, limit = 3) {
  return pois
    .filter((p) => p.kind === kind)
    .map((p) => ({ ...p, distance: from ? distanceM(from, p.position) : null }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.name.localeCompare(b.name))
    .slice(0, limit);
}
