'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BriefcaseMedical, DoorOpen, Droplet, Megaphone, MessageCircle, Toilet } from 'lucide-react';
import { LocationOffBanner } from '@/components/attendee/location-prompts';
import { useLocation } from '@/contexts/attendee-context';
import { useMissingPersonAlerts } from '@/hooks/use-attendee-data';
import { cn } from '@/lib/utils';

/**
 * Attendee Home (docs/design/mockups/AttendeeHome.dc.html, frames 2, 4 and 5).
 * Crowd levels per area are deliberately not shown here: attendees seeing "Very crowded" next to
 * "Quiet" could all head for the quiet area at once and start a rush. Crowd movement is directed
 * by staff and organiser announcements instead.
 */
export default function AttendeeHomePage() {
  return (
    <>
      <LocationOffBanner className="mb-4 sm:mb-5 lg:mb-6" />
      <div
        className={cn(
          'grid gap-4 [grid-template-areas:"help"_"near"_"side"]',
          'sm:gap-5',
          'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6 lg:[grid-template-areas:"left_right"]',
        )}
      >
        {/* Below lg these wrappers are display:contents, so each card takes its own grid area.
          On laptops they become two independent columns, so a tall card never opens a gap. */}
        <div className="contents lg:flex lg:flex-col lg:gap-6 lg:[grid-area:left]">
          <HelpCard />
          <FindNearest />
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-6 lg:[grid-area:right]">
          <div className="flex flex-col gap-4 [grid-area:side] sm:gap-5 lg:gap-6">
            <OrganiserUpdates />
            <MissingPersonAlerts />
            <Link
              href="/user/assistant"
              className="flex min-h-12 items-center gap-3 rounded-full border border-ds-input-border bg-ds-surface px-4 py-3 text-[15px] text-ds-muted hover:border-ds-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
            >
              <MessageCircle className="h-5 w-5 text-ds-accent" strokeWidth={1.75} aria-hidden />
              Ask the assistant anything…
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

function HelpCard() {
  const router = useRouter();
  const { ensureLocation } = useLocation();

  return (
    <section
      aria-labelledby="help-h"
      className="flex items-center gap-3.5 self-start rounded-2xl bg-ds-critical-tint p-4 [grid-area:help] sm:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="help-h" className="text-base font-semibold text-ds-critical sm:text-lg">
          Need medical help?
        </h2>
        <p className="text-[13px] leading-relaxed text-ds-ink-2 sm:text-sm">
          Sends your location to the control room.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void ensureLocation('help');
          router.push('/user/help?type=medical');
        }}
        className="min-h-12 flex-none rounded-xl bg-ds-critical-bar px-[18px] text-[15px] font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-critical-bar sm:px-6"
      >
        Get help
      </button>
    </section>
  );
}

const NEAREST = [
  { label: 'Washroom', kind: 'washroom', icon: Toilet, tint: 'bg-ds-predicted-tint text-ds-predicted' },
  {
    label: 'Water',
    kind: 'water',
    icon: Droplet,
    tint: 'bg-ds-predicted-tint text-[#2B6CB0] dark:text-ds-predicted',
  },
  { label: 'First aid', kind: 'first_aid', icon: BriefcaseMedical, tint: 'bg-ds-critical-tint text-ds-critical-bar' },
  { label: 'Exit', kind: 'exit', icon: DoorOpen, tint: 'bg-ds-accent-tint text-ds-accent' },
];

function FindNearest() {
  const router = useRouter();
  const { ensureLocation } = useLocation();

  return (
    <section aria-labelledby="near-h" className="flex flex-col gap-2.5 self-start [grid-area:near]">
      <h2 id="near-h" className="text-sm font-semibold text-ds-ink-2">
        Find nearest
      </h2>
      <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-2">
        {NEAREST.map(({ label, kind, icon: Icon, tint }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              void ensureLocation('nearest');
              router.push(`/user/map?kind=${kind}`);
            }}
            className="flex min-h-11 flex-col items-center gap-2 rounded-xl border border-ds-border bg-ds-surface px-1 py-3 text-xs font-medium hover:border-ds-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent sm:flex-row sm:gap-3 sm:p-3.5 sm:text-left sm:text-sm"
          >
            <span className={cn('flex h-9 w-9 flex-none items-center justify-center rounded-[10px]', tint)}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </span>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Placeholder until organiser announcements exist (no data source yet). */
function OrganiserUpdates() {
  return (
    <section
      aria-labelledby="upd-h"
      className="flex items-start gap-3 rounded-2xl border border-ds-border bg-ds-surface px-4 py-3.5 sm:px-[18px] sm:py-4"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-ds-accent-tint text-ds-accent">
        <Megaphone className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <h2 id="upd-h" className="text-xs font-semibold text-ds-muted">
          From the organisers
        </h2>
        <p className="text-sm leading-relaxed">No updates yet. Announcements will show up here.</p>
      </div>
    </section>
  );
}

function MissingPersonAlerts() {
  const reports = useMissingPersonAlerts();
  if (reports.length === 0) return null;

  return (
    <section aria-labelledby="missing-h" className="flex flex-col gap-3 rounded-2xl bg-ds-warning-tint p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="missing-h" className="text-sm font-semibold text-ds-warning">
          Missing person · please look out
        </h2>
        <p className="text-[13px] text-ds-ink-2">If you see them, tell the nearest staff member.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {reports.slice(0, 3).map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl bg-ds-surface p-2.5">
            {r.photoDataUri ? (
              <Image
                src={r.photoDataUri}
                alt={r.personName ? `Photo of ${r.personName}` : 'Photo of the missing person'}
                width={48}
                height={48}
                className="h-12 w-12 flex-none rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-ds-divider font-semibold text-ds-ink-2">
                {r.personName?.charAt(0) ?? '?'}
              </span>
            )}
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">{r.personName || 'Unknown name'}</p>
              {r.lastSeen && <p className="truncate text-[13px] text-ds-muted">Last seen: {r.lastSeen}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
