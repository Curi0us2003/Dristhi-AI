import { cn } from '@/lib/utils';

const toneClass = {
  critical:
    'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800',
  warning:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  normal:
    'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  predicted:
    'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800',
  muted: 'bg-muted text-muted-foreground border-border',
};

const dotClass = {
  critical: 'bg-orange-600',
  warning: 'bg-amber-500',
  normal: 'bg-emerald-600',
  predicted: 'bg-blue-600',
  muted: 'bg-muted-foreground',
};

/** Coloured status pill that always shows its word (never colour alone). */
export function StatusBadge({ tone, children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        toneClass[tone],
        className,
      )}
    >
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dotClass[tone])} />
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
