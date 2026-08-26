/**
 * Orquestación UI de aplicación manual de pagos (E9.2 F4).
 * Draft en memoria → confirmPaymentApplications (F3). Sin JSX.
 */

import { useCallback, useMemo, useState } from 'react';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import {
  PAYMENT_APP_MAX_TARGETS,
  assertApplicationWithinSaldo,
  assertValidPaymentApplications,
  roundMoney,
  sumPaymentAmounts,
  type PaymentApplicationDraft,
  type PaymentApplicationSourceType,
} from '../types/paymentApplication';
import {
  confirmPaymentApplications,
  type ConfirmPaymentApplicationsInput,
  type ConfirmPaymentApplicationsResult,
} from '../services/paymentApplicationService';

export type PaymentLedgerItem = {
  id: string;
  fecha: string;
  concepto?: string | null;
  proveedor?: string | null;
  monto: number;
  organization_id?: string;
  cfdi_uuid?: string | null;
  cfdi_tipo_comprobante?: string | null;
  monto_original?: number | null;
  saldo_pendiente?: number | null;
  applied_payment_amount?: number | null;
  payment_status?: string | null;
};

export type PaymentTargetCandidate = {
  id: string;
  concepto: string;
  fecha: string;
  monto: number;
  saldoPendiente: number;
  montoOriginal: number;
  appliedPaymentAmount: number;
  closedPeriod: boolean;
};

export type PaymentFeedback = {
  variant: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

export type PaymentSourceSelection =
  | {
      mode: 'cfdi_pago';
      transactionId: string;
      sourceId: string;
      sourceAmount: number;
      label: string;
    }
  | {
      mode: 'manual';
      sourceId: string;
      sourceAmount: number;
      label: string;
    };

export type ConfirmPaymentFn = (
  input: ConfirmPaymentApplicationsInput
) => Promise<ConfirmPaymentApplicationsResult>;

export type UsePaymentApplicationsParams = {
  organizationId: string;
  userId: string;
  periodosCerrados: readonly string[];
  ledger: readonly PaymentLedgerItem[];
  confirmPayment?: ConfirmPaymentFn;
  onConfirmed?: () => void;
};

export function sanitizeLegAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return roundMoney(Math.max(0, n));
}

export function deriveSaldoPendiente(item: PaymentLedgerItem): number {
  if (item.saldo_pendiente != null && Number.isFinite(Number(item.saldo_pendiente))) {
    return roundMoney(Number(item.saldo_pendiente));
  }
  if (item.payment_status === 'full') return 0;
  const original =
    item.monto_original != null && Number.isFinite(Number(item.monto_original))
      ? Number(item.monto_original)
      : Number(item.monto) || 0;
  const applied =
    item.applied_payment_amount != null
      ? Number(item.applied_payment_amount)
      : 0;
  return roundMoney(Math.max(0, original - applied));
}

export function toPaymentLedgerItems(
  rows: ReadonlyArray<Record<string, unknown>>
): PaymentLedgerItem[] {
  return rows.map((row) => {
    const fechaRaw = row.fecha;
    const fecha =
      typeof fechaRaw === 'string'
        ? fechaRaw
        : fechaRaw instanceof Date
          ? fechaRaw.toISOString()
          : String(fechaRaw ?? '');
    return {
      id: String(row.id ?? ''),
      fecha,
      concepto: (row.concepto as string | null | undefined) ?? null,
      proveedor: (row.proveedor as string | null | undefined) ?? null,
      monto: Number(row.monto) || 0,
      organization_id:
        typeof row.organization_id === 'string' ? row.organization_id : undefined,
      cfdi_uuid: (row.cfdi_uuid as string | null | undefined) ?? null,
      cfdi_tipo_comprobante:
        (row.cfdi_tipo_comprobante as string | null | undefined) ?? null,
      monto_original:
        row.monto_original != null ? Number(row.monto_original) : null,
      saldo_pendiente:
        row.saldo_pendiente != null ? Number(row.saldo_pendiente) : null,
      applied_payment_amount:
        row.applied_payment_amount != null
          ? Number(row.applied_payment_amount)
          : null,
      payment_status:
        (row.payment_status as string | null | undefined) ?? null,
    };
  });
}

export function listPaymentSources(
  ledger: readonly PaymentLedgerItem[]
): PaymentLedgerItem[] {
  return ledger.filter(
    (item) =>
      String(item.cfdi_tipo_comprobante || '').toUpperCase() === 'P' &&
      Boolean(item.id)
  );
}

export function buildPaymentCandidates(params: {
  ledger: readonly PaymentLedgerItem[];
  periodosCerrados: readonly string[];
  query: string;
  excludeIds?: ReadonlySet<string>;
}): PaymentTargetCandidate[] {
  const q = params.query.trim().toLowerCase();
  const out: PaymentTargetCandidate[] = [];

  for (const item of params.ledger) {
    if (!item.id) continue;
    if (params.excludeIds?.has(item.id)) continue;
    if (String(item.cfdi_tipo_comprobante || '').toUpperCase() === 'P') continue;

    const saldoPendiente = deriveSaldoPendiente(item);
    if (saldoPendiente <= 0.005) continue;

    const montoOriginal = roundMoney(
      item.monto_original != null && Number.isFinite(Number(item.monto_original))
        ? Number(item.monto_original)
        : Number(item.monto) || 0
    );
    const appliedPaymentAmount = roundMoney(
      item.applied_payment_amount != null
        ? Number(item.applied_payment_amount)
        : 0
    );
    const concepto = String(item.concepto || item.proveedor || item.id);
    if (q) {
      const hay = `${concepto} ${item.fecha} ${item.monto}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    out.push({
      id: item.id,
      concepto,
      fecha: item.fecha,
      monto: roundMoney(Number(item.monto) || 0),
      saldoPendiente,
      montoOriginal,
      appliedPaymentAmount,
      closedPeriod: isTransactionDateInClosedPeriod(item.fecha, [
        ...params.periodosCerrados,
      ]),
    });
  }

  return out;
}

export function mapConfirmResultToFeedback(
  result: ConfirmPaymentApplicationsResult
): PaymentFeedback {
  if (result.status === 'confirmed') {
    return {
      variant: 'success',
      message: `Aplicación confirmada (${result.applicationCount} factura${result.applicationCount === 1 ? '' : 's'}).`,
    };
  }
  if (result.status === 'already_processed') {
    return {
      variant: 'info',
      message: 'Este comprobante ya fue procesado previamente.',
    };
  }
  if (result.status === 'closed_period') {
    return {
      variant: 'error',
      message:
        'No se puede aplicar: la factura destino pertenece a un periodo cerrado.',
    };
  }
  return {
    variant: 'error',
    message: 'Error de validación: revisa los montos asignados.',
  };
}

export function computeCanConfirm(params: {
  sourceAmount: number;
  draftLegs: ReadonlyMap<string, number>;
  candidatesById: ReadonlyMap<string, PaymentTargetCandidate>;
  confirming: boolean;
}): boolean {
  if (params.confirming) return false;
  if (params.draftLegs.size === 0) return false;
  if (params.draftLegs.size > PAYMENT_APP_MAX_TARGETS) return false;

  const applications: PaymentApplicationDraft[] = [];
  for (const [txId, amount] of params.draftLegs) {
    const candidate = params.candidatesById.get(txId);
    if (!candidate) return false;
    if (candidate.closedPeriod) return false;
    const sanitized = sanitizeLegAmount(amount);
    if (!(sanitized > 0)) return false;
    const saldoCheck = assertApplicationWithinSaldo({
      targetTransactionId: txId,
      amount: sanitized,
      saldoPendiente: candidate.saldoPendiente,
    });
    if (saldoCheck.ok === false) return false;
    applications.push({ targetTransactionId: txId, amount: sanitized });
  }

  const sumCheck = assertValidPaymentApplications({
    sourceAmount: params.sourceAmount,
    applications,
  });
  return sumCheck.ok === true;
}

export function usePaymentApplications({
  organizationId,
  userId,
  periodosCerrados,
  ledger,
  confirmPayment = confirmPaymentApplications,
  onConfirmed,
}: UsePaymentApplicationsParams) {
  const [source, setSource] = useState<PaymentSourceSelection | null>(null);
  const [draftLegs, setDraftLegs] = useState<Map<string, number>>(
    () => new Map()
  );
  const [candidateQuery, setCandidateQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<PaymentFeedback | null>(null);
  const [manualAmountInput, setManualAmountInput] = useState('');

  const paymentSources = useMemo(() => listPaymentSources(ledger), [ledger]);

  const excludeIds = useMemo(() => {
    const set = new Set<string>();
    if (source?.mode === 'cfdi_pago') set.add(source.transactionId);
    return set;
  }, [source]);

  const candidates = useMemo(
    () =>
      buildPaymentCandidates({
        ledger,
        periodosCerrados,
        query: candidateQuery,
        excludeIds,
      }),
    [ledger, periodosCerrados, candidateQuery, excludeIds]
  );

  const candidatesById = useMemo(() => {
    const map = new Map<string, PaymentTargetCandidate>();
    for (const c of candidates) map.set(c.id, c);
    return map;
  }, [candidates]);

  const draftAssigned = useMemo(() => {
    const apps: PaymentApplicationDraft[] = [...draftLegs.entries()].map(
      ([targetTransactionId, amount]) => ({
        targetTransactionId,
        amount: sanitizeLegAmount(amount),
      })
    );
    return sumPaymentAmounts(apps);
  }, [draftLegs]);

  const sourceAmount = source?.sourceAmount ?? 0;

  const canConfirm = useMemo(
    () =>
      computeCanConfirm({
        sourceAmount,
        draftLegs,
        candidatesById,
        confirming,
      }),
    [sourceAmount, draftLegs, candidatesById, confirming]
  );

  const selectCfdiPagoSource = useCallback((item: PaymentLedgerItem) => {
    const sourceId = String(item.cfdi_uuid || item.id).trim();
    setSource({
      mode: 'cfdi_pago',
      transactionId: item.id,
      sourceId,
      sourceAmount: roundMoney(Number(item.monto) || 0),
      label: `${item.concepto || 'CFDI P'} · ${sourceId}`,
    });
    setDraftLegs(new Map());
    setFeedback(null);
    setCandidateQuery('');
  }, []);

  const beginManualSource = useCallback(() => {
    const amount = sanitizeLegAmount(manualAmountInput);
    if (!(amount > 0)) {
      setFeedback({
        variant: 'error',
        message: 'Error de validación: revisa los montos asignados.',
      });
      return;
    }
    const sourceId = `manual_${Date.now()}`;
    setSource({
      mode: 'manual',
      sourceId,
      sourceAmount: amount,
      label: `Pago manual · ${amount}`,
    });
    setDraftLegs(new Map());
    setFeedback(null);
    setCandidateQuery('');
  }, [manualAmountInput]);

  const clearSource = useCallback(() => {
    setSource(null);
    setDraftLegs(new Map());
    setFeedback(null);
    setCandidateQuery('');
  }, []);

  const toggleDraftLeg = useCallback(
    (txId: string, saldoPendiente: number, srcAmount: number) => {
      const candidate = candidatesById.get(txId);
      if (candidate?.closedPeriod) return;

      setDraftLegs((prev) => {
        const next = new Map(prev);
        if (next.has(txId)) {
          next.delete(txId);
          return next;
        }
        if (next.size >= PAYMENT_APP_MAX_TARGETS) return prev;
        const assigned = sumPaymentAmounts(
          [...next.entries()].map(([targetTransactionId, amount]) => ({
            targetTransactionId,
            amount: sanitizeLegAmount(amount),
          }))
        );
        const need = roundMoney(srcAmount - assigned);
        const take = roundMoney(
          Math.min(saldoPendiente, Math.max(0, need))
        );
        if (take > 0) next.set(txId, take);
        return next;
      });
    },
    [candidatesById]
  );

  const setDraftLegAmount = useCallback(
    (txId: string, amount: number) => {
      const candidate = candidatesById.get(txId);
      if (candidate?.closedPeriod) return;
      const sanitized = sanitizeLegAmount(amount);
      setDraftLegs((prev) => {
        const next = new Map(prev);
        if (sanitized <= 0) next.delete(txId);
        else next.set(txId, sanitized);
        return next;
      });
    },
    [candidatesById]
  );

  const handleConfirm = useCallback(async () => {
    if (!source || !canConfirm || confirming) return;
    if (!organizationId || !userId) {
      setFeedback({
        variant: 'error',
        message: 'Error de validación: revisa los montos asignados.',
      });
      return;
    }

    setConfirming(true);
    setFeedback(null);

    try {
      const applications: PaymentApplicationDraft[] = [
        ...draftLegs.entries(),
      ].map(([targetTransactionId, amount]) => ({
        targetTransactionId,
        amount: sanitizeLegAmount(amount),
      }));

      const targets = applications.map((app) => {
        const c = candidatesById.get(app.targetTransactionId)!;
        return {
          transactionId: c.id,
          organizationId,
          montoOriginal: c.montoOriginal,
          saldoPendiente: c.saldoPendiente,
          appliedPaymentAmount: c.appliedPaymentAmount,
          fecha: c.fecha,
        };
      });

      const input: ConfirmPaymentApplicationsInput = {
        organizationId,
        userId,
        sourceType: source.mode as PaymentApplicationSourceType,
        sourceId: source.sourceId,
        sourceAmount: source.sourceAmount,
        applications,
        targets,
        periodosCerrados,
        ...(source.mode === 'cfdi_pago'
          ? { paymentTransactionId: source.transactionId }
          : {}),
      };

      const result = await confirmPayment(input);
      const mapped = mapConfirmResultToFeedback(result);
      setFeedback(mapped);
      if (result.status === 'confirmed') {
        setDraftLegs(new Map());
        onConfirmed?.();
      }
    } catch {
      setFeedback({
        variant: 'error',
        message: 'Error de validación: revisa los montos asignados.',
      });
    } finally {
      setConfirming(false);
    }
  }, [
    source,
    canConfirm,
    confirming,
    organizationId,
    userId,
    draftLegs,
    candidatesById,
    periodosCerrados,
    confirmPayment,
    onConfirmed,
  ]);

  return {
    paymentSources,
    source,
    selectCfdiPagoSource,
    beginManualSource,
    clearSource,
    manualAmountInput,
    setManualAmountInput,
    candidates,
    candidateQuery,
    setCandidateQuery,
    draftLegs,
    draftAssigned,
    toggleDraftLeg,
    setDraftLegAmount,
    canConfirm,
    confirming,
    feedback,
    handleConfirm,
  };
}
