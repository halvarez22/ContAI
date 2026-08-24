import { describe, it, expect } from 'vitest';
import {
  buildExecutiveKpis,
  buildTrendSeries,
  buildExecutiveSnapshot,
} from './executiveDashboardService';
import type { ExecutiveTaxSlice, ExecutiveTxInput } from '../types/executiveDashboard';

const taxBase: ExecutiveTaxSlice = {
  periodoLabel: 'Agosto 2026',
  ivaSaldoNeto: 1600,
  isrEstimadoYtd: 5000,
  lineasSinDesglose: 0,
  disclaimer: 'Informativo',
  warnings: [],
};

describe('buildExecutiveKpis', () => {
  it('calcula flujo neto y % bank_reconciled', () => {
    const txs: ExecutiveTxInput[] = [
      { fecha: '2026-08-01', tipo: 'ingreso', monto: 10000, bank_reconciled: true },
      { fecha: '2026-08-02', tipo: 'egreso', monto: 3000, bank_reconciled: false },
      { fecha: '2026-08-03', tipo: 'egreso', monto: 2000, bank_reconciled: true },
    ];
    const kpis = buildExecutiveKpis(txs, taxBase);
    expect(kpis.flujoCajaNeto).toBe(5000);
    expect(kpis.txCount).toBe(3);
    expect(kpis.bankReconciledCount).toBe(2);
    expect(kpis.pctBankReconciled).toBeCloseTo(66.67, 1);
    expect(kpis.ivaSaldoNeto).toBe(1600);
    expect(kpis.isEmpty).toBe(false);
  });

  it('periodo vacío: ceros + warning', () => {
    const kpis = buildExecutiveKpis([], taxBase);
    expect(kpis.isEmpty).toBe(true);
    expect(kpis.flujoCajaNeto).toBe(0);
    expect(kpis.pctBankReconciled).toBe(0);
    expect(kpis.warnings.some((w) => w.includes('No hay datos'))).toBe(true);
  });
});

describe('buildTrendSeries', () => {
  it('agrega 6 meses en una pasada (incluye huecos en cero)', () => {
    const txs: ExecutiveTxInput[] = [
      { fecha: '2026-08-10', tipo: 'ingreso', monto: 100 },
      { fecha: '2026-06-05', tipo: 'egreso', monto: 40 },
      { fecha: '2025-01-01', tipo: 'ingreso', monto: 9999 }, // fuera de ventana
    ];
    const trend = buildTrendSeries(txs, 2026, 7, 6); // ago = monthIndex 7
    expect(trend).toHaveLength(6);
    expect(trend[5].mes).toBe('Ago 2026');
    expect(trend[5].ingresos).toBe(100);
    expect(trend[5].egresos).toBe(0);
    const jun = trend.find((t) => t.mes === 'Jun 2026');
    expect(jun?.egresos).toBe(40);
    expect(trend.every((t) => typeof t.ingresos === 'number')).toBe(true);
  });
});

describe('buildExecutiveSnapshot', () => {
  it('combina kpis + trend', () => {
    const snap = buildExecutiveSnapshot({
      allTransactions: [
        { fecha: '2026-08-01', tipo: 'ingreso', monto: 500, bank_reconciled: true },
      ],
      periodTransactions: [
        { fecha: '2026-08-01', tipo: 'ingreso', monto: 500, bank_reconciled: true },
      ],
      periodYear: 2026,
      periodMonth: 7,
      tax: taxBase,
    });
    expect(snap.kpis.ingresosPeriodo).toBe(500);
    expect(snap.trend).toHaveLength(6);
  });
});
