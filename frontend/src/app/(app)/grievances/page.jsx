'use client';
import React, { useState, useEffect } from 'react';
import { PageHeader, Panel } from '@/components/admin/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  MoreHorizontal,
  Search,
  Stethoscope,
  MessageSquareWarning,
  RefreshCw,
  MapPin,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import Image from 'next/image';
import { useEvent } from '@/contexts/event-context';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  assignStaffToGrievance,
  notifyAttendee,
  resolveGrievance,
  STAFF_KIND_LABEL,
  updateStaff,
  watchGrievances,
  watchStaff,
} from '@/lib/admin-data';

/**
 * A report from an attendee (Cloud SQL table `grievances`, via lib/admin-data.js).
 *
 * @typedef {object} Grievance
 * @property {string} id
 * @property {'Medical Attention' | 'Missing Person' | 'General Grievance'} type
 * @property {string} details
 * @property {{ seconds: number, nanoseconds: number }} submittedAt
 * @property {'new' | 'resolved'} status
 * @property {string} [submittedBy]
 * @property {string} [attendeeId]     anonymous attendee id (new attendee app); notifications go here
 * @property {string} [eventSlug]
 * @property {'High' | 'Medium' | 'Low'} [urgency]
 * @property {{ lat: number, lng: number, accuracy_m?: number }} [coords]
 * @property {string} [email]          reporter's email on older reports, used for notifications
 * @property {string} [personName]
 * @property {string} [lastSeen]
 * @property {string} [photoDataUri]
 * @property {string} [location]
 * @property {string} [actionTaken]
 * @property {string} [assignedStaffId]
 * @property {string} [assignedStaffName]
 * @property {string} [assignedStaffKind]
 * @property {{ seconds: number } | null} [assignedAt]
 */


const grievanceIcons = {
  'Medical Attention': Stethoscope,
  'Missing Person': Search,
  'General Grievance': MessageSquareWarning,
};

/** Tinted icon square per report type (design tokens). */
const grievanceIconTone = {
  'Medical Attention': 'bg-ds-critical-tint text-ds-critical',
  'Missing Person': 'bg-ds-warning-tint text-ds-warning',
  'General Grievance': 'bg-ds-predicted-tint text-ds-predicted',
};

/** Minutes allowed to assign someone, and to resolve, per report type. */
const SLA = {
  'Medical Attention': { assign: 2, resolve: 15 },
  'Missing Person': { assign: 5, resolve: 30 },
  'General Grievance': { assign: 15, resolve: 60 },
};

const MEDICAL_KINDS = new Set(['medic', 'doctor', 'ambulance']);

function minutesSince(ts, now) {
  if (!ts) return 0;
  return Math.max(0, Math.floor((now - ts.seconds * 1000) / 60000));
}

/** Staff who can be sent: available, with the right kind first for the report type. */
function candidatesFor(grievance, staff) {
  const available = staff.filter((s) => s.status === 'available');
  const preferMedical = grievance.type === 'Medical Attention';
  return [...available].sort((a, b) => {
    const rank = (s) =>
      preferMedical ? (MEDICAL_KINDS.has(s.kind) ? 0 : 1) : MEDICAL_KINDS.has(s.kind) ? 1 : 0;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

function SlaBadge({ grievance, now }) {
  const sla = SLA[grievance.type];
  const open = minutesSince(grievance.submittedAt, now);
  if (!grievance.assignedStaffId) {
    if (open > sla.assign)
      return <StatusBadge tone="critical">Unassigned · overdue {open - sla.assign}m</StatusBadge>;
    return open === sla.assign ? (
      <StatusBadge tone="warning">Unassigned · assign now</StatusBadge>
    ) : (
      <StatusBadge tone="warning">Unassigned · assign within {sla.assign - open}m</StatusBadge>
    );
  }
  return open > sla.resolve ? (
    <StatusBadge tone="critical">Assigned · resolve overdue {open - sla.resolve}m</StatusBadge>
  ) : (
    <StatusBadge tone="normal">Assigned · on time</StatusBadge>
  );
}

export default function GrievancesPage() {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const { event } = useEvent();
  const { toast } = useToast();

  useEffect(() => {
    if (!event) return;
    return watchGrievances(
      event.id,
      (list) => {
        setGrievances(list);
        setLoading(false);
      },
      'new',
    );
  }, [event]);

  useEffect(() => {
    if (!event) return;
    return watchStaff(event.id, setStaff);
  }, [event]);

  // Refresh the timers.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  /** Messages the attendee who sent the report (reports always come from an attendee). */
  const notify = (grievance, message) =>
    grievance.attendeeId && event ? notifyAttendee(event.id, grievance.attendeeId, message) : Promise.resolve();

  const handleAssign = async (grievance, member) => {
    if (!event) return;
    try {
      await assignStaffToGrievance(
        event.id,
        member,
        grievance.id,
        `${grievance.type}: ${grievance.details.slice(0, 80)}`,
      );
      await notify(
        grievance,
        `${STAFF_KIND_LABEL[member.kind]} ${member.name} is on the way for your "${grievance.type}" report.`,
      );
      toast({
        title: `${member.name} sent`,
        description: `${grievance.type}${grievance.location ? ` at ${grievance.location}` : ''}`,
      });
    } catch (error) {
      console.error('Error assigning staff:', error);
      toast({
        title: 'Error',
        description: 'Could not assign staff. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleResolve = async (grievance) => {
    if (!event) return;
    try {
      let message = `Your grievance regarding "${grievance.type}" has been resolved.`;
      if (grievance.type === 'Missing Person') {
        message = `Your report for the missing person "${grievance.personName}" has been closed by the control room.`;
      }
      await notify(grievance, message);

      // Free the staff member who handled it.
      if (grievance.assignedStaffId && staff.some((s) => s.id === grievance.assignedStaffId)) {
        await updateStaff(grievance.assignedStaffId, { status: 'available' });
      }

      const actionTaken = grievance.assignedStaffName
        ? `Handled by ${grievance.assignedStaffName}`
        : 'Resolved by control room';

      // Resolved missing-person reports drop off every attendee's alert list.
      await resolveGrievance(event.id, grievance.id, actionTaken);
      toast({ title: 'Report resolved', description: 'The person who reported it has been notified.' });
    } catch (error) {
      console.error('Error resolving grievance:', error);
      toast({
        title: 'Error',
        description: 'Could not resolve the grievance. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'just now';
    const diffInMinutes = minutesSince(timestamp, now);
    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Reports" />
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-ds-muted" />
        </div>
      </>
    );
  }

  const unassigned = grievances.filter((g) => !g.assignedStaffId).length;
  const overdue = grievances.filter((g) => {
    const sla = SLA[g.type];
    const open = minutesSince(g.submittedAt, now);
    return g.assignedStaffId ? open > sla.resolve : open > sla.assign;
  }).length;

  return (
    <>
      <PageHeader title="Reports" meta="Medical, missing person and other reports from attendees, newest first.">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="muted">{grievances.length} open</StatusBadge>
          <StatusBadge tone={unassigned ? 'warning' : 'normal'}>{unassigned} unassigned</StatusBadge>
          <StatusBadge tone={overdue ? 'critical' : 'normal'}>{overdue} overdue</StatusBadge>
        </div>
      </PageHeader>
      {!event && (
        <p className="text-sm text-ds-muted">Create an event and its staff roster in Setup to send staff to reports.</p>
      )}
      {grievances.length === 0 ? (
        <Panel className="flex flex-col items-center gap-2 py-10 text-center">
          <MessageSquareWarning className="mx-auto h-10 w-10 text-ds-muted" strokeWidth={1.75} aria-hidden />
          <h2 className="text-base font-semibold">No open reports</h2>
          <p className="text-sm text-ds-muted">Every report from attendees has been resolved.</p>
        </Panel>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {grievances.map((grievance) => {
            const Icon = grievanceIcons[grievance.type] ?? MessageSquareWarning;
            const candidates = candidatesFor(grievance, staff);
            return (
              <article
                key={grievance.id}
                className="flex min-w-0 flex-col gap-3 rounded-2xl border border-ds-border bg-ds-surface p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${grievanceIconTone[grievance.type] ?? 'bg-ds-divider text-ds-ink-2'}`}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold leading-tight">{grievance.type}</h2>
                      <p className="text-[13px] text-ds-muted">
                        {formatTimestamp(grievance.submittedAt)} · {grievance.submittedBy || 'Anonymous'}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label={`Actions for ${grievance.type} report`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger disabled={candidates.length === 0}>
                          <UserCheck className="mr-2 h-4 w-4" />
                          {grievance.assignedStaffId ? 'Send someone else' : 'Send staff'}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                            <DropdownMenuLabel>Available staff</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {candidates.map((member) => (
                              <DropdownMenuItem key={member.id} onClick={() => handleAssign(grievance, member)}>
                                {member.name}
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {STAFF_KIND_LABEL[member.kind]}
                                </span>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                      </DropdownMenuSub>
                      <DropdownMenuItem onClick={() => handleResolve(grievance)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark resolved
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap gap-2">
                  <SlaBadge grievance={grievance} now={now} />
                  {grievance.urgency && (
                    <StatusBadge
                      tone={
                        grievance.urgency === 'High' ? 'critical' : grievance.urgency === 'Medium' ? 'warning' : 'muted'
                      }
                    >
                      {grievance.urgency} urgency
                    </StatusBadge>
                  )}
                  {grievance.assignedStaffName && (
                    <StatusBadge tone="predicted">
                      {grievance.assignedStaffName}
                      {grievance.assignedAt ? ` · ${minutesSince(grievance.assignedAt, now)}m ago` : ''}
                    </StatusBadge>
                  )}
                </div>

                <div className="flex gap-4 border-t border-ds-divider pt-3">
                  {grievance.photoDataUri && (
                    <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-[10px]">
                      <Image
                        src={grievance.photoDataUri}
                        alt={grievance.personName || 'Missing person'}
                        layout="fill"
                        objectFit="cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-grow space-y-1.5 text-sm">
                    {grievance.type === 'Missing Person' && (
                      <>
                        <p>
                          <span className="text-ds-muted">Name </span>
                          <span className="font-medium">{grievance.personName}</span>
                        </p>
                        <p>
                          <span className="text-ds-muted">Last seen </span>
                          <span className="font-medium">{grievance.lastSeen}</span>
                        </p>
                      </>
                    )}
                    {grievance.location && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4 shrink-0 text-ds-muted" strokeWidth={1.75} aria-hidden />
                        <span className="font-medium">{grievance.location}</span>
                      </p>
                    )}
                    <p className="text-ds-ink-2">{grievance.details}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
