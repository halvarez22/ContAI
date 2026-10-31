/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CatalogAccount } from '../../types/chartOfAccounts';
import { ReconciledReassignmentPanel } from './ReconciledReassignmentPanel';

vi.mock('../../hooks/useReconciledReassignment', () => ({
  useReconciledReassignment: () => ({ save: vi.fn(), saving: false }),
}));

const gasto: CatalogAccount = {
  code: '601.84',
  name: 'Gastos Operativos',
  naturaleza: 'gasto',
  activa: true,
};
const viaticos: CatalogAccount = {
  code: '601.49',
  name: 'Viáticos y Viajes',
  naturaleza: 'gasto',
  activa: true,
};

function renderPanel(partial: Partial<Parameters<typeof ReconciledReassignmentPanel>[0]> = {}) {
  return render(
    <ReconciledReassignmentPanel
      transactionId="tx-1"
      fecha="2026-01-15T12:00:00.000Z"
      status="conciliado"
      tipo="egreso"
      monto={1160}
      accountCode="601.84"
      canManage
      atajoPueBancos={false}
      periodosCerrados={[]}
      chart={[gasto, viaticos]}
      organizationId="org-1"
      actorUserId="admin-1"
      onUpdated={vi.fn()}
      {...partial}
    />
  );
}

describe('ReconciledReassignmentPanel', () => {
  it('oculta la acción si el usuario no administra la organización', () => {
    renderPanel({ canManage: false });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reclasificar' })).toBeNull();
  });

  it('exige la confirmación antes de reclasificar', () => {
    renderPanel();
    const button = screen.getByRole('button', { name: 'Reclasificar' });
    expect(
      screen.getByLabelText('Entiendo que esto modificará un movimiento ya conciliado')
    ).toBeTruthy();
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '601.49' } });
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
  });
});