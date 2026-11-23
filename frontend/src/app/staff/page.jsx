'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, HeartPulse, Loader2, LogOut, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { cn, formatPhone } from '@/lib/utils';
import {
  getSeenMove,
  getToken,
  setSeenMove,
  staffFeed,
  staffLogin,
  staffLogout,
  StaffError,
} from '@/lib/staff-app';

/**
 * Staff app: /staff?e=<event slug>. Guards and medical staff sign in with their name and app code
 * and see one page: where they are posted, moves from the control room (as a pop-up) and the
 * attendee they have been sent to help.
 */
export default function StaffPage() {
  return (
    <Suspense fallback={<Centered><Loader2 className="h-8 w-8 animate-spin text-ds-accent" aria-label="Loading" /></Centered>}>
      <StaffApp />
    </Suspense>
  );
}

const ROLE = {
  guard: 'Security guard',
  supervisor: 'Supervisor',
  medic: 'Medical staff',
  doctor: 'Doctor',
  ambulance: 'Ambulance',
  volunteer: 'Volunteer',
};
const STATUS = { available: 'Available', dispatched: 'On the way', on_scene: 'On scene', off_duty: 'Off duty' };
const POLL_MS = 5000;
const MOVE_POPUP_MAX_AGE_MS = 60 * 60 * 1000; // older moves are shown in the card, not as a pop-up

function StaffApp() {
  const eventSlug = useSearchParams().get('e')?.trim() || process.env.NEXT_PUBLIC_EVENT_SLUG || '';
  const [feed, setFeed] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | login | ready
  const [notice, setNotice] = useState(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await staffFeed();
      setFeed(data);
      setOffline(false);
      setPhase('ready');
    } catch (err) {
      if (err instanceof StaffError && err.status === 401) {
        if (err.code === 'session_ended') setNotice(err.message);
        setFeed(null);
        setPhase('login');
      } else {
        setOffline(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setPhase('login');
      return;
    }
    void load();
  }, [load]);

  useEffect(() => {
    if (phase !== 'ready') return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, load]);

  if (phase === 'loading') {
    return (
      <Centered>
        <Loader2 className="h-8 w-8 animate-spin text-ds-accent" aria-label="Loading" />
      </Centered>
    );
  }

  if (phase === 'login') {
    return (
      <LoginForm
        eventSlug={eventSlug}
        notice={notice}
        onSignedIn={(data) => {
          setNotice(null);
          setFeed(data);
          setPhase('ready');
        }}
      />
    );
  }

  return (
    <Dashboard
      feed={feed}
      offline={offline}
      onSignOut={async () => {
        await staffLogout();
        setFeed(null);
        setPhase('login');
      }}
    />
  );
}

/* ── Sign in ─────────────────────────────────────────────────────────── */

const inputClass =
  'min-h-12 w-full rounded-[10px] border border-ds-border bg-ds-surface px-3.5 text-base text-ds-ink placeholder:text-ds-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ds-accent';

function LoginForm({ eventSlug, notice, onSignedIn }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!eventSlug) return setError('Open the staff app link from the control room (it names the event).');
    if (!name.trim() || !code.trim()) return setError('Enter your name and your app code.');
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await staffLogin(eventSlug, name.trim(), code.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ds-accent-tint text-ds-accent">
        <ShieldCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="font-display text-[22px] font-semibold">Staff sign in</h1>
      <p className="text-sm leading-relaxed text-ds-ink-2">
        Use your name and the 6-character app code from the control room.
      </p>
      {notice && <p className="w-full rounded-[10px] bg-ds-warning-tint px-3 py-2 text-left text-sm text-ds-warning">{notice}</p>}
      <form onSubmit={submit} noValidate className="flex w-full flex-col gap-4 text-left">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="staff-name" className="text-sm font-semibold">
            Your name
          </label>
          <input id="staff-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="staff-code" className="text-sm font-semibold">
            App code
          </label>
          <input
            id="staff-code"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="K7P4QX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={cn(inputClass, 'font-mono tracking-[0.2em]')}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-ds-critical">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-ds-accent px-5 text-[15px] font-semibold text-ds-on-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Sign in
        </button>
      </form>
    </Centered>
  );
}

/* ── The one page ────────────────────────────────────────────────────── */

function Dashboard({ feed, offline, onSignOut }) {
  const { staff, move, assignment } = feed;
  const [popupMove, setPopupMove] = useState(null);
  const lastAssignment = useRef(assignment?.id ?? null);

  // A new move from the control room pops up until the staff member taps "Got it".
  useEffect(() => {
    if (!move || move.id === getSeenMove()) return;
    if (Date.now() - new Date(move.created_at).getTime() > MOVE_POPUP_MAX_AGE_MS) {
      setSeenMove(move.id);
      return;
    }
    setPopupMove(move);
    navigator.vibrate?.([200, 100, 200]);
  }, [move]);

  // Buzz when a new person is assigned.
  useEffect(() => {
    if (assignment && assignment.id !== lastAssignment.current) navigator.vibrate?.([300, 100, 300]);
    lastAssignment.current = assignment?.id ?? null;
  }, [assignment]);

  return (
    <main className="min-h-dvh bg-ds-ground font-sans text-ds-ink">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ds-border bg-ds-surface px-4 pb-3.5 pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-semibold">{staff.name}</span>
          <span className="truncate text-xs text-ds-muted">
            {ROLE[staff.kind] ?? staff.kind} · {staff.event_name}
          </span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-ds-border px-3 text-sm font-semibold hover:bg-ds-divider focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {offline && (
          <p role="status" className="rounded-[10px] bg-ds-warning-tint px-3 py-2 text-sm text-ds-warning">
            Offline: showing the last update. Retrying…
          </p>
        )}

        <section aria-labelledby="post-h" className="flex flex-col gap-2 rounded-2xl border border-ds-border bg-ds-surface p-4">
          <h2 id="post-h" className="text-xs font-semibold uppercase tracking-wide text-ds-muted">
            Your post
          </h2>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-ds-accent-tint text-ds-accent">
              <MapPin className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xl font-semibold">{staff.zone?.name ?? 'Not assigned yet'}</p>
              <p className="text-sm text-ds-ink-2">Status: {STATUS[staff.status] ?? staff.status}</p>
            </div>
          </div>
          {move && (
            <p className="border-t border-ds-divider pt-2 text-[13px] text-ds-ink-2">
              Last move: {move.from_zone_name ?? 'Unassigned'} → {move.to_zone_name} · {timeAgo(move.created_at)} · {move.reason}
            </p>
          )}
        </section>

        <AssignmentCard assignment={assignment} />
      </div>

      {popupMove && (
        <MovePopup
          move={popupMove}
          onDone={() => {
            setSeenMove(popupMove.id);
            setPopupMove(null);
          }}
        />
      )}
    </main>
  );
}

function AssignmentCard({ assignment: a }) {
  if (!a) {
    return (
      <section className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-ds-border p-6 text-center">
        <UserRound className="h-6 w-6 text-ds-muted" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-ds-ink-2">No one assigned to you right now. Stay at your post.</p>
      </section>
    );
  }
  const urgent = a.urgency === 'High';
  const area = a.zone_name ?? a.location_text;

  return (
    <section
      aria-labelledby="assign-h"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border-2 bg-ds-surface p-4',
        urgent ? 'border-ds-critical-bar' : 'border-ds-accent',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="assign-h" className="flex items-center gap-2 text-base font-semibold">
          <HeartPulse className={cn('h-5 w-5', urgent ? 'text-ds-critical' : 'text-ds-accent')} aria-hidden />
          You’ve been sent to help
        </h2>
        {a.urgency && (
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-semibold',
              urgent ? 'bg-ds-critical-tint text-ds-critical' : 'bg-ds-warning-tint text-ds-warning',
            )}
          >
            {a.urgency} urgency
          </span>
        )}
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-ds-muted">Request</dt>
        <dd className="font-medium">{a.type}</dd>
        <dt className="text-ds-muted">Person</dt>
        <dd className="font-medium">{a.attendee_name ?? 'Not given'}</dd>
        <dt className="text-ds-muted">Where</dt>
        <dd className="font-medium">
          {area ?? 'Location not shared'}
          {a.zone_name && a.location_text && a.location_text !== a.zone_name && (
            <span className="block text-xs font-normal text-ds-ink-2">“{a.location_text}”</span>
          )}
          {a.accuracy_m != null && a.zone_name && (
            <span className="block text-xs font-normal text-ds-muted">Phone location, within about {Math.round(a.accuracy_m)} m</span>
          )}
        </dd>
        {a.person_name && (
          <>
            <dt className="text-ds-muted">Missing</dt>
            <dd className="font-medium">
              {a.person_name}
              {a.last_seen ? `, last seen ${a.last_seen}` : ''}
            </dd>
          </>
        )}
        <dt className="text-ds-muted">Details</dt>
        <dd className="whitespace-pre-line text-ds-ink-2">{a.details}</dd>
        <dt className="text-ds-muted">Sent</dt>
        <dd className="text-ds-ink-2">{timeAgo(a.assigned_at ?? a.submitted_at)}</dd>
      </dl>

      {a.attendee_phone ? (
        <a
          href={`tel:${a.attendee_phone}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-ds-accent px-5 text-[15px] font-semibold text-ds-on-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          <Phone className="h-4 w-4" aria-hidden />
          Call {a.attendee_name ?? 'them'} · {formatPhone(a.attendee_phone)}
        </a>
      ) : (
        <p className="text-sm text-ds-muted">No phone number given. Ask the control room for directions.</p>
      )}
    </section>
  );
}

function MovePopup({ move, onDone }) {
  const button = useRef(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="move-h"
        aria-describedby="move-d"
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-ds-surface p-5 text-ds-ink shadow-xl"
      >
        <span className="self-start rounded-md bg-ds-warning-tint px-2 py-0.5 text-xs font-semibold text-ds-warning">
          New instruction
        </span>
        <h2 id="move-h" className="font-display text-2xl font-semibold">
          Move to {move.to_zone_name}
        </h2>
        <div id="move-d" className="flex flex-col gap-2 text-sm text-ds-ink-2">
          <p className="flex items-center gap-2 font-medium text-ds-ink">
            {move.from_zone_name ?? 'Unassigned'}
            <ArrowRight className="h-4 w-4" aria-hidden />
            {move.to_zone_name}
          </p>
          <p>Reason: {move.reason}</p>
        </div>
        <button
          ref={button}
          type="button"
          onClick={onDone}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-ds-accent px-5 text-[15px] font-semibold text-ds-on-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent"
        >
          Got it, on my way
        </button>
      </div>
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function Centered({ children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ds-ground p-4 font-sans text-ds-ink">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-ds-border bg-ds-surface p-6 text-center">
        {children}
      </div>
    </main>
  );
}
