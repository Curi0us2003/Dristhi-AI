'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, MapPin, MapPinOff } from 'lucide-react';
import Link from 'next/link';
import { useLocation } from '@/contexts/attendee-context';
import { isIOS } from '@/lib/location';
import { cn } from '@/lib/utils';

/** Bottom sheet on phones, centred dialog from 640 px. */
const panel =
  'fixed z-50 bg-ds-surface text-ds-ink shadow-xl focus:outline-none ' +
  'inset-x-0 bottom-0 rounded-t-3xl px-5 pt-3 pb-[calc(1.75rem+env(safe-area-inset-bottom))] ' +
  'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6';

export const primaryButton =
  'inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-ds-accent px-5 text-[15px] font-semibold text-ds-on-accent ' +
  'hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent disabled:opacity-60';

export const secondaryButton =
  'inline-flex min-h-11 w-full items-center justify-center rounded-[10px] border border-ds-input-border bg-ds-surface px-4 text-[15px] font-semibold text-ds-accent-ink ' +
  'hover:bg-ds-accent-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-accent';

/** Frame 1: explainer shown before the browser's own permission dialog. */
export function LocationSheet() {
  const { sheetOpen, allow, dismissSheet } = useLocation();

  return (
    <Dialog.Root open={sheetOpen} onOpenChange={(open) => !open && dismissSheet()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ds-scrim" />
        <Dialog.Content className={panel} aria-describedby="loc-desc">
          <span
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-ds-input-border sm:hidden"
            aria-hidden
          />
          <div className="flex flex-col gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ds-accent-tint text-ds-accent">
              <MapPin className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5">
              <Dialog.Title className="font-display text-[22px] font-semibold">
                Allow your location?
              </Dialog.Title>
              <p id="loc-desc" className="text-sm text-ds-ink-2">
                It helps us:
              </p>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm leading-relaxed">
              <li className="flex gap-2.5">
                <Check
                  className="mt-0.5 h-[18px] w-[18px] flex-none text-ds-accent"
                  strokeWidth={2}
                  aria-hidden
                />
                Show the nearest washroom, water, first aid and exit
              </li>
              <li className="flex gap-2.5">
                <Check
                  className="mt-0.5 h-[18px] w-[18px] flex-none text-ds-accent"
                  strokeWidth={2}
                  aria-hidden
                />
                Send a medic to the right spot when you ask for help
              </li>
            </ul>
            <p className="rounded-[10px] bg-ds-accent-tint px-3 py-2.5 text-[13px] leading-relaxed text-ds-accent-ink">
              The control room only sees your location when you send a request. We don’t track you around the
              venue.
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" className={primaryButton} onClick={() => void allow()}>
                Allow location
              </button>
              <button
                type="button"
                onClick={dismissSheet}
                className="min-h-11 rounded-[10px] text-[15px] font-medium text-ds-ink-2 hover:bg-ds-divider focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-accent"
              >
                Not now
              </button>
            </div>
            <p className="text-center text-xs text-ds-muted">
              Your browser will ask next. Choose <strong>Allow</strong>.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Frame 1b, second half: steps to unblock location in the browser. */
export function LocationBlockedHelp() {
  const { blockedHelpOpen, closeBlockedHelp } = useLocation();
  const ios = typeof window !== 'undefined' && isIOS();

  return (
    <Dialog.Root open={blockedHelpOpen} onOpenChange={(open) => !open && closeBlockedHelp()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ds-scrim" />
        <Dialog.Content className={panel} aria-describedby="blocked-desc">
          <span
            className="mx-auto mb-4 block h-1 w-10 rounded-full bg-ds-input-border sm:hidden"
            aria-hidden
          />
          <div className="flex flex-col gap-3">
            <Dialog.Title className="text-base font-semibold">
              Location is blocked in your browser
            </Dialog.Title>
            <p id="blocked-desc" className="sr-only">
              Steps to allow location for this site.
            </p>
            {ios ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ds-ink-2">
                <li>Open the Settings app.</li>
                <li>Go to Privacy &amp; Security → Location Services and turn it on.</li>
                <li>In the same list, open Safari Websites and choose While Using the App.</li>
                <li>Come back here and reload the page.</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ds-ink-2">
                <li>Tap the icon to the left of the web address.</li>
                <li>
                  Open <strong>Permissions</strong> or <strong>Site settings</strong>.
                </li>
                <li>
                  Set <strong>Location</strong> to <strong>Allow</strong>, then reload.
                </li>
              </ol>
            )}
            <p className="text-[13px] text-ds-muted">
              You can still ask for help without it: we’ll ask which area you’re in.
            </p>
            <div className="mt-1 flex flex-col gap-2">
              <Dialog.Close asChild>
                <Link href="/user/help?type=medical" className={secondaryButton}>
                  Pick my area instead
                </Link>
              </Dialog.Close>
              <Dialog.Close className="min-h-11 rounded-[10px] text-[15px] font-medium text-ds-ink-2 hover:bg-ds-divider">
                Close
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Frame 1b: banner at the top of Home until location is allowed. */
export function LocationOffBanner({ className }) {
  const { permission, sheetOpen, ensureLocation, lastError } = useLocation();

  if (permission === 'granted' && lastError) {
    return (
      <p
        role="status"
        className={cn('rounded-2xl bg-ds-warning-tint px-4 py-3 text-[13px] text-ds-warning', className)}
      >
        {lastError}
      </p>
    );
  }
  if (permission === 'granted' || permission === 'unknown' || sheetOpen) return null;

  const unsupported = permission === 'unsupported';
  return (
    <section
      aria-labelledby="loc-off-h"
      className={cn('flex items-start gap-3 rounded-2xl bg-ds-warning-tint px-4 py-3.5', className)}
    >
      <MapPinOff className="mt-0.5 h-5 w-5 flex-none text-ds-warning" strokeWidth={1.75} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="loc-off-h" className="text-sm font-semibold text-ds-warning">
          Location is off
        </h2>
        <p className="text-[13px] leading-relaxed text-ds-ink-2">
          {unsupported
            ? 'This browser can’t share your location here. Help requests will ask which area you’re in.'
            : 'Help requests will ask which area you’re in, and nearest places can’t use where you are.'}
        </p>
      </div>
      {!unsupported && (
        <button
          type="button"
          onClick={() => void ensureLocation('banner')}
          className="min-h-11 flex-none rounded-[10px] border border-ds-input-border bg-ds-surface px-3.5 text-sm font-semibold text-ds-warning hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-accent"
        >
          Turn on
        </button>
      )}
    </section>
  );
}
