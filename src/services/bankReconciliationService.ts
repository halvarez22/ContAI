/**
 * Conciliación bancaria E5.1: parse CSV, heurística, conflictos, confirmación.
 * Sin React. Persistencia vía firestoreService (merge). Sin Groq.
 */

import {
  commitTransactionUpdatesBatch,
  serverTimestamp,
} from './firestoreService';
import { logAuditEntry } from './auditService';
import type {
  BankConfirmSummary,
  BankLedgerItem,
  BankMatchSuggestion,
  BankReconcileConfirm,
  ParsedBankRow,
} from '../types/bankReconciliation';
import {
  BANK_MATCH_AMOUNT_TOLERANCE_PCT,
  BANK_MATCH_DESC_MAX_LEN,
  BANK_MATCH_MAX_DAYS_DIFF,
} from '../types/bankReconciliation';

export function truncateBankMatchDesc(desc: string): string {
  const t = desc.trim();
  if (t.length <= BANK_MATCH_DESC_MAX_LEN) return t;
  return t.slice(0, BANK_MATCH_DESC_MAX_LEN);
}

/** Parse CSV simple: columnas fecha, monto, descripción (coma o punto y coma). */
export function parseBankCsv(text: string): { rows: ParsedBankRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const rows: ParsedBankRow[] = [];
  if (lines.length === 0) return { rows, errors: ['Archivo vacío'] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Preferir ; si está presente (evita romper montos con miles tipo $1,200.00)
    const delim = line.includes(';') ? ';' : ',';
    const parts = line.split(delim).map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) continue;

    const fechaStr = parts[0];
    const montoRaw = parts[1];
    const desc = parts.slice(2).join(delim === ';' ? ' ' : ' ') || parts[0];

    const monto = parseFloat(
      String(montoRaw)
        .replace(/[$\s]/g, '')
        .replace(/,(?=\d{3}(\D|$))/g, '') // miles 1,200
        .replace(',', '.') // decimal europeo 1200,50
    );
    if (Number.isNaN(monto)) {
      if (i === 0) continue;
      errors.push(`Línea ${i + 1}: monto no numérico`);
      continue;
    }

    let fechaIso = '';
    if (/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) {
      fechaIso = new Date(fechaStr).toISOString();
    } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(fechaStr)) {
      const segs = fechaStr.split(/[\/\-]/);
      if (segs.length === 3) {
        const d = parseInt(segs[0], 10);
        const mo = parseInt(segs[1], 10) - 1;
        const y = segs[2].length === 2 ? 2000 + parseInt(segs[2], 10) : parseInt(segs[2], 10);
        const dt = new Date(y, mo, d);
        if (!Number.isNaN(dt.getTime())) fechaIso = dt.toISOString();
      }
    } else {
      const tryDate = new Date(fechaStr);
      if (!Number.isNaN(tryDate.getTime())) fechaIso = tryDate.toISOString();
    }

    if (!fechaIso) {
      if (i === 0) continue;
      errors.push(`Línea ${i + 1}: fecha no reconocida`);
      continue;
    }

    rows.push({
      fecha: fechaIso,
      monto: Math.abs(monto),
      descripcion: desc,
    });
  }

  return { rows, errors };
}

function markConflicts(suggestions: BankMatchSuggestion[]): BankMatchSuggestion[] {
  const counts = new Map<string, number>();
  for (const s of suggestions) {
    if (!s.transactionId) continue;
    counts.set(s.transactionId, (counts.get(s.transactionId) ?? 0) + 1);
  }
  return suggestions.map((s) => {
    const isConflict = Boolean(
      s.transactionId && (counts.get(s.transactionId) ?? 0) > 1
    );
    return {
      ...s,
      isConflict,
      note: isConflict
        ? `${s.note} · CONFLICTO: varias filas bancarias → misma tx`
        : s.note,
    };
  });
}

/**
 * Heurística: monto ±amountTolerancePct, fecha ±maxDaysDiff.
 * Marca isConflict cuando dos+ filas bancarias apuntan a la misma tx.
 */
export function suggestBankMatches(
  bankRows: ParsedBankRow[],
  ledger: BankLedgerItem[],
  amountTolerancePct = BANK_MATCH_AMOUNT_TOLERANCE_PCT,
  maxDaysDiff = BANK_MATCH_MAX_DAYS_DIFF
): BankMatchSuggestion[] {
  const suggestions: BankMatchSuggestion[] = [];

  for (let i = 0; i < bankRows.length; i++) {
    const br = bankRows[i];
    const bankDate = new Date(br.fecha).getTime();
    let best: { id: string; score: number } | null = null;

    for (const tx of ledger) {
      if (!tx.id) continue;
      const m = Number(tx.monto) || 0;
      const txDate = new Date(tx.fecha).getTime();
      if (Number.isNaN(bankDate) || Number.isNaN(txDate)) continue;

      const dayDiff = Math.abs(bankDate - txDate) / (86400 * 1000);
      if (dayDiff > maxDaysDiff) continue;

      const pctDiff = m === 0 ? 100 : (Math.abs(m - br.monto) / m) * 100;
      if (pctDiff > amountTolerancePct) continue;

      const score = 100 - dayDiff * 8 - pctDiff * 3;
      if (!best || score > best.score) {
        best = { id: String(tx.id), score };
      }
    }

    suggestions.push({
      bankRowIndex: i,
      transactionId: best?.id ?? null,
      score: best?.score ?? 0,
      note: best
        ? `Posible coincidencia (${best.score.toFixed(0)} pts)`
        : 'Sin coincidencia en libro',
      isConflict: false,
    });
  }

  return markConflicts(suggestions);
}

/** Confirms elegibles: tienen tx, no conflicto. */
export function buildConfirmableMatches(
  bankRows: ParsedBankRow[],
  suggestions: BankMatchSuggestion[]
): BankReconcileConfirm[] {
  const out: BankReconcileConfirm[] = [];
  for (const s of suggestions) {
    if (!s.transactionId || s.isConflict) continue;
    const row = bankRows[s.bankRowIndex];
    if (!row) continue;
    out.push({
      bankRowIndex: s.bankRowIndex,
      transactionId: s.transactionId,
      score: s.score,
      bankDescription: row.descripcion,
    });
  }
  return out;
}

export function buildBankReconcilePatch(confirm: BankReconcileConfirm): {
  id: string;
  payload: {
    bank_reconciled: true;
    bank_match_score: number;
    bank_match_desc: string;
    actualizado_en: ReturnType<typeof serverTimestamp>;
  };
} {
  const score = Math.max(0, Math.min(100, Number(confirm.score) || 0));
  return {
    id: confirm.transactionId,
    payload: {
      bank_reconciled: true,
      bank_match_score: score,
      bank_match_desc: truncateBankMatchDesc(confirm.bankDescription),
      actualizado_en: serverTimestamp(),
    },
  };
}

/**
 * Persiste confirms (solo los pasados; caller filtra conflictos).
 * Usa writeBatch merge — no pisa clasificación/fiscal.
 */
export async function confirmBankMatches(
  confirms: BankReconcileConfirm[]
): Promise<BankConfirmSummary> {
  const summary: BankConfirmSummary = {
    confirmed: 0,
    skippedConflict: 0,
    skippedNoMatch: 0,
    errors: [],
  };

  if (confirms.length === 0) {
    return summary;
  }

  const updates = confirms.map(buildBankReconcilePatch);

  try {
    await commitTransactionUpdatesBatch(updates);
  } catch (e) {
    summary.errors.push(
      e instanceof Error ? e.message : 'Error al guardar conciliación en Firestore'
    );
    return summary;
  }

  for (const c of confirms) {
    await logAuditEntry('BANK_MATCH_CONFIRMED', 'transactions', {
      id: c.transactionId,
      bankRowIndex: c.bankRowIndex,
      score: c.score,
      bank_match_desc: truncateBankMatchDesc(c.bankDescription),
    });
    summary.confirmed += 1;
  }

  return summary;
}

/** Orquestación UI: confirma solo matches sin conflicto. */
export async function confirmNonConflictMatches(
  bankRows: ParsedBankRow[],
  suggestions: BankMatchSuggestion[]
): Promise<BankConfirmSummary> {
  const skippedConflict = suggestions.filter((s) => s.isConflict).length;
  const skippedNoMatch = suggestions.filter((s) => !s.transactionId).length;
  const confirms = buildConfirmableMatches(bankRows, suggestions);
  const summary = await confirmBankMatches(confirms);
  summary.skippedConflict = skippedConflict;
  summary.skippedNoMatch = skippedNoMatch;
  return summary;
}

/** Adapta filas del libro (pueden venir con id opcional) a BankLedgerItem. */
export function toBankLedgerItems(
  rows: Array<{ id?: string; monto?: number; fecha?: string; concepto?: string }>
): BankLedgerItem[] {
  const out: BankLedgerItem[] = [];
  for (const r of rows) {
    if (!r.id || r.fecha == null || r.monto == null) continue;
    out.push({
      id: String(r.id),
      monto: Number(r.monto) || 0,
      fecha: String(r.fecha),
      concepto: r.concepto != null ? String(r.concepto) : undefined,
    });
  }
  return out;
}
