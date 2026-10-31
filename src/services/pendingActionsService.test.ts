import { describe, expect, it } from 'vitest';
import type { PendingActionSource } from '../types/pendingActions';
import { aggregatePendingActions } from './pendingActionsService';

function source(
  partial: Partial<PendingActionSource> & Pick<PendingActionSource, 'id'>
): PendingActionSource {
  return {
    fecha: '2026-01-15T12:00:00.000Z',
    concepto: 'Servicio de enero',
    monto: 1160,
    status: 'pendiente',
    account_code: '601.84',
    bank_reconciled: true,
    bank_reconcile_status: 'full',
    policy_review_reason: null,
    ...partial,
  };
}

describe('aggregatePendingActions', () => {
  it('deja en revisión el movimiento que también carece de cuenta y de banco', () => {
    const input = [
      source({
        id: 'multi',
        status: 'revisión',
        account_code: '',
        bank_reconciled: false,
        bank_reconcile_status: 'none',
      }),
    ];

    const report = aggregatePendingActions(input, 2026, 0);

    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.category).toBe('in_review');
    expect(report.summary.in_review).toBe(1);
    expect(report.summary.missing_account).toBe(0);
    expect(report.summary.pending_reconciliation).toBe(0);
    expect(report.summary.total).toBe(1);
  });

  it('no modifica el arreglo ni el movimiento recibido', () => {
    const row = source({
      id: 'frozen',
      status: 'revisión',
      account_code: '   ',
      bank_reconciled: false,
      bank_reconcile_status: 'none',
      policy_review_reason: '  Falta el IVA  ',
    });
    const input = [row];
    const before = structuredClone(input);
    Object.freeze(row);
    Object.freeze(input);

    const report = aggregatePendingActions(input, 2026, 0);

    expect(input).toEqual(before);
    expect(input[0]).toBe(row);
    expect(report.items[0]?.reason).toBe('Falta el IVA');
  });

  it('usa el motivo guardado y, si no hay, el genérico', () => {
    const report = aggregatePendingActions(
      [
        source({
          id: 'saved',
          status: 'revisión',
          policy_review_reason: 'Falta clasificación de cuenta válida',
        }),
        source({
          id: 'blank',
          status: 'revisión',
          policy_review_reason: '   ',
        }),
        source({
          id: 'missing',
          status: 'revisión',
          policy_review_reason: null,
        }),
      ],
      2026,
      0
    );

    expect(report.items.map((item) => item.reason)).toEqual([
      'Falta clasificación de cuenta válida',
      'En revisión',
      'En revisión',
    ]);
  });

  it('devuelve contadores en cero cuando no hay pendientes', () => {
    const empty = aggregatePendingActions([], 2026, 0);
    expect(empty.items).toEqual([]);
    expect(empty.summary).toEqual({
      in_review: 0,
      missing_account: 0,
      pending_reconciliation: 0,
      total: 0,
    });

    const settled = aggregatePendingActions(
      [source({ id: 'ok', status: 'conciliado' })],
      2026,
      0
    );
    expect(settled.items).toEqual([]);
    expect(settled.summary.total).toBe(0);
  });

  it('ignora un movimiento de otro mes y al rechazado', () => {
    const report = aggregatePendingActions(
      [
        source({
          id: 'febrero',
          fecha: '2026-02-15T12:00:00.000Z',
          status: 'revisión',
          account_code: '',
          bank_reconciled: false,
        }),
        source({
          id: 'rechazado',
          status: 'rechazado',
          account_code: '',
          bank_reconciled: false,
        }),
        source({
          id: 'sin-cuenta',
          status: 'pendiente',
          account_code: '  ',
          bank_reconciled: false,
          bank_reconcile_status: 'none',
        }),
        source({
          id: 'banco',
          status: 'conciliado',
          account_code: '401.01',
          bank_reconciled: false,
          bank_reconcile_status: 'partial',
        }),
        source({
          id: 'completo',
          status: 'conciliado',
          account_code: '401.01',
          bank_reconciled: false,
          bank_reconcile_status: 'full',
        }),
      ],
      2026,
      0
    );

    expect(report.items.map((item) => item.id)).toEqual(['sin-cuenta', 'banco']);
    expect(report.items.map((item) => item.category)).toEqual([
      'missing_account',
      'pending_reconciliation',
    ]);
    expect(report.summary).toEqual({
      in_review: 0,
      missing_account: 1,
      pending_reconciliation: 1,
      total: 2,
    });
  });
});
