'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { MedicalDraftCard, MissingPersonDraftCard } from '@/components/attendee/report-drafts';
import { cn } from '@/lib/utils';

/** /user/help?type=medical|missing: the same report cards the assistant uses, filled in by hand. */
export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <Help />
    </Suspense>
  );
}

function Help() {
  const type = useSearchParams().get('type') === 'missing' ? 'missing' : 'medical';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 lg:mx-0">
      <Link
        href="/user/dashboard"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-[10px] text-sm font-medium text-ds-ink-2 hover:text-ds-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Home
      </Link>

      <nav aria-label="Report type" className="grid grid-cols-2 gap-1 rounded-full bg-ds-divider p-1">
        {['medical', 'missing'].map((t) => (
          <Link
            key={t}
            aria-current={type === t ? 'page' : undefined}
            href={`/user/help?type=${t}`}
            replace
            className={cn(
              'flex min-h-11 items-center justify-center rounded-full text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-accent',
              type === t ? 'bg-ds-surface text-ds-ink shadow-sm' : 'text-ds-muted',
            )}
          >
            {t === 'medical' ? 'Medical help' : 'Missing person'}
          </Link>
        ))}
      </nav>

      {/* key: a fresh draft when switching type */}
      {type === 'medical' ? (
        <MedicalDraftCard key="medical" startEditing />
      ) : (
        <MissingPersonDraftCard key="missing" />
      )}

      <p className="text-center text-[13px] text-ds-muted">
        Nothing reaches the control room until you tap Send.
      </p>
    </div>
  );
}
