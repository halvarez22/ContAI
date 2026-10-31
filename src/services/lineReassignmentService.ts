import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import { NOMINA_REASSIGN_BLOCKED } from '../config/nominaDefaults';
import {
  ACCOUNT_NOT_IN_CHART,
  CLOSED_PERIOD_REASON,
  NOT_IN_REVIEW_REASON,
} from '../types/batchApproval';
import { LIQUIDACION_REASSIGN_BLOCKED } from '../types/journalEntry';
import type { JournalEntry, JournalLine } from '../types/journalEntry';
import type {
  LineAccountChangeRequest,
  LineAccountChangeResult,
} from '../types/lineReassignment';
import { LINE_IDENTITY_REASON, LINE_INDEX_INVALID, LINE_UNBALANCED_REASON } from '../types/lineReassignment';
import { manualAccountFields } from './accountMappingService';
import { journalEntryBalances } from './journalEntryService';

const INVALID_DATE = 'Fecha inválida.';

function lineIndexIsValid(lineIndex: number, length: number): boolean {
  return lineIndex >= 0 && lineIndex < length;
}

function sameIdentity(before: JournalLine, after: JournalLine): boolean {
  return before.monto === after.monto && before.tipo === after.tipo && before.concepto === after.concepto;
}

/**
 * Cambia la cuenta de una línea sin tocar el asiento recibido.
 * No escribe y no llama a Firebase.
 */
export function validateLineAccountChange(request: LineAccountChangeRequest): LineAccountChangeResult {
  if (request.is_nomina === true) return { ok: false, reason: NOMINA_REASSIGN_BLOCKED };
  if (String(request.cfdi_tipo_comprobante || '').toUpperCase() === 'P') {
    return { ok: false, reason: LIQUIDACION_REASSIGN_BLOCKED };
  }
  if (request.status !== 'revisión') return { ok: false, reason: NOT_IN_REVIEW_REASON };
  if (Number.isNaN(new Date(request.fecha).getTime())) {
    return { ok: false, reason: INVALID_DATE };
  }
  if (isTransactionDateInClosedPeriod(request.fecha, [...request.periodosCerrados])) {
    return { ok: false, reason: CLOSED_PERIOD_REASON };
  }

  const original = request.current_entry;
  const lineIndex = request.line_index;
  if (!Number.isInteger(lineIndex) || !lineIndexIsValid(lineIndex, original.lines.length)) {
    return { ok: false, reason: LINE_INDEX_INVALID };
  }

  const account = manualAccountFields(request.chart, request.new_account_code);
  if (!account) return { ok: false, reason: ACCOUNT_NOT_IN_CHART };

  const lines = original.lines.map((line, index) => {
    if (index !== lineIndex) return { ...line };
    return {
      ...line,
      account_code: account.account_code,
      account_name: account.account_name,
    };
  });
  const entry: JournalEntry = {
    transaction_id: original.transaction_id,
    tipo: original.tipo,
    fecha: original.fecha,
    atajo_pue_bancos: original.atajo_pue_bancos,
    lines,
  };

  for (let index = 0; index < original.lines.length; index += 1) {
    const before = original.lines[index];
    const after = entry.lines[index];
    if (!before || !after || !sameIdentity(before, after)) {
      return { ok: false, reason: LINE_IDENTITY_REASON };
    }
  }

  if (!journalEntryBalances(entry)) return { ok: false, reason: LINE_UNBALANCED_REASON };
  return { ok: true, entry };
}
