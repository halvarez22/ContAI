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
    onExportPolizaTxt: vi.fn(),
    polizaExportDisabled: false,
    onOpenExcelImport: vi.fn(),
    onOpenManualTx: vi.fn(),
    onSelectTransaction: vi.fn(),
  };

  it('renderiza tabla y acciones', () => {
    render(<TransactionsSection {...baseProps} />);
    expect(screen.getByRole('heading', { name: 'Transacciones' })).toBeTruthy();
    expect(screen.getByText('Proveedor Demo')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Capturar/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Exportar póliza/i })
    ).toBeTruthy();
  }, 15000);

  it('el mes vacío dice qué falta y apaga el CSV', () => {
    render(
      <TransactionsSection
        {...baseProps}
        transactionsCount={0}
        filteredTransactions={[]}
        emptyMessage="Agosto 2026 no tiene movimientos. Importa los CFDI de ese mes o elige otro periodo."
      />
    );
    expect(
      screen.getByText(
        'Agosto 2026 no tiene movimientos. Importa los CFDI de ese mes o elige otro periodo.'
      )
    ).toBeTruthy();
    const csv = screen.getByRole('button', { name: /Exportar CSV/i });
    expect(csv).toBeDisabled();
    expect(csv.parentElement?.getAttribute('title')).toBe(
      'No hay movimientos en el listado para exportar.'
    );
  });

  it('deshabilita export póliza si polizaExportDisabled', () => {
    render(
      <TransactionsSection
        {...baseProps}
        polizaExportDisabled
        polizaExportDisabledHint="No hay transacciones conciliadas y clasificadas en este periodo para exportar"
      />
    );
    const btn = screen.getByRole('button', { name: /Exportar póliza/i });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toMatch(/conciliadas y clasificadas/i);
  });

  it('muestra badge Riesgo 69-B solo si fiscalRisk69b', () => {
    const { rerender } = render(<TransactionsSection {...baseProps} />);
    expect(screen.queryByText('Riesgo 69-B')).toBeNull();

    rerender(
      <TransactionsSection
        {...baseProps}
        filteredTransactions={[
          {
            ...tx,
            fiscalRisk69b: true,
            fiscalRiskTooltip: 'RFC presente en la lista 69-B del SAT (publicación: no indicada).',
          },
        ]}
      />
    );
    expect(screen.getByText('Riesgo 69-B')).toBeTruthy();
  });

  it('muestra la ficha bajo el concepto y no la inventa si el renglón no la trae', () => {
    render(<TransactionsSection {...baseProps} />);
    expect(screen.queryByText(/Folio fiscal:/)).toBeNull();

    render(
      <TransactionsSection
        {...baseProps}
        filteredTransactions={[
          {
            ...tx,
            cfdi_fiscal_face: {
              clase: 'nota_credito',
              serie: 'NC',
              folio: '4',
              folioFiscal: '22222222-2222-2222-2222-222222222222',
              descuento: 10,
              impuestos: [],
            },
          },
        ]}
      />
    );
    expect(screen.getByText(/Tipo: Nota de crédito/)).toBeTruthy();
    expect(screen.getByText(/Folio fiscal: 22222222-2222-2222-2222-222222222222/)).toBeTruthy();
  });

  it('smoke axe', async () => {
    const { container } = render(<TransactionsSection {...baseProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  }, 20000);
});
