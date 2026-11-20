/**
 * Small layout pieces for operator screens, styled like docs/design/mockups/Dashboard.dc.html:
 * off-white page, white cards with a 1px border and 16px radius, Space Grotesk headings.
 */
import { cn } from '@/lib/utils';

export function PageHeader({ title, meta, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.5px] text-ds-ink md:text-[32px]">{title}</h1>
        {meta && <p className="mt-1 text-[13px] text-ds-muted">{meta}</p>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, description, action, className, bodyClassName, children, as: Tag = 'section' }) {
  return (
    <Tag className={cn('min-w-0 rounded-2xl border border-ds-border bg-ds-surface px-5 py-5 md:px-6', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title && <h2 className="text-base font-semibold text-ds-ink">{title}</h2>}
            {description && <p className="text-[13px] leading-relaxed text-ds-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

export function Kpi({ label, value, hint, tone }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-ds-border bg-ds-surface p-5">
      <span className="text-[13px] text-ds-muted">{label}</span>
      <span
        className={cn(
          'font-display text-[32px] font-semibold leading-none tabular-nums',
          tone === 'critical' ? 'text-ds-critical' : 'text-ds-ink'
        )}
      >
        {value}
      </span>
      {hint && <span className="text-[13px] text-ds-muted">{hint}</span>}
    </div>
  );
}

/** Empty-state text inside a panel. */
export function EmptyNote({ children }) {
  return <p className="py-6 text-center text-sm text-ds-muted">{children}</p>;
}
