/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  buildPaymentCandidates,
  computeCanConfirm,
  mapConfirmResultToFeedback,
  sanitizeLegAmount,
  usePaymentApplications,
  type PaymentLedgerItem,
} from './usePaymentApplications';

const ORG = 'org_main';
const USER = 'user_1';

function sampleLedger(): PaymentLedgerItem[] {
  return [
    {
      id: 'pay1',
      fecha: '2026-01-20T12:00:00.000Z',
      concepto: 'Pago CFDI P',
      monto: 1000,
      cfdi_uuid: 'pago-uuid-1',
      cfdi_tipo_comprobante: 'P',
    },
    {
      id: 'tx1',
      fecha: '2026-01-10T12:00:00.000Z',
      concepto: 'Factura abierta',
      monto: 600,
      monto_original: 600,
      saldo_pendiente: 600,
      applied_payment_amount: 0,
      payment_status: 'none',
      cfdi_tipo_comprobante: 'I',
    },
    {
      id: 'tx2',
      fecha: '2026-01-11T12:00:00.000Z',
      concepto: 'Factura parcial',
      monto: 500,
      monto_original: 500,
      saldo_pendiente: 500,
      applied_payment_amount: 0,
      payment_status: 'none',
      cfdi_tipo_comprobante: 'I',
    },
    {
      id: 'tx-closed',
      fecha: '2025-12-15T12:00:00.000Z',
      concepto: 'Factura cerrada',
      monto: 200,
      monto_original: 200,
      saldo_pendiente: 200,
      applied_payment_amount: 0,
      payment_status: 'none',
      cfdi_tipo_comprobante: 'I',
    },
  ];
}

describe('sanitizeLegAmount', () => {
  it('fuerza no-negativos y redondea a 2 decimales', () => {
    expect(sanitizeLegAmount(-5)).toBe(0);
    expect(sanitizeLegAmount('12.345')).toBe(12.35);
    expect(sanitizeLegAmount('abc')).toBe(0);
  });
});

describe('buildPaymentCandidates / computeCanConfirm', () => {
  it('marca periodo cerrado y computeCanConfirm rechaza Σ inválida', () => {
    const candidates = buildPaymentCandidates({
      ledger: sampleLedger(),
      periodosCerrados: ['2025-12'],
      query: '',
    });
    const closed = candidates.find((c) => c.id === 'tx-closed');
    expect(closed?.closedPeriod).toBe(true);

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const draft = new Map<string, number>([['tx1', 500]]);
    expect(
      computeCanConfirm({
        sourceAmount: 1000,
        draftLegs: draft,
        candidatesById: byId,
        confirming: false,
      })
    ).toBe(false);
  });

  it('canConfirm true cuando suma cuadra y sin overflow', () => {
    const candidates = buildPaymentCandidates({
      ledger: sampleLedger(),
      periodosCerrados: ['2025-12'],
      query: '',
    });
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const draft = new Map<string, number>([
      ['tx1', 600],
      ['tx2', 400],
    ]);
    expect(
      computeCanConfirm({
        sourceAmount: 1000,
        draftLegs: draft,
        candidatesById: byId,
        confirming: false,
      })
    ).toBe(true);
  });
});

describe('mapConfirmResultToFeedback', () => {
  it('mapea estados discriminados a mensajes UI', () => {
    expect(mapConfirmResultToFeedback({ status: 'already_processed' })).toEqual({
      variant: 'info',
      message: 'Este comprobante ya fue procesado previamente.',
    });
    expect(
      mapConfirmResultToFeedback({
        status: 'closed_period',
        error: 'x',
      }).variant
    ).toBe('error');
    expect(
      mapConfirmResultToFeedback({
        status: 'validation_error',
        error: 'x',
      }).message
    ).toMatch(/validación/i);
  });
});

describe('usePaymentApplications', () => {
  it('ignora toggle de factura en periodo cerrado y confirma vía F3', async () => {
    const confirmPayment = vi.fn(async () => ({
      status: 'confirmed' as const,
      applicationCount: 2,
      applicationIds: ['a1', 'a2'],
    }));
    const { result } = renderHook(() =>
      usePaymentApplications({
        organizationId: ORG,
        userId: USER,
        periodosCerrados: ['2025-12'],
        ledger: sampleLedger(),
        confirmPayment,
      })
    );

    act(() => {
      result.current.selectCfdiPagoSource(sampleLedger()[0]!);
    });
    expect(result.current.source?.mode).toBe('cfdi_pago');

    act(() => {
      result.current.toggleDraftLeg('tx-closed', 200, 1000);
    });
    expect(result.current.draftLegs.has('tx-closed')).toBe(false);

    act(() => {
      result.current.toggleDraftLeg('tx1', 600, 1000);
      result.current.toggleDraftLeg('tx2', 500, 1000);
    });
    act(() => {
      result.current.setDraftLegAmount('tx2', 400);
    });
    expect(result.current.canConfirm).toBe(true);

    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(confirmPayment).toHaveBeenCalledOnce();
    expect(result.current.feedback?.variant).toBe('success');
    expect(result.current.confirming).toBe(false);
  });

  it('muestra already_processed como Alert info', async () => {
    const confirmPayment = vi.fn(async () => ({
      status: 'already_processed' as const,
    }));
    const { result } = renderHook(() =>
      usePaymentApplications({
        organizationId: ORG,
        userId: USER,
        periodosCerrados: [],
        ledger: sampleLedger(),
        confirmPayment,
      })
    );
    act(() => {
      result.current.selectCfdiPagoSource(sampleLedger()[0]!);
      result.current.toggleDraftLeg('tx1', 600, 1000);
      result.current.setDraftLegAmount('tx1', 600);
      result.current.toggleDraftLeg('tx2', 500, 1000);
      result.current.setDraftLegAmount('tx2', 400);
    });
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(result.current.feedback).toEqual({
      variant: 'info',
      message: 'Este comprobante ya fue procesado previamente.',
    });
  });
});
