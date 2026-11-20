/**
 * Rule-based guard redistribution: zones with more guards than they need give guards to zones
 * that need more, busiest zone first, taking from the quietest zones. Pure functions, no I/O.
 *
 * @typedef {import('./admin-data').StaffMove} StaffMove
 *
 * @typedef {object} ZoneLive
 * @property {import('./admin-data').ZoneDoc} zone
 * @property {number | null} count         people counted now; null when the zone has no working camera
 * @property {number | null} predicted     count expected in 15 minutes; null when unknown
 * @property {number | null} densityPct
 * @property {number | null} predictedPct
 * @property {'Critical' | 'Warning' | 'Normal' | 'No data'} status
 * @property {import('./admin-data').StaffDoc[]} guards  on-duty guards in the zone
 * @property {number} needed               guards the zone needs
 *
 * @typedef {object} Suggestion
 * @property {string} id
 * @property {import('./admin-data').ZoneDoc} toZone
 * @property {StaffMove[]} moves
 * @property {string} reason
 * @property {number} shortfall            guards still missing after every possible move
 */
import { densityStatus } from '@/lib/admin-data';

const GUARD_KINDS = new Set(['guard', 'supervisor']);

export function isOnDutyGuard(s) {
  return GUARD_KINDS.has(s.kind) && s.status !== 'off_duty';
}

export function buildZoneLive(event, zones, staff, counts, predictions) {
  return zones.map((zone) => {
    const count = zone.feedId && zone.feedId in counts ? counts[zone.feedId] : null;
    const predicted = zone.feedId && zone.feedId in predictions ? predictions[zone.feedId] : null;
    const pct = (n) => (n === null || zone.capacity <= 0 ? null : Math.round((n / zone.capacity) * 100));
    const densityPct = pct(count);
    const predictedPct = pct(predicted);
    // Plan for whichever is higher: now or the predicted count, so guards arrive in time.
    const planFor = Math.max(count ?? 0, predicted ?? 0);
    const needed = Math.max(zone.minGuards, Math.ceil(planFor / Math.max(1, event.peoplePerGuard)));
    return {
      zone,
      count,
      predicted,
      densityPct,
      predictedPct,
      status: densityStatus(densityPct, event),
      guards: staff.filter((s) => s.zoneId === zone.id && isOnDutyGuard(s)),
      needed,
    };
  });
}

export function suggestMoves(live, staff) {
  const zoneById = new Map(live.map((l) => [l.zone.id, l]));

  // Pool of guards that can be moved: unassigned first, then surplus from the quietest zones.
  const donors = [];
  staff
    .filter((s) => isOnDutyGuard(s) && s.status === 'available' && (!s.zoneId || !zoneById.has(s.zoneId)))
    .forEach((s) => donors.push({ staff: s, from: null }));

  [...live]
    .filter((l) => l.guards.length > l.needed && l.status !== 'Critical')
    .sort((a, b) => (a.densityPct ?? 0) - (b.densityPct ?? 0))
    .forEach((l) => {
      const spare = l.guards.filter((g) => g.status === 'available').slice(0, l.guards.length - l.needed);
      spare.forEach((g) => donors.push({ staff: g, from: l }));
    });

  const receivers = live
    .filter((l) => l.guards.length < l.needed)
    .sort((a, b) => (b.predictedPct ?? b.densityPct ?? 0) - (a.predictedPct ?? a.densityPct ?? 0));

  const suggestions = [];
  for (const target of receivers) {
    const missing = target.needed - target.guards.length;
    const taken = donors.splice(0, missing);
    const moves = taken.map((d) => ({ staff: d.staff, fromZone: d.from?.zone ?? null, toZone: target.zone }));

    const now = target.densityPct === null ? 'no camera data' : `${target.densityPct}% ${target.status}`;
    const ahead =
      target.predictedPct !== null && target.predictedPct !== target.densityPct
        ? `, ${target.predictedPct}% expected in 15 min`
        : '';
    const sources = moves.length ? `Move ${describeSources(moves)}.` : 'No spare guards available.';

    suggestions.push({
      id: `${target.zone.id}:${moves.map((m) => m.staff.id).join(',')}`,
      toZone: target.zone,
      moves,
      reason: `${target.zone.name}: ${now}${ahead}; ${target.guards.length} of ${target.needed} guards. ${sources}`,
      shortfall: missing - moves.length,
    });
  }
  return suggestions;
}

function describeSources(moves) {
  const counts = new Map();
  for (const m of moves) {
    const key = m.fromZone?.name ?? 'unassigned';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([zone, n]) => `${n} from ${zone}`).join(', ');
}
