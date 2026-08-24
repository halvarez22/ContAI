/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { TransactionsSection } from './TransactionsSection';
import type { TransactionRow } from '../../types/appSections';

const tx: TransactionRow = {
  id: '1',
  fecha: '2026-08-01',
  tipo: 'egreso',
  monto: 1500,
  moneda: 'MXN',
  status: 'pendiente',
  proveedor: 'Proveedor Demo',
  concepto: 'Servicio',
  account_name: 'Gastos',
};

describe('TransactionsSection', () => {
  const baseProps = {
    transactionsCount: 1,
    filteredTransactions: [tx],
    filters: {
      filterType: 'all',
      filterStatus: 'all',
      filterStartDate: '',
      filterEndDate: '',
      filterProvider: '',
      filterTag: '',
    },
    onFilterChange: {
      setFilterType: vi.fn(),
      setFilterStatus: vi.fn(),
      setFilterStartDate: vi.fn(),
      setFilterEndDate: vi.fn(),
      setFilterProvider: vi.fn(),
      setFilterTag: vi.fn(),
    },
    onGenerateMonthlyReport: vi.fn(),
    onExportCsv: vi.fn(),
    onOpenExcelImport: vi.fn(),
    onOpenManualTx: vi.fn(),
    onSelectTransaction: vi.fn(),
  };

  it('renderiza tabla y acciones', () => {
    render(<TransactionsSection {...baseProps} />);
    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeTruthy();
    expect(screen.getByText('Proveedor Demo')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Capturar/i })).toBeTruthy();
  }, 15000);

  it('smoke axe', async () => {
    const { container } = render(<TransactionsSection {...baseProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  }, 20000);
});
