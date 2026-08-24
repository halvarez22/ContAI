import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { PeriodChangeHandler } from '../../types/appSections';

export type PeriodSelectorCardProps = {
  periodYear: number;
  periodMonth: number;
  onPeriodChange: PeriodChangeHandler;
  onSelectCurrentMonth: () => void;
  yearAnchor: number;
  title?: string;
  description?: string;
};

/**
 * Selector de periodo puramente controlado (fuente de verdad en App).
 */
export function PeriodSelectorCard({
  periodYear,
  periodMonth,
  onPeriodChange,
  onSelectCurrentMonth,
  yearAnchor,
  title = 'Periodo para métricas',
  description = 'Panel y reportes usan este mes/año.',
}: PeriodSelectorCardProps) {
  return (
    <Card className="p-4 flex flex-col sm:flex-row sm:items-end gap-4 flex-wrap">
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider">
          {title}
        </label>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <label
            htmlFor="period-year"
            className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider"
          >
            Año
          </label>
          <select
            id="period-year"
            value={periodYear}
            onChange={(e) => onPeriodChange(Number(e.target.value), periodMonth)}
            className="bg-surface-muted border border-border rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-focus outline-none"
          >
            {Array.from({ length: 6 }, (_, i) => yearAnchor - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="period-month"
            className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider"
          >
            Mes
          </label>
          <select
            id="period-month"
            value={periodMonth}
            onChange={(e) => onPeriodChange(periodYear, Number(e.target.value))}
            className="bg-surface-muted border border-border rounded-lg px-3 py-2 text-sm min-w-[160px] focus-visible:ring-2 focus-visible:ring-focus outline-none"
          >
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m}>
                {new Date(2000, m, 1).toLocaleString('es-MX', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" type="button" className="text-sm" onClick={onSelectCurrentMonth}>
          Mes actual
        </Button>
      </div>
    </Card>
  );
}
