'use client';

import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import { secondaryButton } from '@/components/attendee/location-prompts';
import { useAttendee } from '@/contexts/attendee-context';
import { markNotificationRead, useAttendeeNotifications, useMyReports } from '@/hooks/use-attendee-data';
import { cn } from '@/lib/utils';
/** My reports (docs/design/mockups/AttendeeHome.dc.html, frame 3) plus unread updates. */
export default function MyReportsPage() {
  const { attendee } = useAttendee();
  const notifications = useAttendeeNotifications(attendee?.attendee_id);
  const { reports, loading } = useMyReports(attendee?.attendee_id);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-[22px] font-semibold sm:text-[26px]">My reports</h1>
        <p className="text-xs text-ds-muted sm:text-[13px]">Only you and the control room can see these.</p>
      </div>

      {notifications.length > 0 && (
        <section aria-labelledby="updates-h" className="flex flex-col gap-2">
          <h2 id="updates-h" className="text-sm font-semibold text-ds-ink-2">
            New updates
          </h2>
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-2xl bg-ds-predicted-tint p-3.5 text-ds-predicted"
            >
              <Bell className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
              <p className="flex-1 text-sm leading-relaxed">{n.message}</p>
              <button
                type="button"
                aria-label="Mark as read"
                onClick={() => void markNotificationRead(attendee.attendee_id, n.id)}
                className="-m-2 flex h-11 w-11 flex-none items-center justify-center rounded-xl hover:bg-ds-surface/60"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </section>
      )}

      {loading && <p className="text-sm text-ds-muted">Loading your reports…</p>}
      {!loading && reports.length === 0 && (
        <p className="rounded-2xl border border-ds-border bg-ds-surface p-4 text-sm text-ds-ink-2">
          You haven’t sent anything yet. Use Get help on Home, or ask the assistant.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {reports.map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
      </div>

      <div className="grid gap-2 sm:max-w-md sm:grid-cols-2">
        <Link href="/user/help?type=medical" className={secondaryButton}>
          Ask for medical help
        </Link>
        <Link href="/user/help?type=missing" className={secondaryButton}>
          Report a missing person
        </Link>
      </div>
    </div>
  );
}

const TITLES = {
  'Medical Attention': 'Medical help',
  'Missing Person': 'Missing person',
  'General Grievance': 'Report',
};

function ReportCard({ report: r }) {
  const resolved = r.status === 'resolved';
  const when = r.submittedAt?.seconds
    ? new Date(r.submittedAt.seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'just now';
  const summary = [r.personName, r.details, r.location || r.lastSeen].filter(Boolean).join(' · ');

  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-ds-border bg-ds-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{TITLES[r.type] ?? r.type}</h2>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-semibold',
            resolved ? 'bg-ds-accent-tint text-ds-accent-ink' : 'bg-ds-predicted-tint text-ds-predicted',
          )}
        >
          {resolved ? 'Resolved' : 'Sent'}
        </span>
      </div>
      {summary && <p className="text-sm leading-relaxed text-ds-ink-2">{summary}</p>}
      {r.actionTaken && (
        <p className="rounded-[10px] bg-ds-predicted-tint px-3 py-2.5 text-[13px] leading-relaxed text-ds-predicted">
          {r.actionTaken}
        </p>
      )}
      <span className="text-xs text-ds-muted">Sent {when}</span>
    </article>
  );
}
