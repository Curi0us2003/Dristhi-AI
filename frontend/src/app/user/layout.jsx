'use client';

import { Loader2, QrCode } from 'lucide-react';
import AttendeeShell from '@/components/attendee/attendee-shell';
import { AttendeeProvider, LocationProvider, useAttendee } from '@/contexts/attendee-context';

/** Attendee app: no sign-in. The attendee comes from /join (task 07a). */
export default function UserLayout({ children }) {
  return (
    <AttendeeProvider>
      <AttendeeGate>{children}</AttendeeGate>
    </AttendeeProvider>
  );
}

function AttendeeGate({ children }) {
  const { status } = useAttendee();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ds-ground">
        <Loader2 className="h-8 w-8 animate-spin text-ds-accent" aria-label="Loading" />
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ds-ground p-4 text-ds-ink">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-ds-border bg-ds-surface p-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ds-accent-tint text-ds-accent">
            <QrCode className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="font-display text-[22px] font-semibold">Scan the event QR code to start</h1>
          <p className="text-sm leading-relaxed text-ds-ink-2">
            Open your phone camera and point it at the QR code on the event posters or your ticket.
          </p>
        </div>
      </div>
    );
  }

  return (
    <LocationProvider>
      <AttendeeShell>{children}</AttendeeShell>
    </LocationProvider>
  );
}
