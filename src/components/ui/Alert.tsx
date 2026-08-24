import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const variants: Record<AlertVariant, string> = {
  info: 'border-info/30 bg-info-muted text-ink',
  success: 'border-success/30 bg-success-muted text-ink',
  warning: 'border-warning/30 bg-warning-muted text-ink',
  error: 'border-danger/30 bg-danger-muted text-ink',
};

export type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
};

export function Alert({
  variant = 'info',
  title,
  children,
  className,
}: AlertProps) {
  const role = variant === 'error' || variant === 'warning' ? 'alert' : 'status';
  return (
    <div
      role={role}
      className={cn(
        'rounded-lg border px-4 py-3 text-sm space-y-1',
        variants[variant],
        className
      )}
    >
      {title ? <p className="font-semibold text-ink">{title}</p> : null}
      {children ? <div className="text-ink-muted text-xs leading-relaxed">{children}</div> : null}
    </div>
  );
}
