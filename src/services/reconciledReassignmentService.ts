import { NOMINA_REASSIGN_BLOCKED } from '../config/nominaDefaults';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import { ACCOUNT_NOT_IN_CHART, CLOSED_PERIOD_REASON } from '../types/batchApproval';
import { LIQUIDACION_REASSIGN_BLOCKED } from '../types/journalEntry';
import type {
  ReconciledReassignmentRequest,
  ReconciledReassignmentResult,
} from '../types/reconciledReassignment';
import {
  RECLASS_NOT_CONCILIADO,
  RECLASS_PERMISSION_REASON,
  RECLASS_REVIEW_REASON,
  RECLASS_SAME_ACCOUNT,
} from '../types/reconciledReassignment';
import { manualAccountFields } from './accountMappingService';
import * as journalBuilder from './journalEntryService';

const INVALID_DATE = 'Fecha inválida.';

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Reabre un conciliado con otra cuenta. No escribe y no modifica lo recibido.
 */
export function validateReconciledReassignment(
  request: ReconciledReassignmentRequest
): ReconciledReassignmentResult {
  if (request.is_nomina === true) return { ok: false, reason: NOMINA_REASSIGN_BLOCKED };
  if (String(request.cfdi_tipo_comprobante || '').toUpperCase() === 'P') {
    return { ok: false, reason: LIQUIDACION_REASSIGN_BLOCKED };
  }
  if (request.canManage !== true) return { ok: false, reason: RECLASS_PERMISSION_REASON };
  if (request.status !== 'conciliado') return { ok: false, reason: RECLASS_NOT_CONCILIADO };
  if (Number.isNaN(new Date(request.fecha).getTime())) {
    return { ok: false, reason: INVALID_DATE };
  }
  if (isTransactionDateInClosedPeriod(request.fecha, [...request.periodosCerrados])) {
    return { ok: false, reason: CLOSED_PERIOD_REASON };
  }

  const account = manualAccountFields(request.chart, request.new_account_code);
  if (!account) return { ok: false, reason: ACCOUNT_NOT_IN_CHART };
  const previous = typeof request.account_code === 'string' ? request.account_code.trim() : '';
  if (previous === account.account_code) return { ok: false, reason: RECLASS_SAME_ACCOUNT };

  const accrual = journalBuilder.buildAccrualJournalEntry(
    {
      id: request.transaction_id,
      tipo: request.tipo,
      monto: request.monto,
      fecha: request.fecha,
      fiscal_subtotal: finiteOrUndefined(request.fiscal_subtotal),
      fiscal_iva: finiteOrUndefined(request.fiscal_iva),
      account_code: account.account_code,
      metodo_pago_sat: request.metodo_pago_sat ?? undefined,
      concepto: request.concepto,
      proveedor: request.proveedor,
    },
    request.chart,
    request.atajoPueBancos === true
  );
  if (accrual.ok === false) return { ok: false, reason: accrual.reason };

  return {
    ok: true,
    patch: {
      status: 'revisión',
      account_code: account.account_code,
      account_name: account.account_name,
      account_source: 'manual',
      asiento_devengo: accrual.entry,
      policy_review_reason: RECLASS_REVIEW_REASON,
    },
  };
}
