import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import type { DashboardMode } from '../../types/dashboardMode';

export type ViewModeToggleProps = {
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  className?: string;
};

/**
 * Toggle Operativo / Ejecutivo (contexto E7.x). No dispara fetches.
 */
export function ViewModeToggle({
  mode,
  onModeChange,
  className,
}: ViewModeToggleProps) {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      role="group"
      aria-label="Modo de dashboard"
    >
      <Badge variant="info" className="hidden xl:inline-flex">
        Modo: {mode === 'operativo' ? 'Operativo' : 'Ejecutivo'}
      </Badge>
      <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
        <Button
          type="button"
          variant={mode === 'operativo' ? 'primary' : 'ghost'}
          className={cn(
            'px-2.5 py-1.5 text-xs rounded-md shadow-none active:scale-100',
            mode !== 'operativo' && 'hover:bg-surface'
          )}
          aria-pressed={mode === 'operativo'}
          onClick={() => onModeChange('operativo')}
        >
          Operativo
        </Button>
        <Button
          type="button"
          variant={mode === 'ejecutivo' ? 'primary' : 'ghost'}
          className={cn(
            'px-2.5 py-1.5 text-xs rounded-md shadow-none active:scale-100',
            mode !== 'ejecutivo' && 'hover:bg-surface'
          )}
          aria-pressed={mode === 'ejecutivo'}
          onClick={() => onModeChange('ejecutivo')}
        >
          Ejecutivo
        </Button>
      </div>
    </div>
  );
}
