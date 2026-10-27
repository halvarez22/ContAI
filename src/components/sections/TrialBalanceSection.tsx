import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { formatCurrency } from '../../lib/utils';
import {
  TRIAL_BALANCE_TRUNCATED_HINT,
  TRIAL_BALANCE_UNBALANCED_HINT,
  type TrialBalanceReport,
} from '../../types/financialReports';

function signedBalance(amount: number): string {
  const text = formatCurrency(amount);
  return amount < 0 ? `${text} acreedor` : text;
}

export function TrialBalanceSection({
  report,
  onExport,
  exportDisabled = false,
  exportDisabledHint = '',
}: {
  report: TrialBalanceReport;
  onExport?: () => void;
  exportDisabled?: boolean;
  exportDisabledHint?: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-ink">Balanza de comprobación</p>
        <p className="text-xs text-ink-muted mt-1">
          Periodo {report.periodKey}. El saldo final es saldo inicial + cargos − abonos.
        </p>
      </div>

      {report.truncated ? (
        <Alert variant="warning" title="Balanza preliminar">
          {TRIAL_BALANCE_TRUNCATED_HINT}
        </Alert>
      ) : null}

      {!report.is_balanced ? (
        <Alert variant="error" title="La balanza no cuadra">
          {TRIAL_BALANCE_UNBALANCED_HINT}
        </Alert>
      ) : null}

      {report.sin_devengo > 0 ? (
        <p className="text-xs text-ink-muted">
          {report.sin_devengo} movimiento{report.sin_devengo === 1 ? '' : 's'} del mes sin
          póliza de devengo. No entran a estos totales.
        </p>
      ) : null}

      {report.rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No hay cuentas con movimiento en este periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-ink-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Cuenta</th>
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 pr-3 font-medium text-right">Saldo inicial</th>
                <th className="py-2 pr-3 font-medium text-right">Cargos</th>
                <th className="py-2 pr-3 font-medium text-right">Abonos</th>
                <th className="py-2 font-medium text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.account_code} className="border-b border-border">
                  <td className="py-2 pr-3 font-mono text-ink">{row.account_code}</td>
                  <td className="py-2 pr-3 text-ink">{row.account_name}</td>
                  <td className="py-2 pr-3 text-right font-mono">{signedBalance(row.saldo_inicial)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{formatCurrency(row.cargos)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{formatCurrency(row.abonos)}</td>
                  <td className="py-2 text-right font-mono">{signedBalance(row.saldo_final)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink">
        Cargos del mes {formatCurrency(report.total_cargos)} · Abonos del mes{' '}
        {formatCurrency(report.total_abonos)}
      </p>

      {onExport ? (
        <div className="space-y-1">
          <span title={exportDisabled ? exportDisabledHint : 'Descarga la balanza'}>
            <Button type="button" variant="secondary" disabled={exportDisabled} onClick={onExport}>
              Exportar balanza
            </Button>
          </span>
          {exportDisabled && exportDisabledHint ? (
            <p className="text-xs text-ink-muted">{exportDisabledHint}</p>
          ) : null}
        </div>
      ) : null}

      {report.anomalies.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Cuentas fuera del catálogo</p>
          <ul className="space-y-1">
            {report.anomalies.map((item, index) => (
              <li key={`${item.transaction_id}-${item.account_code}-${index}`} className="text-xs text-ink-muted">
                {item.account_code || 'Sin código'} · {item.message} Cargos {formatCurrency(item.cargos)}, abonos{' '}
                {formatCurrency(item.abonos)}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
