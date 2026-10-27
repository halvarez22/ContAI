import { describe, expect, it, vi } from 'vitest';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import { LIQUIDACION_MONEDA_REASON, LIQUIDACION_RFC_REASON } from '../types/journalEntry';
import { liquidationPatchForTipoP, postLiquidacion } from './accrualPostingService';
import type { PagoExtracted } from '../lib/cfdiPagosParser';

const chart = getChartOfAccountsSeed();

const pago = (monedaP: string): PagoExtracted => ({
  fechaPago: '2026-03-01T12:00:00',
  formaDePagoP: '03',
  monedaP,
  monto: 250,
  documentos: [],
});

describe('postLiquidacion', () => {
  it('deja la transacción conciliada cuando el asiento cuadra', async () => {
    const clientes = chart.find((account) => account.name === 'Clientes');
    const posted = await postLiquidacion({
      organizationId: 'org1',
      chart,
      draft: {
        id: 'tx1',
        monto_total: 250,
        tipo_operacion: 'cobro',
        account_code: clientes?.code ?? '',
        fecha: '2026-03-01',
        moneda: 'MXN',
      },
    });
    expect(posted.status).toBe('conciliado');
    expect(posted.policy_review_reason).toBeNull();
    expect(posted.asiento_liquidacion?.lines).toHaveLength(2);
  });

  it('manda a revisión si la moneda no es MXN', async () => {
    const patch = await liquidationPatchForTipoP({
      organizationId: 'org1',
      documentId: 'tx1',
      fecha: '2026-03-01',
      organizationRfc: 'AAA010101AAA',
      emisorRfc: 'AAA010101AAA',
      receptorRfc: 'BBB010101BBB',
      pagos: [pago('USD')],
      chart,
    });
    expect(patch.status).toBe('revisión');
    expect(patch.policy_review_reason).toBe(LIQUIDACION_MONEDA_REASON);
    expect(patch.asiento_liquidacion).toBeUndefined();
  });

  it('manda a revisión si el RFC no distingue cobro o pago', async () => {
    const patch = await liquidationPatchForTipoP({
      organizationId: 'org1',
      documentId: 'tx1',
      fecha: '2026-03-01',
      organizationRfc: 'CCC010101CCC',
      emisorRfc: 'AAA010101AAA',
      receptorRfc: 'BBB010101BBB',
      pagos: [pago('MXN')],
      chart,
    });
    expect(patch.status).toBe('revisión');
    expect(patch.policy_review_reason).toBe(LIQUIDACION_RFC_REASON);
  });

  it('manda a revisión si la cuenta de bancos no está activa', async () => {
    const inactive = chart.map((account) =>
      account.name === 'Bancos' ? { ...account, activa: false } : account
    );
    const patch = await liquidationPatchForTipoP({
      organizationId: 'org1',
      documentId: 'tx1',
      fecha: '2026-03-01',
      organizationRfc: 'AAA010101AAA',
      emisorRfc: 'AAA010101AAA',
      receptorRfc: 'BBB010101BBB',
      pagos: [pago('MXN')],
      chart: inactive,
    });
    expect(patch.status).toBe('revisión');
    expect(patch.policy_review_reason).toBe('La cuenta Bancos no está activa en el catálogo.');
  });
});
