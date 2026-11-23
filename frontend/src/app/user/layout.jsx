'use client';

import { useState } from 'react';
import { Loader2, QrCode, UserRound } from 'lucide-react';
import AttendeeShell from '@/components/attendee/attendee-shell';
import ContactForm, { contactErrors } from '@/components/attendee/contact-form';
import { AttendeeProvider, LocationProvider, useAttendee } from '@/contexts/attendee-context';
import { needsDetails, updateDetails } from '@/lib/attendee';

/** Attendee app: no sign-in. The attendee comes from /join (task 07a). */
export default function UserLayout({ children }) {
  return (
    <AttendeeProvider>
      <AttendeeGate>{children}</AttendeeGate>
    </AttendeeProvider>
  );
}

function AttendeeGate({ children }) {
  const { status, attendee } = useAttendee();

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

  // Joined before name and number were asked for: ask once before opening the app.
  if (needsDetails(attendee)) return <DetailsGate />;

  return (
    <LocationProvider>
      <AttendeeShell>{children}</AttendeeShell>
    </LocationProvider>
  );
}

function DetailsGate() {
  const { attendee, setAttendee } = useAttendee();
  const [errors, setErrors] = useState({});

  async function submit(details) {
    setErrors({});
    try {
      setAttendee(await updateDetails(attendee, details));
    } catch (err) {
      setErrors(contactErrors(err));
      throw err;
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ds-ground p-4 text-ds-ink">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-ds-border bg-ds-surface p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ds-accent-tint text-ds-accent">
          <UserRound className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="font-display text-[22px] font-semibold">Add your name and number</h1>
        <p className="text-sm leading-relaxed text-ds-ink-2">
          So the person sent to help you can find and call you.
        </p>
        <ContactForm initial={attendee} submitLabel="Continue" onSubmit={submit} errors={errors} />
      </div>
    </div>
  );
}
