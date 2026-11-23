'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

const inputClass =
  'min-h-12 w-full rounded-[10px] border border-ds-border bg-ds-surface px-3.5 text-base text-ds-ink placeholder:text-ds-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ds-accent aria-[invalid=true]:border-ds-critical';

/**
 * Asks the attendee for their name and mobile number (shown after the QR scan).
 *
 * @param {{
 *   initial?: { name?: string|null, phone?: string|null },
 *   submitLabel: string,
 *   onSubmit: (details: { name: string, phone: string }) => Promise<void>,
 *   errors?: { name?: string, phone?: string, form?: string },
 * }} props
 * onSubmit should throw to keep the form open; `errors` shows messages from the backend.
 */
export default function ContactForm({ initial, submitLabel, onSubmit, errors = {} }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState({});

  async function submit(e) {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, ' ');
    const digits = phone.replace(/[^\d+]/g, '');
    const found = {};
    if (n.length < 2) found.name = 'Enter your name.';
    if (digits.replace(/\D/g, '').length < 10) found.phone = 'Enter your 10-digit mobile number.';
    setLocal(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await onSubmit({ name: n, phone: phone.trim() });
    } catch {
      // The caller shows the error through `errors`.
    } finally {
      setBusy(false);
    }
  }

  const nameError = local.name ?? errors.name;
  const phoneError = local.phone ?? errors.phone;

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col gap-4 text-left">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-name" className="text-sm font-semibold">
          Your name
        </label>
        <input
          id="contact-name"
          name="name"
          autoComplete="name"
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? 'contact-name-error' : undefined}
          className={inputClass}
        />
        {nameError && (
          <p id="contact-name-error" className="text-sm text-ds-critical">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-phone" className="text-sm font-semibold">
          Mobile number
        </label>
        <input
          id="contact-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          maxLength={20}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={Boolean(phoneError)}
          aria-describedby={phoneError ? 'contact-phone-error' : 'contact-phone-hint'}
          className={inputClass}
        />
        {phoneError ? (
          <p id="contact-phone-error" className="text-sm text-ds-critical">
            {phoneError}
          </p>
        ) : (
          <p id="contact-phone-hint" className="text-xs text-ds-muted">
            Indian numbers need no +91. Other countries: start with + and the country code.
          </p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-ds-ink-2">
        Shared only with event staff, so the person sent to help you can call you. Deleted after the event.
      </p>

      {errors.form && (
        <p role="alert" className="text-sm text-ds-critical">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-ds-accent px-5 text-[15px] font-semibold text-ds-on-accent hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {submitLabel}
      </button>
    </form>
  );
}

/** Turns a JoinError into messages for ContactForm. */
export function contactErrors(err) {
  if (err?.code === 'invalid_name') return { name: err.message };
  if (err?.code === 'invalid_phone') return { phone: err.message };
  return { form: 'Couldn’t reach the event service. Check your mobile data or Wi-Fi, then try again.' };
}
