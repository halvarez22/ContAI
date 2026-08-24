import { PageHeader } from '../ui/PageHeader';
import { BankReconciliationPanel } from '../BankReconciliationPanel';
import type { ReconciliationSectionProps } from '../../types/appSections';

export function ReconciliationSection({ ledger, periodLabel }: ReconciliationSectionProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciliación bancaria"
        description="Carga un CSV bancario y concilia movimientos con el ledger del periodo seleccionado en el panel."
      />
      <BankReconciliationPanel ledger={ledger} periodLabel={periodLabel} />
    </div>
  );
}
