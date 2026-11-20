'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Loader2, ShieldCheck, Users, Wifi, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useEvent } from '@/contexts/event-context';
import { useLiveFeeds } from '@/hooks/use-live-feeds';
import { StatusBadge, densityTone } from '@/components/admin/status-badge';
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

function Kpi({ label, value, hint }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function DensityBar({ pct, status }) {
  const color =
    status === 'Critical' ? 'bg-orange-600' : status === 'Warning' ? 'bg-amber-500' : 'bg-emerald-600';
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
      {pct !== null && <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />}
    </div>
  );
}

function GuardCoverage({ live }) {
  const have = live.guards.length;
  const diff = have - live.needed;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="tabular-nums">
        {have} / {live.needed}
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
    [event, zones, staff, counts, predictions],
  );
  const suggestions = useMemo(
    () => suggestMoves(live, staff).filter((s) => !dismissed.has(s.id)),
    [live, staff, dismissed],
  );
  const sortedLive = useMemo(
    () => [...live].sort((a, b) => (b.densityPct ?? -1) - (a.densityPct ?? -1)),
    [live],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!event) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-lg font-medium">No event yet</p>
          <p className="text-sm text-muted-foreground">
            Create an event, its zones and staff roster to start monitoring.
          </p>
          <Button asChild>
            <Link href="/setup">Go to setup</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const peopleNow = live.reduce((sum, l) => sum + (l.count ?? 0), 0);
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Command</h2>
          <p className="text-sm text-muted-foreground">
            {event.name} · {event.venue}
            {event.city ? `, ${event.city}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {online === false ? (
            <StatusBadge tone="critical">
              <WifiOff className="h-3 w-3" /> Cameras offline
            </StatusBadge>
          ) : online ? (
            <StatusBadge tone="normal">
              <Wifi className="h-3 w-3" /> Cameras online
            </StatusBadge>
          ) : null}
          {updatedAt && (
            <span className="text-muted-foreground">Updated {updatedAt.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {zones.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-2 p-6 md:flex-row md:items-center md:justify-between">
            <p className="text-sm">
              This event has no zones yet. Add zones and staff to see density and guard suggestions.
            </p>
            <Button asChild size="sm">
              <Link href="/setup">Set up zones</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="People in watched zones" value={online === false ? '—' : peopleNow.toLocaleString()} />
        <Kpi
          label="Zones needing attention"
          value={critical + warning}
          hint={
            <span className="flex gap-2">
              <StatusBadge tone="critical">{critical} Critical</StatusBadge>
              <StatusBadge tone="warning">{warning} Warning</StatusBadge>
            </span>
          }
        />
        <Kpi
          label="Guards on duty"
          value={guardsOnDuty}
          hint={`${onTheWay.length} on the way to a new zone`}
        />
        <Kpi label="Medical staff available" value={medicalAvailable} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Suggested guard moves
          </CardTitle>
          <CardDescription>
            Each zone needs one guard per {event.peoplePerGuard} people (or its minimum), planned on the
            higher of the current and the 15-minute predicted count. Spare guards come from the quietest
            zones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every zone has the guards it needs. Nothing to move.
            </p>
          ) : (
            suggestions.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-2">
                  <p className="text-sm font-medium">{s.reason}</p>
                  {s.moves.length > 0 && (
                    <ul className="flex flex-wrap gap-2 text-xs">
                      {s.moves.map((m) => (
                        <li
                          key={m.staff.id}
                          className="flex items-center gap-1 rounded-full bg-muted px-2 py-1"
                        >
                          {m.staff.name}: {m.fromZone?.name ?? 'Unassigned'}
                          <ArrowRight className="h-3 w-3" aria-label="to" />
                          {m.toZone.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.shortfall > 0 && (
                    <StatusBadge tone="warning" className="whitespace-normal">
                      Still {s.shortfall} short: add guards to the roster or lower other zones&apos; minimums
                    </StatusBadge>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button onClick={() => approve(s)} disabled={s.moves.length === 0 || approving === s.id}>
                    {approving === s.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Approve
                  </Button>
                  <Button variant="ghost" onClick={() => setDismissed((d) => new Set(d).add(s.id))}>
                    <X className="mr-2 h-4 w-4" />
                    Dismiss
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Zones by density
            </CardTitle>
            <CardDescription>
              Warning at {event.warningPct}%, Critical at {event.criticalPct}% of zone capacity.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead>Now</TableHead>
                  <TableHead>In 15 min</TableHead>
                  <TableHead className="text-right">Guards (have / need)</TableHead>
                  <TableHead className="text-right">Medical</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLive.map((l) => {
                  const predictedStatus = densityStatus(l.predictedPct, event);
                  const worsening =
                    l.predictedPct !== null &&
                    l.densityPct !== null &&
                    predictedStatus !== l.status &&
                    l.predictedPct > l.densityPct;
                  return (
                    <TableRow key={l.zone.id}>
                      <TableCell>
                        <div className="font-medium">{l.zone.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.count === null ? 'No camera data' : `${l.count} / ${l.zone.capacity} people`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DensityBar pct={l.densityPct} status={l.status} />
                          <span className="w-10 text-right tabular-nums">
                            {l.densityPct === null ? '—' : `${l.densityPct}%`}
                          </span>
                          <StatusBadge tone={densityTone(l.status)}>{l.status}</StatusBadge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {l.predictedPct === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums">{l.predictedPct}%</span>
                            {worsening && (
                              <StatusBadge tone="predicted">Predicted {predictedStatus}</StatusBadge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <GuardCoverage live={l} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {
                          staff.filter(
                            (s) =>
                              s.zoneId === l.zone.id && MEDICAL_KINDS.has(s.kind) && s.status !== 'off_duty',
                          ).length
                        }
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>On the way</CardTitle>
              <CardDescription>Mark staff as arrived once they confirm on the radio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {onTheWay.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody is moving right now.</p>
              ) : (
                onTheWay.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {STAFF_KIND_LABEL[s.kind]} → {zoneName(s.zoneId)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStaff(s.id, { status: 'available' })}
                    >
                      Arrived
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent dispatches</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {dispatches.length === 0 ? (
                <p className="text-muted-foreground">No dispatches yet.</p>
              ) : (
                dispatches.map((d) => (
                  <div key={d.id} className="border-b pb-2 last:border-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{d.staffName}</span>
                      <span className="text-xs text-muted-foreground">
                        {d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleTimeString() : 'now'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.grievanceId
                        ? 'Sent to a report'
                        : `${d.fromZoneName ?? 'Unassigned'} → ${d.toZoneName ?? '?'}`}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
