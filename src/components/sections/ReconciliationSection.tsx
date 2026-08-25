import { PageHeader } from '../ui/PageHeader';
import { BankReconciliationPanel } from '../BankReconciliationPanel';
import type { ReconciliationSectionProps } from '../../types/appSections';

export function ReconciliationSection({
  ledger,
  periodLabel,
  organizationId,
  userId,
}: ReconciliationSectionProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conciliación bancaria"
        description="Carga un CSV bancario y concilia movimientos 1↔1 o split 1→N con el ledger del periodo."
      />
      <BankReconciliationPanel
        ledger={ledger}
        periodLabel={periodLabel}
        organizationId={organizationId}
        userId={userId}
      />
    </div>
  );
}
