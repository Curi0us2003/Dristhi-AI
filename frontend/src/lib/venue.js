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
