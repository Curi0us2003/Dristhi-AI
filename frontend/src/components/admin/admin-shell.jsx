'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Eye,
  LayoutDashboard,
  LogOut,
  Map,
  MessageSquareWarning,
  Radar,
  Settings2,
  Video,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import EventSwitcher from './event-switcher';

const MAIN_ROUTES = [
  { href: '/command', label: 'Command', icon: Radar },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/live-feed', label: 'Live cameras', icon: Video },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/map-view', label: 'Venue map', icon: Map },
  { href: '/grievances', label: 'Reports', icon: MessageSquareWarning, badge: 'reports' },
];
const SETUP_ROUTE = { href: '/setup', label: 'Event setup', icon: Settings2 };

/** Count of open reports for the nav badge. */
function useOpenReports() {
  const [count, setCount] = useState(0);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'grievances'), where('status', '==', 'new')),
        (snap) => setCount(snap.size),
        () => setCount(0)
      ),
    []
  );
  return count;
}

function Brand() {
  return (
    <Link href="/command" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ds-accent">
        <Eye className="h-[18px] w-[18px] text-ds-on-accent" strokeWidth={2} aria-hidden />
      </span>
      <span className="font-display text-xl font-semibold text-ds-ink">Dristhi</span>
    </Link>
  );
}

function NavLink({ route, active, badge, compact }) {
  const Icon = route.icon;
  return (
    <Link
      href={route.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors',
        active ? 'bg-ds-accent-tint font-semibold text-ds-accent-ink' : 'text-ds-ink-2 hover:bg-ds-divider',
        compact && 'gap-2 py-2'
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      {route.label}
      {badge > 0 && (
        <span className="ml-auto rounded-full bg-ds-critical-tint px-2 py-0.5 text-xs font-semibold text-ds-critical">
          {badge}
        </span>
      )}
    </Link>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const initials =
    (user?.fullName || 'Operator')
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'OP';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ds-ink text-[13px] font-semibold text-ds-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-semibold">{user?.fullName}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await logout();
            router.push('/login');
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Operator layout from docs/design/mockups/Dashboard.dc.html: labelled left sidebar on laptops,
 * a scrolling tab row under the top bar on phones and tablets.
 */
export default function AdminShell({ children }) {
  const pathname = usePathname();
  const openReports = useOpenReports();
  const isActive = (href) => pathname === href || pathname?.startsWith(`${href}/`);
  const badgeFor = (route) => (route.badge === 'reports' ? openReports : 0);

  return (
    <div className="min-h-dvh bg-ds-ground font-sans text-ds-ink lg:flex">
      {/* Sidebar (laptop) */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-ds-border bg-ds-surface px-4 py-6 lg:flex"
      >
        <div className="px-3 pb-6">
          <Brand />
        </div>
        {MAIN_ROUTES.map((r) => (
          <NavLink key={r.href} route={r} active={isActive(r.href)} badge={badgeFor(r)} />
        ))}
        <div className="mx-3 my-4 h-px bg-ds-border" />
        <NavLink route={SETUP_ROUTE} active={isActive(SETUP_ROUTE.href)} />
      </nav>

      <div className="min-w-0 flex-1">
        {/* Phone / tablet: brand bar and scrolling tabs */}
        <div className="border-b border-ds-border bg-ds-surface lg:hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            <Brand />
            <AccountMenu />
          </div>
          <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[...MAIN_ROUTES, SETUP_ROUTE].map((r) => (
              <NavLink key={r.href} route={r} active={isActive(r.href)} badge={badgeFor(r)} compact />
            ))}
          </nav>
        </div>

        <main className="flex flex-col gap-6 px-4 pb-10 pt-5 md:px-8 md:pt-6">
          <header className="flex flex-wrap items-center gap-3">
            <EventSwitcher />
            <div className="flex-1" />
            <div className="hidden lg:block">
              <AccountMenu />
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
