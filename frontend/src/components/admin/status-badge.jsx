import { cn } from '@/lib/utils';

/** Tones from the design tokens: each pairs a tint background with a dark text colour. */
const toneClass = {
  critical: 'bg-ds-critical-tint text-ds-critical',
  warning: 'bg-ds-warning-tint text-ds-warning',
  normal: 'bg-ds-accent-tint text-ds-accent-ink',
  predicted: 'bg-ds-predicted-tint text-ds-predicted',
  muted: 'bg-ds-divider text-ds-ink-2',
};

/** Status tag that always shows its word (never colour alone), as in the Dashboard mockup. */
export function StatusBadge({ tone, children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-[3px] text-xs font-semibold',
        toneClass[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function densityTone(status) {
  switch (status) {
    case 'Critical':
      return 'critical';
    case 'Warning':
      return 'warning';
    case 'Normal':
      return 'normal';
    default:
      return 'muted';
  }
}

/** Bar colour for a density status (track is ds-divider). */
export function densityBarClass(status) {
  switch (status) {
    case 'Critical':
      return 'bg-ds-critical-bar';
    case 'Warning':
      return 'bg-ds-warning-bar';
    default:
      return 'bg-ds-accent';
  }
}
