import { Badge } from '../ui/Badge';
import { formatCurrency } from '../../lib/utils';
import { UTILIDAD_EJERCICIO_LABEL, type BalanceSheetReport, type ReportRow } from '../../types/financialReports';
import { roundMoney } from '../../types/paymentApplication';

function presentedSaldo(row: ReportRow): number {
  if (row.account_code === '' && row.account_name === UTILIDAD_EJERCICIO_LABEL) return row.saldo_final;
  if (row.naturaleza === 'pasivo' || row.naturaleza === 'capital') return roundMoney(-row.saldo_final);
  if (row.naturaleza === 'iva' && row.tipo_iva === 'trasladado') return roundMoney(-row.saldo_final);
  return row.saldo_final;
}

export function BalanceSheetSection({ report }: { report: BalanceSheetReport }) {
  const contra = roundMoney(report.total_pasivo + report.total_capital);
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-bold text-ink">Estado de situación financiera</p>
          <p className="text-xs text-ink-muted mt-1">
            Periodo {report.periodKey}. La utilidad del ejercicio se presenta en el capital.
          </p>
        </div>
        <Badge variant={report.is_balanced ? 'success' : 'error'}>
          {report.is_balanced ? 'Cuadra' : 'No cuadra'}
        </Badge>
      </div>

      <p className="text-sm text-ink">
        Activo {formatCurrency(report.total_activo)} = Pasivo {formatCurrency(report.total_pasivo)} + Capital{' '}
        {formatCurrency(report.total_capital)} ({formatCurrency(contra)})
      </p>

      {report.rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No hay saldos de balance en este periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-xs text-ink-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Cuenta</th>
                <th className="py-2 pr-3 font-medium">Nombre</th>
                <th className="py-2 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={`${row.account_code}-${row.account_name}`} className="border-b border-border">
                  <td className="py-2 pr-3 font-mono text-ink">{row.account_code || '—'}</td>
                  <td className="py-2 pr-3 text-ink">{row.account_name}</td>
                  <td className="py-2 text-right font-mono">
                    {formatCurrency(presentedSaldo(row))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
