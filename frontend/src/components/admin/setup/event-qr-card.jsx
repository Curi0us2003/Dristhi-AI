'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, Loader2, QrCode, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/status-badge';
import { useToast } from '@/hooks/use-toast';
import { fetchEventQr, fetchStaffQr } from '@/lib/admin-data';

/**
 * The one QR code attendees scan at the venue: opens /join?e=<slug> on the attendee site.
 * The image route needs the admin's token, so it is fetched as a Blob and shown via an object URL.
 *
 * With `variant="staff"` it shows the staff app QR instead (/staff?e=<slug>), for guards and
 * medics to scan at their briefing.
 */
const VARIANTS = {
  attendee: {
    fetch: fetchEventQr,
    url: (event) => event.joinUrl || `/join?e=${event.slug}`,
    file: (event) => `event-${event.slug}-qr.png`,
    title: 'Attendee QR code',
    description:
      'Print this at the gates and on posters. Scanning it opens the attendee app for this event. No sign-in needed.',
  },
  staff: {
    fetch: fetchStaffQr,
    url: (event) => event.joinUrl?.replace(/\/join\?/, '/staff?') || `/staff?e=${event.slug}`,
    file: (event) => `event-${event.slug}-staff-qr.png`,
    title: 'Staff app QR code',
    description:
      'Show this at the staff briefing. Guards and medics scan it, then sign in with their name and app code from the roster above.',
  },
};

export default function EventQrCard({ event, variant = 'attendee' }) {
  const v = VARIANTS[variant];
  const link = v.url(event);
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    v.fetch(event.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch((err) => !cancelled && setError(err.message || 'Could not load the QR code.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Reload when the event or its link changes.
  }, [event.id, event.slug, attempt, v]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: link, variant: 'destructive' });
    }
  }

  return (
    <Panel
      title={v.title}
      description={v.description}
      action={
        variant === 'staff' ? null : event.status === 'live' ? (
          <StatusBadge tone="normal">Joining open</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Set status to Live to let attendees join</StatusBadge>
        )
      }
    >
      <div className={variant === 'staff' ? 'flex flex-col items-start gap-4' : 'flex flex-col items-start gap-5 sm:flex-row'}>
        <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border border-ds-border bg-white p-2">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-ds-muted" aria-label="Loading QR code" />
          ) : imageUrl && !error ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={`QR code for ${link}`} className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 px-2 text-center text-xs text-ds-muted">
              <QrCode className="h-8 w-8" aria-hidden />
              {error || 'No QR code'}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-[13px] text-ds-muted">Link in the QR code</p>
            <p className="break-all font-medium text-ds-ink">{link}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild disabled={!imageUrl}>
              <a href={imageUrl ?? undefined} download={v.file(event)} aria-disabled={!imageUrl}>
                <Download className="mr-2 h-4 w-4" />
                Download QR
              </a>
            </Button>
            <Button type="button" variant="outline" onClick={copyLink} disabled={!event.joinUrl}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {error && (
              <Button type="button" variant="ghost" onClick={() => setAttempt((a) => a + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
          <p className="text-xs text-ds-muted">
            The link uses the backend&apos;s PUBLIC_APP_URL. Set it to the attendee site&apos;s address before printing.
          </p>
        </div>
      </div>
    </Panel>
  );
}
