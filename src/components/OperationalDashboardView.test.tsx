/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { OperationalDashboardView } from './OperationalDashboardView';
import type { OperationalSnapshot } from '../types/operationalDashboard';

const snapshot: OperationalSnapshot = {
  periodoLabel: 'Agosto 2026',
  counts: {
    revision: 1,
    pending: 2,
    unclassified: 0,
    highRisk: 0,
    totalTasks: 3,
    fiscalRiskProviders: 1,
  },
  tasks: [
    {
      id: 't1',
      kind: 'revision',
      title: 'Proveedor X',
      subtitle: 'En revisión',
      amount: 500,
      severity: 'warning',
    },
  ],
  alerts: [],
  isEmpty: false,
  hasTransactions: true,
  pctBankReconciled: 50,
  bankReconciledCount: 1,
  txCount: 2,
};

describe('OperationalDashboardView', () => {
  it('renderiza tareas y CTAs', () => {
    const onNavigate = vi.fn();
    render(
      <OperationalDashboardView
        snapshot={snapshot}
        onNavigateTab={onNavigate}
        onOpenManualTx={vi.fn()}
        onOpenCfdiImport={vi.fn()}
        onOpenExcelImport={vi.fn()}
        onTaskAction={vi.fn()}
      />
    );
    expect(screen.getByText('Vista operativa')).toBeTruthy();
    expect(screen.getByText('Proveedor X')).toBeTruthy();
    expect(screen.getByText(/Proveedores con riesgo fiscal/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Conciliación bancaria/i }));
    expect(onNavigate).toHaveBeenCalledWith('reconciliation');
  });

  it('empty state todo al dia', () => {
    render(
      <OperationalDashboardView
        snapshot={{
          ...snapshot,
          counts: {
            revision: 0,
            pending: 0,
            unclassified: 0,
            highRisk: 0,
            totalTasks: 0,
            fiscalRiskProviders: 0,
          },
          tasks: [],
          isEmpty: true,
          alerts: [
            { variant: 'success', title: '¡Todo al día!', body: 'No hay tareas pendientes.' },
          ],
        }}
        onNavigateTab={vi.fn()}
        onOpenManualTx={vi.fn()}
        onOpenCfdiImport={vi.fn()}
        onOpenExcelImport={vi.fn()}
        onTaskAction={vi.fn()}
      />
    );
    expect(screen.getByText(/Todo al día/i)).toBeTruthy();
  });

  it('smoke axe', async () => {
    const { container } = render(
      <OperationalDashboardView
        snapshot={snapshot}
        onNavigateTab={vi.fn()}
        onOpenManualTx={vi.fn()}
        onOpenCfdiImport={vi.fn()}
        onOpenExcelImport={vi.fn()}
        onTaskAction={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
