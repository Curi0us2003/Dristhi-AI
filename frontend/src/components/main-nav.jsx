'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Video,
  Map,
  AlertTriangle,
  LayoutDashboard,
  MessageSquareWarning,
  Radar,
  Settings2,
} from 'lucide-react';

const routes = [
  { href: '/command', label: 'Command', icon: Radar },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/live-feed', label: 'Live Feed', icon: Video },
  { href: '/map-view', label: 'Map View', icon: Map },
  { href: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { href: '/grievances', label: 'Grievances', icon: MessageSquareWarning },
  { href: '/setup', label: 'Setup', icon: Settings2 },
];

export default function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:gap-x-6">
      {routes.map((route) => (
        <Link
          key={route.href}
          href={route.href}
          className={cn(
            'flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary',
            pathname === route.href ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground',
          )}
        >
          <route.icon className="h-4 w-4" />
          {route.label}
        </Link>
      ))}
    </nav>
  );
}
