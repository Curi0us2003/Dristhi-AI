'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Camera, Loader2, X } from 'lucide-react';
import { useAttendee, useLocation } from '@/contexts/attendee-context';
import { toReporter } from '@/lib/attendee';
import { photoToDataUri } from '@/lib/image';
import { cn } from '@/lib/utils';
import { fetchZones } from '@/lib/venue';
import { sendMedicalReport, sendMissingPersonReport } from '@/services/attendee-reports';

/*
 * Report drafts (docs/design/mockups/AttendeeChat.dc.html). The assistant or the Help page fills
 * them in; the attendee checks them and taps Send. Nothing reaches the control room before that.
 */

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent';
const inputClass =
  'w-full rounded-[10px] border border-ds-input-border bg-ds-surface px-3 py-2.5 text-[15px] text-ds-ink placeholder:text-ds-muted ' +
  'focus:border-ds-accent focus:outline-none focus:ring-2 focus:ring-ds-accent-tint';
const primaryBtn =
  'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-ds-accent px-4 text-[15px] font-semibold text-ds-on-accent hover:opacity-90 disabled:opacity-60 ' +
  focusRing;
const secondaryBtn =
  'inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-ds-input-border bg-ds-surface px-4 text-[15px] font-semibold text-ds-ink hover:bg-ds-divider ' +
  focusRing;

/** Area names from the crowd backend, for the "Where" suggestions. */
function useAreaNames() {
  const [names, setNames] = useState([]);
  useEffect(() => {
    fetchZones()
      .then((z) => setNames(z.map((x) => x.name)))
      .catch(() => setNames([]));
  }, []);
  return names;
}

function DraftFrame({ title, state, headingId, children }) {
  const sent = state === 'sent';
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'overflow-hidden rounded-2xl bg-ds-surface',
        sent ? 'border border-ds-border' : 'border-2 border-ds-accent',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-4 py-3',
          sent ? 'bg-ds-divider' : 'bg-ds-accent-tint',
        )}
      >
        <h2 id={headingId} className="text-[15px] font-semibold text-ds-accent-ink">
          {title} · {sent ? 'sent' : 'draft'}
        </h2>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-semibold',
            sent ? 'bg-ds-predicted-tint text-ds-predicted' : 'text-ds-accent-ink',
          )}
        >
          {sent ? 'Sent' : 'Not sent yet'}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ds-divider pb-2.5 text-[15px] last:border-0 last:pb-0">
      <dt className="flex-none text-ds-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-ds-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ds-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ds-muted">{hint}</p>}
    </div>
  );
}

/** "From GPS · ±20 m", or a way to turn location on. */
function LocationRow() {
  const { coords, permission, ensureLocation } = useLocation();
  return (
    <Row label="Location">
      {coords ? (
        <span className="font-normal">From GPS · ±{coords.accuracy_m} m</span>
      ) : permission === 'unsupported' ? (
        <span className="font-normal text-ds-muted">Not available</span>
      ) : (
        <button
          type="button"
          onClick={() => void ensureLocation('help')}
          className={cn('font-semibold text-ds-accent-ink underline underline-offset-2', focusRing)}
        >
          Off · turn on
        </button>
      )}
    </Row>
  );
}

function SentFooter({ text }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="rounded-[10px] bg-ds-predicted-tint px-3 py-2.5 text-[13px] leading-relaxed text-ds-predicted">
        {text}
      </p>
      <Link
        href="/user/reports"
        className={cn('text-sm font-semibold text-ds-accent-ink underline underline-offset-2', focusRing)}
      >
        Follow it in My reports
      </Link>
    </div>
  );
}

function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-[10px] bg-ds-critical-tint px-3 py-2 text-[13px] text-ds-critical">
      {error}
    </p>
  );
}

const URGENCY_STYLE = {
  High: 'bg-ds-critical-tint text-ds-critical',
  Medium: 'bg-ds-warning-tint text-ds-warning',
  Low: 'bg-ds-accent-tint text-ds-accent-ink',
};

/* ── Medical ──────────────────────────────────────────────────────────── */

export function MedicalDraftCard({ initial, startEditing = false, onSent }) {
  const id = useId();
  const { attendee } = useAttendee();
  const { coords } = useLocation();
  const areas = useAreaNames();
  const [d, setD] = useState({
    details: initial?.details ?? '',
    where: initial?.where ?? '',
    urgency: initial?.urgency ?? 'High',
  });
  const incomplete = !d.details.trim() || (!d.where.trim() && !coords);
  const [editing, setEditing] = useState(startEditing || !d.details.trim());
  const [state, setState] = useState('draft');
  const [error, setError] = useState(null);

  const send = async () => {
    const reporter = toReporter(attendee);
    if (!reporter) return;
    if (incomplete) {
      setEditing(true);
      setError(coords ? 'Say what happened.' : 'Say what happened and where you are.');
      return;
    }
    setState('sending');
    setError(null);
    try {
      await sendMedicalReport(reporter, d, coords);
      setState('sent');
      setEditing(false);
      onSent?.();
    } catch {
      setState('draft');
      setError('Not sent. Check your connection and tap Send again.');
    }
  };

  return (
    <DraftFrame title="Medical report" state={state} headingId={`${id}-h`}>
      {editing && state !== 'sent' ? (
        <div className="flex flex-col gap-3">
          <Field label="What happened" htmlFor={`${id}-details`}>
            <textarea
              id={`${id}-details`}
              rows={3}
              className={inputClass}
              value={d.details}
              placeholder="For example: fainted, bleeding, chest pain"
              onChange={(e) => setD({ ...d, details: e.target.value })}
            />
          </Field>
          <Field
            label="Where are you?"
            htmlFor={`${id}-where`}
            hint={coords ? 'Optional: your GPS location is sent too.' : 'Name a stage, gate or landmark.'}
          >
            <input
              id={`${id}-where`}
              list={`${id}-areas`}
              className={inputClass}
              value={d.where}
              placeholder="For example: Main stage, left side"
              onChange={(e) => setD({ ...d, where: e.target.value })}
            />
            <datalist id={`${id}-areas`}>
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-ds-ink-2">How urgent?</legend>
            <div className="grid grid-cols-3 gap-2">
              {['High', 'Medium', 'Low'].map((u) => (
                <label
                  key={u}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] border text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ds-accent',
                    d.urgency === u
                      ? 'border-ds-accent bg-ds-accent-tint text-ds-accent-ink'
                      : 'border-ds-input-border text-ds-ink-2',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-urgency`}
                    value={u}
                    checked={d.urgency === u}
                    onChange={() => setD({ ...d, urgency: u })}
                    className="sr-only"
                  />
                  {u}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : (
        <dl className="flex flex-col gap-2.5">
          <Row label="What happened">{d.details || '—'}</Row>
          <Row label="Urgency">
            <span
              className={cn('rounded-md px-2 py-0.5 text-[13px] font-semibold', URGENCY_STYLE[d.urgency])}
            >
              {d.urgency}
            </span>
          </Row>
          <Row label="Where">{d.where || (coords ? 'Shared location' : '—')}</Row>
          <LocationRow />
        </dl>
      )}
      {editing && state !== 'sent' && (
        <dl>
          <LocationRow />
        </dl>
      )}

      <ErrorNote error={error} />

      {state === 'sent' ? (
        <SentFooter text="A medic is being sent. Stay where you are if you can, and keep your phone with you." />
      ) : (
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            className={secondaryBtn}
            onClick={() => setEditing((e) => !e)}
            disabled={state === 'sending'}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            type="button"
            className={primaryBtn}
            onClick={() => void send()}
            disabled={state === 'sending'}
          >
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Send
          </button>
        </div>
      )}
    </DraftFrame>
  );
}

/* ── Missing person ───────────────────────────────────────────────────── */

export function MissingPersonDraftCard({ initial, onSent }) {
  const id = useId();
  const { attendee } = useAttendee();
  const { coords } = useLocation();
  const areas = useAreaNames();
  const fileRef = useRef(null);
  const [d, setD] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    lastSeenPlace: initial?.lastSeenPlace ?? '',
    lastSeenTime: initial?.lastSeenTime ?? '',
    photoDataUri: initial?.photoDataUri ?? null,
  });
  const [editing, setEditing] = useState(true);
  const [state, setState] = useState('draft');
  const [error, setError] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const missing = [];
  if (!d.name.trim() && !d.description.trim()) missing.push('their name or what they look like');
  if (!d.lastSeenPlace.trim()) missing.push('where you last saw them');

  const pickPhoto = async (file) => {
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    try {
      setD((prev) => ({ ...prev, photoDataUri: null }));
      const uri = await photoToDataUri(file);
      setD((prev) => ({ ...prev, photoDataUri: uri }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That photo could not be used.');
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async () => {
    const reporter = toReporter(attendee);
    if (!reporter) return;
    if (missing.length) {
      setEditing(true);
      setError(`Add ${missing.join(' and ')}.`);
      return;
    }
    setState('sending');
    setError(null);
    try {
      await sendMissingPersonReport(reporter, d, coords);
      setState('sent');
      setEditing(false);
      onSent?.();
    } catch {
      setState('draft');
      setError('Not sent. Check your connection and tap Send again.');
    }
  };

  const photo = (
    <div className="flex items-center gap-3">
      {d.photoDataUri ? (
        <div className="relative">
          <Image
            src={d.photoDataUri}
            alt={d.name ? `Photo of ${d.name}` : 'Photo of the missing person'}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-xl object-cover"
          />
          {state !== 'sent' && editing && (
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => setD({ ...d, photoDataUri: null })}
              className={cn(
                'absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-ds-border bg-ds-surface text-ds-ink-2',
                focusRing,
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <span className="flex h-[72px] w-[72px] flex-none items-center justify-center rounded-xl bg-ds-divider text-ds-muted">
          <Camera className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>
      )}
      {state !== 'sent' && editing && (
        <div className="flex min-w-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 self-start rounded-[10px] border border-ds-input-border px-3.5 text-sm font-semibold text-ds-accent-ink hover:bg-ds-accent-tint',
              focusRing,
            )}
          >
            {photoBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {d.photoDataUri ? 'Change photo' : 'Add a photo'}
          </button>
          <span className="text-xs text-ds-muted">A recent photo helps staff find them faster.</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );

  return (
    <DraftFrame title="Missing person" state={state} headingId={`${id}-h`}>
      {photo}
      {editing && state !== 'sent' ? (
        <div className="flex flex-col gap-3">
          <Field label="Their name" htmlFor={`${id}-name`}>
            <input
              id={`${id}-name`}
              className={inputClass}
              value={d.name}
              autoComplete="off"
              onChange={(e) => setD({ ...d, name: e.target.value })}
            />
          </Field>
          <Field
            label="What they look like"
            htmlFor={`${id}-desc`}
            hint="Age, height, clothes, anything that stands out."
          >
            <textarea
              id={`${id}-desc`}
              rows={3}
              className={inputClass}
              value={d.description}
              placeholder="For example: 7 years old, red T-shirt, blue cap"
              onChange={(e) => setD({ ...d, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <Field label="Where you last saw them" htmlFor={`${id}-place`}>
              <input
                id={`${id}-place`}
                list={`${id}-areas`}
                className={inputClass}
                value={d.lastSeenPlace}
                placeholder="For example: Food court"
                onChange={(e) => setD({ ...d, lastSeenPlace: e.target.value })}
              />
              <datalist id={`${id}-areas`}>
                {areas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </Field>
            <Field label="At what time" htmlFor={`${id}-time`}>
              <input
                id={`${id}-time`}
                type="time"
                className={inputClass}
                value={d.lastSeenTime}
                onChange={(e) => setD({ ...d, lastSeenTime: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ) : (
        <dl className="flex flex-col gap-2.5">
          <Row label="Name">{d.name || '—'}</Row>
          <Row label="Looks like">{d.description || '—'}</Row>
          <Row label="Last seen">
            {[d.lastSeenPlace, d.lastSeenTime && `at ${d.lastSeenTime}`].filter(Boolean).join(' ') || '—'}
          </Row>
          {!d.photoDataUri && <Row label="Photo">Not added</Row>}
        </dl>
      )}

      <ErrorNote error={error} />

      {state === 'sent' ? (
        <SentFooter text="Staff across the venue have been alerted. Stay where you last saw them if you can, or go to the nearest help desk." />
      ) : (
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            className={secondaryBtn}
            onClick={() => setEditing((e) => !e)}
            disabled={state === 'sending'}
          >
            {editing ? 'Review' : 'Edit'}
          </button>
          <button
            type="button"
            className={primaryBtn}
            onClick={() => void send()}
            disabled={state === 'sending' || photoBusy}
          >
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Send
          </button>
        </div>
      )}
    </DraftFrame>
  );
}
