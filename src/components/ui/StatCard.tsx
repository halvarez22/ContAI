import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'brand';

const valueTone: Record<Tone, string> = {
  default: 'text-ink',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  brand: 'text-brand',
};

export type StatCardProps = {
  label: string;
  value: ReactNode;
  delta?: string;
  tone?: Tone;
  hint?: string;
  className?: string;
};

export function StatCard({
  label,
  value,
  delta,
  tone = 'default',
  hint,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface p-4 shadow-sm space-y-2',
        className
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
        {label}
      </p>
      <p className={cn('text-2xl font-semibold font-mono tabular-nums', valueTone[tone])}>
        {value}
      </p>
      {delta ? (
        <p className="text-xs text-ink-muted font-mono tabular-nums">{delta}</p>
      ) : null}
      {hint ? <p className="text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
