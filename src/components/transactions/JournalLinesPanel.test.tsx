/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CatalogAccount } from '../../types/chartOfAccounts';
import type { JournalEntry } from '../../types/journalEntry';
import { JournalLinesPanel } from './JournalLinesPanel';

vi.mock('../../hooks/useLineReassignment', () => ({
  useLineReassignment: () => ({ save: vi.fn(), saving: false }),
}));

const gasto: CatalogAccount = {
  code: '601.84',
  name: 'Gastos Operativos',
  naturaleza: 'gasto',
  activa: true,
};
const inactiva: CatalogAccount = {
  code: '601.61',
  name: 'Marketing y Publicidad',
  naturaleza: 'gasto',
  activa: false,
};

const devengo: JournalEntry = {
  transaction_id: 'tx-1',
  tipo: 'egreso',
  fecha: '2026-01-15',
  atajo_pue_bancos: false,
  lines: [
    { account_code: '601.84', account_name: 'Gastos Operativos', tipo: 'cargo', monto: 100, concepto: 'Servicio' },
    { account_code: '201.01', account_name: 'Proveedores', tipo: 'abono', monto: 100, concepto: 'Servicio' },
  ],
};

function renderPanel(partial: Partial<Parameters<typeof JournalLinesPanel>[0]> = {}) {
  return render(
    <JournalLinesPanel
      transactionId="tx-1"
      status="revisión"
      fecha="2026-01-15T12:00:00.000Z"
      asientoDevengo={devengo}
      chart={[gasto, inactiva]}
      periodosCerrados={[]}
      canWrite
      organizationId="org-1"
      onUpdated={vi.fn()}
      {...partial}
    />
  );
}

describe('JournalLinesPanel', () => {
  it('oculta el selector si el movimiento no está en revisión', () => {
    renderPanel({ status: 'conciliado' });
    expect(screen.getByText('601.84 Gastos Operativos')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('No está en revisión')).toBeTruthy();
  });

  it('oculta el selector si el usuario no puede escribir', () => {
    renderPanel({ canWrite: false });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('No puedes modificar los movimientos de esta organización.')).toBeTruthy();
  });

  it('ofrece solo cuentas activas cuando se puede corregir', () => {
    renderPanel();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBe(2);
    expect(screen.getAllByRole('option', { name: '601.84 Gastos Operativos' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: '601.61 Marketing y Publicidad' })).toBeNull();
  });
});
