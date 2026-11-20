'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useEvent } from '@/contexts/event-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_PILL = {
  live: { label: 'Live', className: 'bg-ds-accent-tint text-ds-accent-ink', dot: 'bg-ds-accent' },
  draft: { label: 'Draft', className: 'bg-ds-predicted-tint text-ds-predicted', dot: 'bg-ds-predicted' },
  ended: { label: 'Ended', className: 'bg-ds-divider text-ds-ink-2', dot: 'bg-ds-muted' },
};

/** Event picker and status pill for the operator top bar (Dashboard mockup header). */
export default function EventSwitcher() {
  const { events, event, selectEvent, loading } = useEvent();

  if (loading) return <div className="h-10 w-56 animate-pulse rounded-[10px] bg-ds-divider" aria-hidden />;

  if (!event) {
    return (
      <Link
        href="/setup"
        className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ds-accent px-4 text-sm font-semibold text-ds-on-accent hover:opacity-90"
      >
        <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Create your first event
      </Link>
    );
  }

  const pill = STATUS_PILL[event.status] ?? STATUS_PILL.draft;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Select value={event.id} onValueChange={selectEvent}>
        <SelectTrigger
          className="h-10 w-auto min-w-0 max-w-[280px] gap-2 rounded-[10px] border-ds-border bg-ds-surface px-3.5 text-sm font-semibold text-ds-ink"
          aria-label="Current event"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {events.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
              {e.city ? ` · ${e.city}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold ${pill.className}`}
      >
        <span className={`h-2 w-2 rounded-full ${pill.dot}`} aria-hidden />
        {pill.label}
      </span>
    </div>
  );
}
