'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, QrCode, WifiOff } from 'lucide-react';
import ContactForm, { contactErrors } from '@/components/attendee/contact-form';
import { getSavedAttendee, joinEvent, JoinError, needsDetails } from '@/lib/attendee';

/**
 * Event QR target: /join?e=<event slug>. Asks for the attendee's name and mobile number, joins
 * the event and opens the app. A phone that already joined with both goes straight in.
 */
export default function JoinPage() {
  return (
    <Suspense fallback={<Joining />}>
      <Join />
    </Suspense>
  );
}

function Join() {
  const slug = useSearchParams().get('e')?.trim() ?? '';
  const router = useRouter();
  const [error, setError] = useState(slug ? null : 'missing');
  const [saved, setSaved] = useState(undefined); // undefined until read from this phone
  const [showForm, setShowForm] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const run = useCallback(async () => {
    if (!slug) return;
    setError(null);
    try {
      await joinEvent(slug);
      router.replace('/user/dashboard');
    } catch (err) {
      setError(err instanceof JoinError ? err.code : 'network');
    }
  }, [slug, router]);

  useEffect(() => {
    if (!slug) return;
    const a = getSavedAttendee();
    const known = a && a.event.slug === slug ? a : null;
    setSaved(known);
    if (known && !needsDetails(known)) void run();
    else setShowForm(true);
  }, [slug, run]);

  async function submitDetails(details) {
    setFormErrors({});
    try {
      await joinEvent(slug, details);
      router.replace('/user/dashboard');
    } catch (err) {
      const code = err instanceof JoinError ? err.code : 'network';
      if (code === 'invalid_name' || code === 'invalid_phone' || code === 'network') {
        setFormErrors(contactErrors(err));
      } else {
        setShowForm(false);
        setError(code);
      }
      throw err;
    }
  }

  if (!error && showForm) {
    return (
      <Frame>
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ds-accent-tint text-ds-accent">
          <QrCode className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="font-display text-[22px] font-semibold">Welcome to the event</h1>
        <p className="text-sm leading-relaxed text-ds-ink-2">
          Tell us who you are, so help can reach you quickly if you need it.
        </p>
        <ContactForm initial={saved} submitLabel="Join the event" onSubmit={submitDetails} errors={formErrors} />
      </Frame>
    );
  }

  if (!error) return <Joining />;

  const copy = {
    missing: {
      title: 'This link is incomplete',
      body: 'Scan the event QR code again with your phone camera.',
      retry: false,
    },
    event_not_found: {
      title: 'This QR code isn’t active',
      body: 'Ask staff at a help desk for the current event QR code.',
      retry: false,
    },
    database_not_configured: {
      title: 'The event isn’t ready yet',
      body: 'Please try again in a few minutes, or ask staff at a help desk.',
      retry: true,
    },
    network: {
      title: 'Can’t reach the event service',
      body: 'Check your mobile data or Wi-Fi, then try again.',
      retry: true,
    },
  };
  const c = copy[error];
  const Icon = error === 'network' ? WifiOff : QrCode;

  return (
    <Frame>
      <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ds-warning-tint text-ds-warning">
        <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="font-display text-[22px] font-semibold">{c.title}</h1>
      <p className="text-sm leading-relaxed text-ds-ink-2">{c.body}</p>
      {c.retry && (
        <button
          type="button"
          onClick={() => void run()}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-ds-accent px-5 text-[15px] font-semibold text-ds-on-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          Try again
        </button>
      )}
    </Frame>
  );
}

function Joining() {
  return (
    <Frame>
      <Loader2 className="h-8 w-8 animate-spin text-ds-accent" aria-hidden />
      <p role="status" className="text-sm text-ds-ink-2">
        Joining the event…
      </p>
    </Frame>
  );
}

function Frame({ children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ds-ground p-4 font-sans text-ds-ink">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-ds-border bg-ds-surface p-6 text-center">
        {children}
      </div>
    </main>
  );
}
