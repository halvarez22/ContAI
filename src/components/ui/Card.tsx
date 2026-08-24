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
        'bg-surface rounded-xl border border-border shadow-sm overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}
