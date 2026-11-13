import { describe, expect, it } from 'vitest';
import {
  buildTransactionExportCsv,
  filterTransactionsByMonth,
  transactionListEmptyMessage,
} from './monthlyAnalysis';

const july = {
  id: 'jul',
  fecha: '2026-07-15T18:00:00.000Z',
  tipo: 'egreso',
  monto: 4000,
  concepto: 'Renta julio',
  proveedor: 'Arrendador',
  moneda: 'MXN',
  status: 'pendiente',
};

const august = {
  id: 'aug',
  fecha: '2026-08-15T18:00:00.000Z',
  tipo: 'ingreso',
  monto: 17400,
  concepto: 'Cobro agosto',
  proveedor: 'Cliente',
  moneda: 'MXN',
  status: 'conciliado',
};

describe('lista y CSV del mes', () => {
  it('dos meses no se mezclan en la lista', () => {
    const augustOnly = filterTransactionsByMonth([july, august], 2026, 7);
    expect(augustOnly.map((tx) => tx.concepto)).toEqual(['Cobro agosto']);
  });

  it('el CSV generado no mezcla el otro mes', () => {
    const augustOnly = filterTransactionsByMonth([july, august], 2026, 7);
    const csv = buildTransactionExportCsv(augustOnly, {
      empresa: 'Demo',
      rfc: 'XAXX010101000',
      exportedAt: '2026-08-20T18:00:00.000Z',
    });
    expect(csv).toContain('Cobro agosto');
    expect(csv).not.toContain('Renta julio');
    expect(csv).toContain('"Demo"');
  });

  it('el mes vacío dice qué falta y el siguiente paso', () => {
    expect(
      transactionListEmptyMessage({
        monthCount: 0,
        periodLabel: 'Agosto 2026',
      })
    ).toBe(
      'Agosto 2026 no tiene movimientos. Importa los CFDI de ese mes o elige otro periodo.'
    );
  });

  it('con movimientos en el mes, el vacío es el de los filtros', () => {
    expect(
      transactionListEmptyMessage({
        monthCount: 2,
        periodLabel: 'Agosto 2026',
      })
    ).toBe('No hay transacciones que coincidan con los filtros.');
  });
});
