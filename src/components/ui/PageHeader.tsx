import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3',
        className
      )}
    >
      <div className="space-y-1 min-w-0">
        <h1 className="text-xl font-bold text-ink tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-ink-muted max-w-2xl">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
