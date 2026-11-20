'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Loader2, Sparkles, Wifi, WifiOff, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEvent } from '@/contexts/event-context';
import { useLiveFeeds } from '@/hooks/use-live-feeds';
import { StatusBadge, densityBarClass, densityTone } from '@/components/admin/status-badge';
import { EmptyNote, Kpi, PageHeader, Panel } from '@/components/admin/ui';
import {
  approveMoves,
  densityStatus,
  STAFF_KIND_LABEL,
  updateStaff,
  watchDispatches,
  watchStaff,
  watchZones,
} from '@/lib/admin-data';
import { buildZoneLive, isOnDutyGuard, suggestMoves } from '@/lib/redistribution';

const MEDICAL_KINDS = new Set(['medic', 'doctor', 'ambulance']);

const statusText = {
  Critical: 'text-ds-critical font-semibold',
  Warning: 'text-ds-warning font-semibold',
  Normal: 'text-ds-muted',
  'No data': 'text-ds-muted',
};

function DensityBar({ pct, status }) {
  return (
    <div className="h-2 w-full rounded bg-ds-divider" aria-hidden>
      {pct !== null && (
        <div className={`h-2 rounded ${densityBarClass(status)}`} style={{ width: `${Math.min(100, pct)}%` }} />
      )}
    </div>
  );
}

function GuardCoverage({ live }) {
  const have = live.guards.length;
  const diff = have - live.needed;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums text-ds-ink-2">
        {have}/{live.needed}
      </span>
      {diff < 0 ? (
        <StatusBadge tone="critical">Short {-diff}</StatusBadge>
      ) : diff > 0 ? (
        <StatusBadge tone="predicted">Spare {diff}</StatusBadge>
      ) : (
        <StatusBadge tone="normal">OK</StatusBadge>
      )}
    </div>
  );
}

/** Dark "Suggested plan" card from the Dashboard mockup, one entry per zone that needs guards. */
function SuggestedPlan({ event, suggestions, approving, onApprove, onDismiss }) {
  return (
    <section
      aria-labelledby="plan-h"
      className="flex min-w-0 flex-col gap-4 rounded-2xl bg-[#14202E] px-5 py-5 text-[#EEF1EC] md:px-6"
    >
      <div className="flex items-center gap-2.5">
        <Sparkles className="h-5 w-5 text-[#5CC9B0]" strokeWidth={1.75} aria-hidden />
        <h2 id="plan-h" className="text-base font-semibold">
          Suggested guard moves
        </h2>
      </div>
      <p className="text-sm leading-relaxed text-[#C4CED6]">
        One guard per {event.peoplePerGuard} people (or the zone minimum), planned on the higher of the current and the
        15-minute predicted count. Spare guards come from the quietest zones.
      </p>
      {suggestions.length === 0 ? (
        <p className="text-sm text-[#C4CED6]">Every zone has the guards it needs. Nothing to move.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {suggestions.map((s) => (
            <li key={s.id} className="flex flex-col gap-3 border-t border-[#3A4A5E] pt-4 first:border-t-0 first:pt-0">
              <p className="text-sm font-medium leading-snug">{s.reason}</p>
              {s.moves.length > 0 && (
                <ul className="flex flex-wrap gap-2 text-xs">
                  {s.moves.map((m) => (
                    <li key={m.staff.id} className="flex items-center gap-1 rounded-full bg-[#1E2C3E] px-2.5 py-1">
                      {m.staff.name}: {m.fromZone?.name ?? 'Unassigned'}
                      <ArrowRight className="h-3 w-3" aria-label="to" />
                      {m.toZone.name}
                    </li>
                  ))}
                </ul>
              )}
              {s.shortfall > 0 && (
                <p className="text-xs text-[#F0C46A]">
                  Still {s.shortfall} short: add guards to the roster or lower other zones&apos; minimums.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onApprove(s)}
                  disabled={s.moves.length === 0 || approving === s.id}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[#5CC9B0] px-4 py-2.5 text-sm font-semibold text-[#0F1B2A] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {approving === s.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(s)}
                  className="inline-flex items-center gap-2 rounded-[10px] border border-[#3A4A5E] px-4 py-2.5 text-sm hover:bg-[#1E2C3E]"
                >
                  <X className="h-4 w-4" aria-hidden />
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function CommandPage() {
  const { event, loading } = useEvent();
  const { toast } = useToast();
  const { counts, predictions, online, updatedAt } = useLiveFeeds(5000);
  const [zones, setZones] = useState([]);
  const [staff, setStaff] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [approving, setApproving] = useState(null);

  useEffect(() => {
    if (!event) return;
    const unsubs = [
      watchZones(event.id, setZones),
      watchStaff(event.id, setStaff),
      watchDispatches(event.id, setDispatches),
    ];
    return () => unsubs.forEach((u) => u());
  }, [event]);

  const live = useMemo(
    () => (event ? buildZoneLive(event, zones, staff, counts, predictions) : []),
    [event, zones, staff, counts, predictions]
  );
  const suggestions = useMemo(
    () => suggestMoves(live, staff).filter((s) => !dismissed.has(s.id)),
    [live, staff, dismissed]
  );
  const sortedLive = useMemo(() => [...live].sort((a, b) => (b.densityPct ?? -1) - (a.densityPct ?? -1)), [live]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ds-muted" />
      </div>
    );
  }

  if (!event) {
    return (
      <Panel className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-lg font-semibold">No event yet</p>
        <p className="text-sm text-ds-muted">Create an event, its zones and staff roster to start monitoring.</p>
        <Link
          href="/setup"
          className="mt-2 inline-flex rounded-[10px] bg-ds-accent px-4 py-2.5 text-sm font-semibold text-ds-on-accent"
        >
          Go to setup
        </Link>
      </Panel>
    );
  }

  const peopleNow = live.reduce((sum, l) => sum + (l.count ?? 0), 0);
  const capacity = live.reduce((sum, l) => sum + (l.count === null ? 0 : l.zone.capacity), 0);
  const critical = live.filter((l) => l.status === 'Critical').length;
  const warning = live.filter((l) => l.status === 'Warning').length;
  const guardsOnDuty = staff.filter(isOnDutyGuard).length;
  const medicalAvailable = staff.filter((s) => MEDICAL_KINDS.has(s.kind) && s.status === 'available').length;
  const onTheWay = staff.filter((s) => s.status === 'dispatched');
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? 'Unassigned';

  async function approve(s) {
    if (!event || s.moves.length === 0) return;
    setApproving(s.id);
    try {
      await approveMoves(event.id, s.moves, s.reason);
      toast({
        title: `${s.moves.length} guard${s.moves.length > 1 ? 's' : ''} sent to ${s.toZone.name}`,
        description: s.moves.map((m) => m.staff.name).join(', '),
      });
    } catch (err) {
      toast({ title: 'Could not dispatch', description: err.message, variant: 'destructive' });
    } finally {
      setApproving(null);
    }
  }

  const meta = (
    <span className="inline-flex flex-wrap items-center gap-2">
      {event.venue}
      {event.city ? `, ${event.city}` : ''}
      <span aria-hidden>·</span>
      {online === false ? (
        <span className="inline-flex items-center gap-1 font-semibold text-ds-critical">
          <WifiOff className="h-3.5 w-3.5" aria-hidden /> Cameras offline
        </span>
      ) : online ? (
        <span className="inline-flex items-center gap-1">
          <Wifi className="h-3.5 w-3.5" aria-hidden /> Cameras online
          {updatedAt ? ` · updated ${updatedAt.toLocaleTimeString()}` : ''}
        </span>
      ) : (
        'Connecting to cameras…'
      )}
    </span>
  );

  return (
    <>
      <PageHeader title="Command" meta={meta} />

      {zones.length === 0 && (
        <Panel>
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm">This event has no zones yet. Add zones and staff to see density and guard suggestions.</p>
            <Link
              href="/setup"
              className="inline-flex rounded-[10px] bg-ds-accent px-4 py-2.5 text-sm font-semibold text-ds-on-accent"
            >
              Set up zones
            </Link>
          </div>
        </Panel>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Kpi
          label="People in watched zones"
          value={online === false ? '—' : peopleNow.toLocaleString()}
          hint={capacity ? `of ${capacity.toLocaleString()} capacity · ${Math.round((peopleNow / capacity) * 100)}%` : null}
        />
        <Kpi
          label="Zones on alert"
          value={critical + warning}
          tone={critical ? 'critical' : undefined}
          hint={`${critical} critical · ${warning} warning`}
        />
        <Kpi label="Guards on duty" value={guardsOnDuty} hint={`${onTheWay.length} on the way to a new zone`} />
        <Kpi label="Medical staff available" value={medicalAvailable} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Panel
          title="Crowd by zone"
          description={`Warning at ${event.warningPct}%, Critical at ${event.criticalPct}% of zone capacity.`}
          action={
            <Link href="/map-view" className="text-[13px] font-medium text-ds-accent-ink hover:underline">
              Open map
            </Link>
          }
          bodyClassName="overflow-x-auto"
        >
          {sortedLive.length === 0 ? (
            <EmptyNote>No zones yet.</EmptyNote>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[13px] text-ds-muted">
                  <th className="pb-2 pr-4 font-normal">Zone</th>
                  <th className="pb-2 pr-4 font-normal">Now</th>
                  <th className="pb-2 pr-4 font-normal">Status</th>
                  <th className="pb-2 pr-4 font-normal">In 15 min</th>
                  <th className="pb-2 pr-4 text-right font-normal">Guards</th>
                  <th className="pb-2 text-right font-normal">Medical</th>
                </tr>
              </thead>
              <tbody>
                {sortedLive.map((l) => {
                  const predictedStatus = densityStatus(l.predictedPct, event);
                  const worsening =
                    l.predictedPct !== null &&
                    l.densityPct !== null &&
                    predictedStatus !== l.status &&
                    l.predictedPct > l.densityPct;
                  return (
                    <tr key={l.zone.id} className="border-t border-ds-divider">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{l.zone.name}</div>
                        <div className="text-xs text-ds-muted">
                          {l.count === null ? 'No camera data' : `${l.count} / ${l.zone.capacity}`}
                        </div>
                      </td>
                      <td className="w-[28%] py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <DensityBar pct={l.densityPct} status={l.status} />
                          <span className="w-10 shrink-0 text-right tabular-nums text-ds-ink-2">
                            {l.densityPct === null ? '—' : `${l.densityPct}%`}
                          </span>
                        </div>
                      </td>
                      <td className={`py-3 pr-4 ${statusText[l.status]}`}>{l.status}</td>
                      <td className="py-3 pr-4">
                        {l.predictedPct === null ? (
                          <span className="text-ds-muted">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums text-ds-ink-2">{l.predictedPct}%</span>
                            {worsening && <StatusBadge tone="predicted">Predicted {predictedStatus}</StatusBadge>}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <GuardCoverage live={l} />
                      </td>
                      <td className="py-3 text-right tabular-nums text-ds-ink-2">
                        {
                          staff.filter(
                            (s) => s.zoneId === l.zone.id && MEDICAL_KINDS.has(s.kind) && s.status !== 'off_duty'
                          ).length
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <SuggestedPlan
            event={event}
            suggestions={suggestions}
            approving={approving}
            onApprove={approve}
            onDismiss={(s) => setDismissed((d) => new Set(d).add(s.id))}
          />

          <Panel title="On the way" description="Mark staff as arrived once they confirm on the radio.">
            {onTheWay.length === 0 ? (
              <EmptyNote>Nobody is moving right now.</EmptyNote>
            ) : (
              <ul className="flex flex-col">
                {onTheWay.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 border-t border-ds-divider py-3 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-[13px] text-ds-muted">
                        {STAFF_KIND_LABEL[s.kind]} → {zoneName(s.zoneId)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateStaff(s.id, { status: 'available' })}
                      className="shrink-0 rounded-[10px] border border-ds-input-border bg-ds-surface px-3 py-2 text-sm font-medium hover:bg-ds-divider"
                    >
                      Arrived
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent dispatches">
            {dispatches.length === 0 ? (
              <EmptyNote>No dispatches yet.</EmptyNote>
            ) : (
              <ul className="flex flex-col">
                {dispatches.map((d) => (
                  <li key={d.id} className="border-t border-ds-divider py-3 first:border-t-0 first:pt-0">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{d.staffName}</span>
                      <span className="text-[13px] text-ds-muted">
                        {d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleTimeString() : 'now'}
                      </span>
                    </div>
                    <div className="text-[13px] text-ds-muted">
                      {d.grievanceId ? 'Sent to a report' : `${d.fromZoneName ?? 'Unassigned'} → ${d.toZoneName ?? '?'}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
