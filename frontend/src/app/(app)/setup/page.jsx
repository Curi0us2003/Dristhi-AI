'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEvent } from '@/contexts/event-context';
import { PageHeader } from '@/components/admin/ui';
import EventForm from '@/components/admin/setup/event-form';
import ZonesEditor from '@/components/admin/setup/zones-editor';
import StaffRoster from '@/components/admin/setup/staff-roster';
import EventQrCard from '@/components/admin/setup/event-qr-card';
import { watchStaff, watchZones } from '@/lib/admin-data';

const STEPS = [
  { id: 'event', label: 'Event' },
  { id: 'zones', label: 'Zones and cameras' },
  { id: 'staff', label: 'Staff' },
];

/** Stepper from docs/design/mockups/VenueSetup.dc.html: tick when a step has data, ring on the current one. */
function Stepper({ current, done, onSelect, disabled }) {
  return (
    <ol aria-label="Setup steps" className="flex flex-wrap items-center gap-2 text-[13px]">
      {STEPS.map((s, i) => {
        const isCurrent = s.id === current;
        const isDone = done[s.id];
        const isDisabled = disabled(s.id);
        return (
          <li key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              disabled={isDisabled}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-[10px] px-2 py-1.5 disabled:cursor-not-allowed disabled:opacity-50',
                isCurrent ? 'font-semibold text-ds-accent-ink' : isDone ? 'text-ds-ink-2' : 'text-ds-muted',
                !isDisabled && 'hover:bg-ds-divider'
              )}
            >
              <span
                className={cn(
                  'flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px]',
                  isDone && !isCurrent
                    ? 'bg-ds-accent text-ds-on-accent'
                    : isCurrent
                      ? 'border-2 border-ds-accent'
                      : 'border border-[#C5CCC3]'
                )}
              >
                {isDone && !isCurrent ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <span aria-hidden className="h-px w-6 bg-ds-input-border" />}
          </li>
        );
      })}
    </ol>
  );
}

export default function SetupPage() {
  const { event, loading, error } = useEvent();
  const [step, setStep] = useState('event');
  const [zoneCount, setZoneCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);

  useEffect(() => {
    if (!event) return;
    const unsubs = [watchZones(event.id, (z) => setZoneCount(z.length)), watchStaff(event.id, (s) => setStaffCount(s.length))];
    return () => unsubs.forEach((u) => u());
  }, [event]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ds-muted" />
      </div>
    );
  }

  const current = event ? step : 'event';

  return (
    <>
      <PageHeader
        title="Event setup"
        meta="Create the event, split the venue into zones with cameras, and register everyone on duty."
      />
      {error && (
        <p role="alert" className="text-sm text-ds-critical">
          Could not load events: {error}
        </p>
      )}
      <Stepper
        current={current}
        done={{ event: Boolean(event), zones: zoneCount > 0, staff: staffCount > 0 }}
        onSelect={setStep}
        disabled={(id) => id !== 'event' && !event}
      />
      {current === 'event' && <EventForm />}
      {event && current === 'event' && <EventQrCard event={event} />}
      {event && current === 'zones' && <ZonesEditor event={event} />}
      {event && current === 'staff' && <StaffRoster event={event} />}
    </>
  );
}
