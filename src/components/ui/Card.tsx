import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Card({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden dark:bg-gray-900 dark:border-gray-800',
        className
      )}
    >
      {children}
    </div>
  );
}
