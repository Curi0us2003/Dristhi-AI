'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useEvent } from '@/contexts/event-context';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';

export default function EventSwitcher() {
  const { events, event, selectEvent, loading } = useEvent();

  if (loading) return null;

  if (!event) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href="/setup">
          <CalendarDays className="mr-2 h-4 w-4" />
          Create your first event
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={event.id} onValueChange={selectEvent}>
        <SelectTrigger className="h-9 w-[220px]" aria-label="Current event">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {events.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {event.status === 'live' ? (
        <StatusBadge tone="normal">Live</StatusBadge>
      ) : event.status === 'ended' ? (
        <StatusBadge tone="muted">Ended</StatusBadge>
      ) : (
        <StatusBadge tone="predicted">Draft</StatusBadge>
      )}
    </div>
  );
}
