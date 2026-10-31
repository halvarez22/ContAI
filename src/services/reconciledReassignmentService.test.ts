import { describe, expect, it, vi } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import { NOMINA_REASSIGN_BLOCKED } from '../config/nominaDefaults';
import { LIQUIDACION_REASSIGN_BLOCKED } from '../types/journalEntry';
import type { ReconciledReassignmentRequest } from '../types/reconciledReassignment';
import { journalEntryBalances } from './journalEntryService';
import * as journalBuilder from './journalEntryService';
import { validateReconciledReassignment } from './reconciledReassignmentService';

function request(
  partial: Partial<ReconciledReassignmentRequest> = {}
): ReconciledReassignmentRequest {
  return {
    transaction_id: 'tx-1',
    fecha: '2026-01-15T12:00:00.000Z',
    status: 'conciliado',
    tipo: 'egreso',
    monto: 1160,
    fiscal_subtotal: 1000,
    fiscal_iva: 160,
    account_code: '601.84',
    new_account_code: '601.49',
    concepto: 'Servicio',
    proveedor: 'Proveedor',
    is_nomina: false,
    cfdi_tipo_comprobante: 'I',
    confidence_score: 0.95,
    canManage: true,
    atajoPueBancos: false,
    periodosCerrados: [],
    chart: getChartOfAccountsSeed(),
    ...partial,
  };
}

describe('validateReconciledReassignment', () => {
  it('no modifica lo recibido y no copia la confianza al parche', () => {
    const input = request();
    const before = structuredClone(input);
    const chartRef = input.chart;
    Object.freeze(input);
    Object.freeze(input.chart);
    for (const account of input.chart) Object.freeze(account);

    const result = validateReconciledReassignment(input);

    expect(result.ok).toBe(true);
    expect(input).toEqual(before);
    expect(input.chart).toBe(chartRef);
    expect(input.confidence_score).toBe(0.95);
    if (!result.ok) return;
    expect(result.patch).not.toHaveProperty('confidence_score');
    expect(result.patch).not.toHaveProperty('aprobado_por');
    expect(result.patch).not.toHaveProperty('aprobado_en');
    expect(result.patch.status).toBe('revisión');
    expect(journalEntryBalances(result.patch.asiento_devengo)).toBe(true);
  });

  it('rechaza al contador', () => {
    const result = validateReconciledReassignment(request({ canManage: false }));
    expect(result).toEqual({
      ok: false,
      reason: 'Solo el dueño o un administrador puede reclasificar un movimiento conciliado.',
    });
  });

  it('rechaza un periodo cerrado', () => {
    const result = validateReconciledReassignment(
      request({ periodosCerrados: ['2026-01'] })
    );
    expect(result).toEqual({ ok: false, reason: 'Periodo cerrado' });
  });

  it('bloquea la nómina y el tipo P sin llamar al generador', () => {
    const spy = vi.spyOn(journalBuilder, 'buildAccrualJournalEntry');
    const nomina = validateReconciledReassignment(request({ is_nomina: true }));
    const tipoP = validateReconciledReassignment(request({ cfdi_tipo_comprobante: 'P' }));

    expect(nomina).toEqual({ ok: false, reason: NOMINA_REASSIGN_BLOCKED });
    expect(tipoP).toEqual({ ok: false, reason: LIQUIDACION_REASSIGN_BLOCKED });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
