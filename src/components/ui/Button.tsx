import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-foreground hover:bg-brand-hover shadow-sm',
  secondary:
    'bg-surface text-ink border border-border hover:bg-surface-muted',
  ghost:
    'text-ink-muted hover:bg-surface-muted hover:text-ink',
  danger:
    'bg-danger-muted text-danger hover:opacity-90',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children?: ReactNode;
  className?: string;
};

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
