'use client';
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { assignStaffToGrievance, STAFF_KIND_LABEL, updateStaff, watchStaff } from '@/lib/admin-data';

/**
 * A report from an attendee (Firestore collection `grievances`). Other pages import this type.
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

/** Attendee reports are addressed by attendee id; older reports by email. */
function notificationRecipient(g) {
  if (g.attendeeId) return { attendeeId: g.attendeeId };
  const email = g.email || g.submittedBy;
  return email ? { userEmail: email } : null;
}

const grievanceIcons = {
  'Medical Attention': Stethoscope,
  'Missing Person': Search,
  'General Grievance': MessageSquareWarning,
};

const grievanceColors = {
  'Medical Attention': 'border-red-500 bg-red-900/10',
  'Missing Person': 'border-yellow-500 bg-yellow-900/10',
  'General Grievance': 'border-blue-500 bg-blue-900/10',
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
    const grievancesRef = collection(db, 'grievances');
    return onSnapshot(grievancesRef, (snapshot) => {
      const grievancesData = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((g) => g.status === 'new')
        .sort((a, b) => (b.submittedAt?.seconds ?? 0) - (a.submittedAt?.seconds ?? 0));
      setGrievances(grievancesData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!event) return;
    return watchStaff(event.id, setStaff);
  }, [event]);

  // Refresh the timers.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const notify = (grievance, message) => {
    const recipient = notificationRecipient(grievance);
    if (!recipient) return Promise.resolve();
    return addDoc(collection(db, 'notifications'), {
      ...recipient,
      message,
      createdAt: serverTimestamp(),
      read: false,
    });
  };

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
    const grievanceRef = doc(db, 'grievances', grievance.id);
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

      if (grievance.type === 'Missing Person') {
        await deleteDoc(grievanceRef);
      } else {
        await updateDoc(grievanceRef, { status: 'resolved', actionTaken, resolvedAt: serverTimestamp() });
      }
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
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Grievances</h2>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const unassigned = grievances.filter((g) => !g.assignedStaffId).length;
  const overdue = grievances.filter((g) => {
    const sla = SLA[g.type];
    const open = minutesSince(g.submittedAt, now);
    return g.assignedStaffId ? open > sla.resolve : open > sla.assign;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Grievances</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="muted">{grievances.length} open</StatusBadge>
          <StatusBadge tone={unassigned ? 'warning' : 'normal'}>{unassigned} unassigned</StatusBadge>
          <StatusBadge tone={overdue ? 'critical' : 'normal'}>{overdue} overdue</StatusBadge>
        </div>
      </div>
      {!event && (
        <p className="text-sm text-muted-foreground">
          Create an event and its staff roster in Setup to send staff to reports.
        </p>
      )}
      {grievances.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <MessageSquareWarning className="h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">No Open Grievances</h3>
              <p className="text-sm text-muted-foreground">
                All user-submitted grievances have been resolved.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {grievances.map((grievance) => {
            const Icon = grievanceIcons[grievance.type] ?? MessageSquareWarning;
            const candidates = candidatesFor(grievance, staff);
            return (
              <Card key={grievance.id} className={grievanceColors[grievance.type]}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5" />
                      {grievance.type}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
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
                                <DropdownMenuItem
                                  key={member.id}
                                  onClick={() => handleAssign(grievance, member)}
                                >
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
                  </CardTitle>
                  <CardDescription>
                    Submitted {formatTimestamp(grievance.submittedAt)} by{' '}
                    {grievance.submittedBy || 'Anonymous'}
                  </CardDescription>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <SlaBadge grievance={grievance} now={now} />
                    {grievance.urgency && (
                      <StatusBadge
                        tone={
                          grievance.urgency === 'High'
                            ? 'critical'
                            : grievance.urgency === 'Medium'
                              ? 'warning'
                              : 'muted'
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
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    {grievance.photoDataUri && (
                      <div className="relative h-16 w-16 flex-shrink-0 rounded-md overflow-hidden">
                        <Image
                          src={grievance.photoDataUri}
                          alt={grievance.personName || 'Missing person'}
                          layout="fill"
                          objectFit="cover"
                        />
                      </div>
                    )}
                    <div className="flex-grow space-y-2">
                      {grievance.type === 'Missing Person' && (
                        <div className="space-y-2 text-sm">
                          <p>
                            <strong>Name:</strong> {grievance.personName}
                          </p>
                          <p>
                            <strong>Last Seen:</strong> {grievance.lastSeen}
                          </p>
                        </div>
                      )}
                      {grievance.location && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4" />
                          <strong>Location:</strong> {grievance.location}
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground">{grievance.details}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
