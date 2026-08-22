import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  error: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
  info: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400',
};

export function Badge({
  children,
  variant = 'default',
  className,
}: {
  children?: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
