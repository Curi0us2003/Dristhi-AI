'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ClipboardList, Eye, Home, Map, MessageCircle } from 'lucide-react';
import { useAttendee, useLocation } from '@/contexts/attendee-context';
import { useAttendeeNotifications } from '@/hooks/use-attendee-data';
import { cn } from '@/lib/utils';
import { LocationBlockedHelp, LocationSheet } from './location-prompts';

const NAV = [
  { href: '/user/dashboard', label: 'Home', icon: Home, match: ['/user/dashboard', '/user/help'] },
  { href: '/user/assistant', label: 'Assistant', icon: MessageCircle, match: ['/user/assistant'] },
  { href: '/user/map', label: 'Map', icon: Map, match: ['/user/map'] },
  { href: '/user/reports', label: 'My reports', icon: ClipboardList, match: ['/user/reports'] },
];

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent';

function useActive() {
  const path = (usePathname() ?? '').replace(/\/$/, '');
  return (match) => match.some((m) => path === m || path.startsWith(`${m}/`));
}

function BellButton({ count }) {
  return (
    <Link
      href="/user/reports"
      aria-label={count ? `Updates, ${count} new` : 'Updates'}
      className={cn(
        'relative flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-ds-border bg-ds-surface text-ds-ink-2 hover:bg-ds-divider',
        focusRing,
      )}
    >
      <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      {count > 0 && (
        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-ds-surface bg-ds-critical-bar" />
      )}
    </Link>
  );
}

function Logo({ className }) {
  return (
    <span
      className={cn(
        'flex flex-none items-center justify-center rounded-xl bg-ds-accent text-ds-on-accent',
        className,
      )}
    >
      <Eye className="h-5 w-5" strokeWidth={2} aria-hidden />
    </span>
  );
}

/**
 * Attendee app frame (docs/design/mockups/AttendeeHome.dc.html, frames 2, 4 and 5):
 * phones get a bottom tab bar, tablets (sm) a 96 px left rail, laptops (lg) a labelled sidebar.
 * Pages render the same content at every size.
 */
export default function AttendeeShell({ children }) {
  const { attendee } = useAttendee();
  const { permission } = useLocation();
  const notifications = useAttendeeNotifications(attendee?.attendee_id);
  const isActive = useActive();
  const event = attendee?.event;
  const place = [event?.venue, event?.city].filter(Boolean).join(' · ');

  return (
    // --tabbar-h: height of the phone tab bar, used by pages that pin things above it (the chat composer).
    <div className="min-h-dvh bg-ds-ground font-sans text-ds-ink [--tabbar-h:4.25rem] sm:flex">
      {/* Tablet rail and laptop sidebar */}
      <nav
        aria-label="Attendee sections"
        className="sticky top-0 hidden h-dvh flex-none flex-col items-center gap-2 border-r border-ds-border bg-ds-surface py-6 sm:flex sm:w-24 lg:w-[232px] lg:items-stretch lg:gap-1 lg:px-4"
      >
        <div className="mb-4 flex items-center gap-2.5 lg:mb-5 lg:px-2">
          <Logo className="h-10 w-10 lg:h-9 lg:w-9" />
          <span className="hidden font-display text-lg font-semibold lg:inline">Dristhi</span>
        </div>
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = isActive(match);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex w-20 flex-col items-center gap-1 rounded-xl py-2 text-xs lg:w-auto lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:text-sm',
                active
                  ? 'font-semibold text-ds-accent-ink lg:bg-ds-accent-tint'
                  : 'font-medium text-ds-muted hover:text-ds-ink lg:text-ds-ink-2 lg:hover:bg-ds-divider',
                focusRing,
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-14 items-center justify-center rounded-full lg:h-auto lg:w-auto lg:bg-transparent',
                  active && 'bg-ds-accent-tint',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}
        <div className="mt-auto hidden flex-col gap-0.5 border-t border-ds-divider p-3 lg:flex">
          <span className="text-sm font-semibold">{attendee?.display_name}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-xs',
              permission === 'granted' ? 'text-ds-accent-ink' : 'text-ds-warning',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                permission === 'granted' ? 'bg-ds-accent' : 'bg-ds-warning-bar',
              )}
            />
            {permission === 'granted' ? 'Location on' : 'Location off'}
          </span>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ds-border bg-ds-surface px-4 pb-3.5 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-7 sm:py-5 lg:px-8 lg:py-[18px]">
          <Logo className="h-9 w-9 sm:hidden" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-base font-semibold sm:font-display sm:text-[22px] lg:text-2xl">
              {event?.name ?? 'Event'}
            </span>
            <span className="truncate text-xs text-ds-muted sm:text-[13px]">
              <span className="lg:hidden">Hi, {attendee?.display_name}</span>
              <span className="hidden lg:inline">{place || `Hi, ${attendee?.display_name}`}</span>
            </span>
          </div>
          <BellButton count={notifications.length} />
        </header>

        <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:py-6 lg:px-8 lg:py-7">
          <div className="w-full max-w-[1040px]">{children}</div>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav
        aria-label="Attendee sections"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] grid-cols-4 content-start border-t border-ds-border bg-ds-surface px-2 pb-[env(safe-area-inset-bottom)] pt-2 sm:hidden"
      >
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = isActive(match);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 flex-col items-center gap-1 rounded-xl py-1.5 text-xs',
                active ? 'font-semibold text-ds-accent-ink' : 'font-medium text-ds-muted',
                focusRing,
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-[52px] items-center justify-center rounded-full',
                  active && 'bg-ds-accent-tint',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}
      </nav>

      <LocationSheet />
      <LocationBlockedHelp />
    </div>
  );
}
