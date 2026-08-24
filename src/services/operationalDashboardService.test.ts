import { describe, it, expect } from 'vitest';
import { buildOperationalSnapshot } from './operationalDashboardService';
import type { OperationalTxInput } from '../types/operationalDashboard';

const baseTx = (over: Partial<OperationalTxInput> & { id: string }): OperationalTxInput => ({
  fecha: '2026-08-01',
  tipo: 'egreso',
  monto: 1000,
  status: 'conciliado',
  account_name: 'Gastos',
  proveedor: 'Proveedor',
  ...over,
});

describe('buildOperationalSnapshot', () => {
  it('prioriza revision sobre high_risk y pending', () => {
    const txs = [
      baseTx({ id: '1', status: 'revisión' }),
      baseTx({ id: '2', status: 'pendiente' }),
      baseTx({ id: '3', account_name: '' }),
      baseTx({ id: '4', status: 'conciliado' }),
    ];
    const snap = buildOperationalSnapshot({
      periodTransactions: txs,
      periodoLabel: 'Ago 2026',
      highRiskHints: [{ transactionId: '4', severity: 'high' }],
    });
    expect(snap.counts.revision).toBe(1);
    expect(snap.counts.pending).toBe(1);
    expect(snap.counts.unclassified).toBe(1);
    expect(snap.counts.highRisk).toBe(1);
    expect(snap.counts.totalTasks).toBe(4);
  });

  it('cap 15 en tasks pero contadores reflejan total', () => {
    const txs: OperationalTxInput[] = Array.from({ length: 20 }, (_, i) =>
      baseTx({ id: String(i), status: 'pendiente', proveedor: `P${i}` })
    );
    const snap = buildOperationalSnapshot({
      periodTransactions: txs,
      periodoLabel: 'Ago 2026',
      highRiskHints: [],
      maxTasks: 15,
    });
    expect(snap.counts.pending).toBe(20);
    expect(snap.counts.totalTasks).toBe(20);
    expect(snap.tasks).toHaveLength(15);
  });

  it('isEmpty sin TX o sin tareas', () => {
    const emptyPeriod = buildOperationalSnapshot({
      periodTransactions: [],
      periodoLabel: 'Ago 2026',
      highRiskHints: [],
    });
    expect(emptyPeriod.isEmpty).toBe(true);
    expect(emptyPeriod.hasTransactions).toBe(false);
    expect(emptyPeriod.alerts[0]?.title).toBe('Sin movimientos');

    const allDone = buildOperationalSnapshot({
      periodTransactions: [baseTx({ id: 'ok' })],
      periodoLabel: 'Ago 2026',
      highRiskHints: [],
    });
    expect(allDone.isEmpty).toBe(true);
    expect(allDone.alerts.some((a) => a.title === '¡Todo al día!')).toBe(true);
  });

  it('calcula pct bank_reconciled', () => {
    const snap = buildOperationalSnapshot({
      periodTransactions: [
        baseTx({ id: '1', bank_reconciled: true }),
        baseTx({ id: '2', bank_reconciled: false, status: 'pendiente' }),
      ],
      periodoLabel: 'Ago 2026',
      highRiskHints: [],
    });
    expect(snap.pctBankReconciled).toBe(50);
    expect(snap.counts.pending).toBe(1);
  });
});
