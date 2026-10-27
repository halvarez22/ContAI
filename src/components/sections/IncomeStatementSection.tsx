import { Button } from '../ui/Button';
import { formatCurrency } from '../../lib/utils';
import type { IncomeStatementReport } from '../../types/financialReports';

export function IncomeStatementSection({
  report,
  onExport,
  exportDisabled = false,
  exportDisabledHint = '',
}: {
  report: IncomeStatementReport;
  onExport?: () => void;
  exportDisabled?: boolean;
  exportDisabledHint?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-ink">Estado de resultados</p>
        <p className="text-xs text-ink-muted mt-1">
          Periodo {report.periodKey}. Solo ingresos y gastos del mes. El IVA no entra aquí.
        </p>
      </div>

      {report.rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No hay ingresos ni gastos en este mes.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-ink-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Cuenta</th>
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium text-right">Cargos</th>
                <th className="py-2 pr-3 font-medium text-right">Abonos</th>
                <th className="py-2 font-medium text-right">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.account_code} className="border-b border-border">
                  <td className="py-2 pr-3 font-mono text-ink">{row.account_code}</td>
                  <td className="py-2 pr-3 text-ink">{row.account_name}</td>
                  <td className="py-2 pr-3 text-right font-mono">{formatCurrency(row.cargos)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{formatCurrency(row.abonos)}</td>
                  <td className="py-2 text-right font-mono">{formatCurrency(row.saldo_final)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-sm text-ink space-y-1">
        <p>Ingresos {formatCurrency(report.total_ingresos)}</p>
        <p>Gastos {formatCurrency(report.total_gastos)}</p>
        <p className="font-semibold">Utilidad neta {formatCurrency(report.utilidad_neta)}</p>
      </div>

      {onExport ? (
        <div className="space-y-1">
          <span title={exportDisabled ? exportDisabledHint : 'Descarga el estado de resultados'}>
            <Button type="button" variant="secondary" disabled={exportDisabled} onClick={onExport}>
              Exportar estado de resultados
            </Button>
          </span>
          {exportDisabled && exportDisabledHint ? (
            <p className="text-xs text-ink-muted">{exportDisabledHint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
