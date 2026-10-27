import { describe, expect, it } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import { NOMINA_REASSIGN_BLOCKED } from '../config/nominaDefaults';
import { LIQUIDACION_REASSIGN_BLOCKED } from '../types/journalEntry';
import { CLOSED_PERIOD_REASON } from '../types/batchApproval';
import type { BatchApprovalTransaction } from '../types/batchApproval';
import {
  canReclassify,
  planAccountReassignment,
  planBatchApproval,
} from './batchApprovalService';

const chart = getChartOfAccountsSeed();

function review(id: string, fecha: string, extra: Partial<BatchApprovalTransaction> = {}): BatchApprovalTransaction {
  return {
    id,
    fecha,
    status: 'revisión',
    tipo: 'egreso',
    monto: 1080,
    fiscal_subtotal: 1000,
    fiscal_iva: 80,
    concepto: 'Servicio',
    proveedor: 'Taller',
    metodo_pago_sat: 'PPD',
    ...extra,
  };
}

describe('planBatchApproval', () => {
  it('devuelve ceros cuando no hay selección', () => {
    const plan = planBatchApproval({
      action: 'approve',
      ids: [],
      transactions: [],
      periodosCerrados: [],
    });
    expect(plan.patches).toEqual([]);
    expect(plan.result).toEqual({ successCount: 0, failedCount: 0, errors: [] });
  });

  it('aprueba solo la fila en revisión', () => {
    const plan = planBatchApproval({
      action: 'approve',
      ids: ['ok', 'done'],
      transactions: [
        review('ok', '2026-03-10T12:00:00.000Z'),
        review('done', '2026-03-11T12:00:00.000Z', { status: 'conciliado' }),
      ],
      periodosCerrados: [],
      actorLabel: 'contador@despacho.test',
    });
    expect(plan.result.successCount).toBe(1);
    expect(plan.result.failedCount).toBe(1);
    expect(plan.result.errors[0]).toEqual({ id: 'done', reason: 'No está en revisión' });
    expect(plan.patches[0]).toMatchObject({
      id: 'ok',
      status: 'conciliado',
      aprobado_por: 'contador@despacho.test',
    });
  });

  it('rechaza el lote si falta el motivo', () => {
    const plan = planBatchApproval({
      action: 'reject',
      ids: ['ok'],
      transactions: [review('ok', '2026-03-10T12:00:00.000Z')],
      periodosCerrados: [],
      reason: '   ',
    });
    expect(plan.patches).toEqual([]);
    expect(plan.result.errors[0]?.reason).toBe('Escribe un motivo de rechazo.');
  });

  it('deja en errores la fila de un periodo cerrado y aprueba la otra', () => {
    const plan = planBatchApproval({
      action: 'approve',
      ids: ['ene', 'feb'],
      transactions: [
        review('ene', '2026-01-15T12:00:00.000Z'),
        review('feb', '2026-02-15T12:00:00.000Z'),
      ],
      periodosCerrados: ['2026-01'],
      actorLabel: 'contador@despacho.test',
    });
    expect(plan.result.successCount).toBe(1);
    expect(plan.result.failedCount).toBe(1);
    expect(plan.result.errors).toEqual([{ id: 'ene', reason: CLOSED_PERIOD_REASON }]);
    expect(plan.patches.map((patch) => patch.id)).toEqual(['feb']);
    expect(plan.patches[0]?.status).toBe('conciliado');
  });
});

describe('planAccountReassignment', () => {
  it('reconstruye el asiento con la cuenta elegida y no cambia el estado', () => {
    const planned = planAccountReassignment({
      transaction: review('t1', '2026-03-10T12:00:00.000Z'),
      chart,
      accountCode: '601.49',
      atajoPueBancos: false,
      periodosCerrados: [],
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.patch.account_code).toBe('601.49');
    expect(planned.patch.account_source).toBe('manual');
    expect(planned.patch.asiento_devengo.lines.some((line) => line.account_code === '601.49')).toBe(true);
    expect('status' in planned.patch).toBe(false);
  });

  it('rechaza una cuenta inactiva', () => {
    const inactive = chart.map((account) =>
      account.code === '601.49' ? { ...account, activa: false } : account
    );
    const planned = planAccountReassignment({
      transaction: review('t1', '2026-03-10T12:00:00.000Z'),
      chart: inactive,
      accountCode: '601.49',
      atajoPueBancos: false,
      periodosCerrados: [],
    });
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toBe('La cuenta no está en el catálogo activo.');
  });

  it('no reconstruye la nómina', () => {
    const planned = planAccountReassignment({
      transaction: review('nom', '2026-03-10T12:00:00.000Z', { is_nomina: true }),
      chart,
      accountCode: '601.01',
      atajoPueBancos: false,
      periodosCerrados: [],
    });
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(NOMINA_REASSIGN_BLOCKED).toBe(
      'La clasificación de nómina es automática y no puede modificarse manualmente'
    );
    expect(planned.reason).toBe(
      'La clasificación de nómina es automática y no puede modificarse manualmente'
    );
  });

  it('no reclasifica un complemento de pago', () => {
    const planned = planAccountReassignment({
      transaction: review('pago', '2026-03-10T12:00:00.000Z', { cfdi_tipo_comprobante: 'P' }),
      chart,
      accountCode: '601.84',
      atajoPueBancos: false,
      periodosCerrados: [],
    });
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(LIQUIDACION_REASSIGN_BLOCKED).toBe(
      'La liquidación del complemento de pago no puede reclasificarse a una cuenta de resultados'
    );
    expect(planned.reason).toBe(
      'La liquidación del complemento de pago no puede reclasificarse a una cuenta de resultados'
    );
  });

  it('no cambia la cuenta de un periodo cerrado', () => {
    const planned = planAccountReassignment({
      transaction: review('t1', '2026-03-10T12:00:00.000Z'),
      chart,
      accountCode: '601.49',
      atajoPueBancos: false,
      periodosCerrados: ['2026-03'],
    });
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.reason).toBe(CLOSED_PERIOD_REASON);
  });
});

describe('canReclassify', () => {
  it('bloquea la reclasificación de un movimiento conciliado', () => {
    expect(canReclassify('conciliado')).toBe(false);
    expect(canReclassify('revisión')).toBe(true);
  });
});
