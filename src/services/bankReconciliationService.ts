/**
 * Conciliación bancaria E5.1–E5.2: parse, heurística, enrich IA, confirmación.
 * Sin React. Persistencia vía firestoreService (merge). Groq solo vía fn inyectada / proposeBankMatch.
 */

import {
  commitTransactionUpdatesBatch,
  serverTimestamp,
} from './firestoreService';
import { logAuditEntry } from './auditService';
import type {
  BankAiEnrichSummary,
  BankAiMatchInput,
  BankConfirmSummary,
  BankLedgerItem,
  BankManualCandidate,
  BankManualOverride,
  BankMatchSuggestion,
  BankReconcileConfirm,
  ParsedBankRow,
  ProposeBankMatchFn,
} from '../types/bankReconciliation';
import {
  BANK_AI_LOW_SCORE_THRESHOLD,
  BANK_AI_MAX_CANDIDATES,
  BANK_MATCH_AMBIGUOUS_SCORE_DELTA,
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
    const delim = line.includes(';') ? ';' : ',';
    const parts = line.split(delim).map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 2) continue;

    const fechaStr = parts[0];
    const montoRaw = parts[1];
    const desc = parts.slice(2).join(' ') || parts[0];

    const monto = parseFloat(
      String(montoRaw)
        .replace(/[$\s]/g, '')
        .replace(/,(?=\d{3}(\D|$))/g, '')
        .replace(',', '.')
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

export function markConflicts(suggestions: BankMatchSuggestion[]): BankMatchSuggestion[] {
  const counts = new Map<string, number>();
  for (const s of suggestions) {
    if (!s.transactionId) continue;
    counts.set(s.transactionId, (counts.get(s.transactionId) ?? 0) + 1);
  }
  return suggestions.map((s) => {
    const multiRowConflict = Boolean(
      s.transactionId && (counts.get(s.transactionId) ?? 0) > 1
    );
    const isConflict = s.isConflict || multiRowConflict;
    let note = s.note;
    if (multiRowConflict && !s.note.includes('CONFLICTO')) {
      note = `${s.note} · CONFLICTO: varias filas bancarias → misma tx`;
    }
    return { ...s, isConflict, note };
  });
}

/**
 * Heurística: monto ±amountTolerancePct, fecha ±maxDaysDiff.
 * Ambigüedad 1.º vs 2.º → isConflict. Varias filas → misma tx → isConflict.
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
    const scored: Array<{ id: string; score: number }> = [];

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
      scored.push({ id: String(tx.id), score });
    }

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0] ?? null;
    const second = scored[1] ?? null;
    const ambiguous =
      Boolean(best && second) &&
      best!.score - second!.score < BANK_MATCH_AMBIGUOUS_SCORE_DELTA;

    suggestions.push({
      bankRowIndex: i,
      transactionId: best?.id ?? null,
      score: best?.score ?? 0,
      note: ambiguous
        ? `Ambigüedad entre candidatos (${best!.score.toFixed(0)} vs ${second!.score.toFixed(0)} pts)`
        : best
          ? `Posible coincidencia (${best.score.toFixed(0)} pts)`
          : 'Sin coincidencia en libro',
      isConflict: ambiguous,
      suggestionSource: 'heuristic',
    });
  }

  return markConflicts(suggestions);
}

/** Filas elegibles para Groq: sin match o score < umbral; excluye conflictos. */
export function selectAiEligibleRows(
  suggestions: BankMatchSuggestion[],
  lowScoreThreshold: number = BANK_AI_LOW_SCORE_THRESHOLD
): number[] {
  const out: number[] = [];
  for (const s of suggestions) {
    if (s.isConflict) continue;
    if (!s.transactionId || s.score < lowScoreThreshold) {
      out.push(s.bankRowIndex);
    }
  }
  return out;
}

/** Candidatos amplios (ventana/tolerancia relajada) para contexto Groq. */
export function buildAiCandidates(
  bankRow: ParsedBankRow,
  ledger: BankLedgerItem[],
  maxN: number = BANK_AI_MAX_CANDIDATES
): BankLedgerItem[] {
  const bankDate = new Date(bankRow.fecha).getTime();
  const scored: Array<{ item: BankLedgerItem; score: number }> = [];

  for (const tx of ledger) {
    const m = Number(tx.monto) || 0;
    const txDate = new Date(tx.fecha).getTime();
    if (Number.isNaN(bankDate) || Number.isNaN(txDate)) continue;
    const dayDiff = Math.abs(bankDate - txDate) / (86400 * 1000);
    if (dayDiff > 14) continue;
    const pctDiff = m === 0 ? 100 : (Math.abs(m - bankRow.monto) / m) * 100;
    if (pctDiff > 15) continue;
    const score = 100 - dayDiff * 4 - pctDiff * 2;
    scored.push({ item: tx, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxN).map((s) => s.item);
}

/**
 * Enrich secuencial (K=1). Fallos parciales por fila. No auto-aplica.
 * `propose` inyectable para tests sin red.
 */
export async function enrichSuggestionsWithAi(params: {
  bankRows: ParsedBankRow[];
  ledger: BankLedgerItem[];
  suggestions: BankMatchSuggestion[];
  propose: ProposeBankMatchFn;
  lowScoreThreshold?: number;
  onProgress?: (current: number, total: number, bankRowIndex: number) => void;
}): Promise<BankAiEnrichSummary> {
  const {
    bankRows,
    ledger,
    suggestions,
    propose,
    lowScoreThreshold = BANK_AI_LOW_SCORE_THRESHOLD,
    onProgress,
  } = params;

  const eligible = selectAiEligibleRows(suggestions, lowScoreThreshold);
  const next = suggestions.map((s) => ({ ...s }));
  const errorByRowIndex: Record<number, string> = {};
  let enriched = 0;
  const ledgerIds = new Set(ledger.map((l) => l.id));

  for (let i = 0; i < eligible.length; i++) {
    const rowIndex = eligible[i];
    onProgress?.(i + 1, eligible.length, rowIndex);
    const row = bankRows[rowIndex];
    if (!row) continue;

    const input: BankAiMatchInput = {
      bankRow: row,
      candidates: buildAiCandidates(row, ledger),
    };

    try {
      const { proposal, modelUsed, tokensUsed } = await propose(input);
      await logAuditEntry(
        'AI_BANK_RECONCILE_GROQ',
        'ai_service',
        {
          bankRowIndex: rowIndex,
          matchedTransactionId: proposal.matchedTransactionId,
          confidence_score: proposal.confidence_score,
          reason: proposal.reason,
          requires_human_approval: proposal.requires_human_approval,
        },
        { provider: 'groq', modelUsed, tokensUsed }
      );

      if (
        proposal.matchedTransactionId &&
        ledgerIds.has(proposal.matchedTransactionId)
      ) {
        const confPts = Math.round(
          Math.max(0, Math.min(1, proposal.confidence_score)) * 100
        );
        next[rowIndex] = {
          bankRowIndex: rowIndex,
          transactionId: proposal.matchedTransactionId,
          score: confPts,
          note: proposal.requires_human_approval
            ? `IA: ${proposal.reason} · requiere revisión`.slice(0, 200)
            : `IA: ${proposal.reason}`.slice(0, 200),
          isConflict: false,
          suggestionSource: 'ai',
        };
        enriched += 1;
      }
    } catch (e) {
      errorByRowIndex[rowIndex] =
        e instanceof Error ? e.message : 'IA no disponible para esta fila';
    }
  }

  return {
    enriched,
    attempted: eligible.length,
    errorByRowIndex,
    suggestions: markConflicts(next),
  };
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

export async function confirmBankMatches(
  confirms: BankReconcileConfirm[],
  auditExtras?: { source?: string }
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
      ...(auditExtras?.source ? { source: auditExtras.source } : {}),
    });
    summary.confirmed += 1;
  }

  return summary;
}

/**
 * Candidatos del ledger del periodo (solo memoria). Sin Firestore.
 * Con query: filtra por concepto/monto/fecha/id. Sin query: proximidad relajada.
 */
export function listManualCandidates(
  bankRow: ParsedBankRow,
  ledger: BankLedgerItem[],
  opts?: { query?: string; limit?: number }
): BankManualCandidate[] {
  const limit = opts?.limit ?? 20;
  const q = (opts?.query || '').trim().toLowerCase();
  const bankDate = new Date(bankRow.fecha).getTime();
  const scored: BankManualCandidate[] = [];

  for (const tx of ledger) {
    if (!tx.id) continue;
    if (q) {
      const hay = `${tx.concepto || ''} ${tx.monto} ${tx.fecha} ${tx.id}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }

    const m = Number(tx.monto) || 0;
    const txDate = new Date(tx.fecha).getTime();
    let proximityScore = 0;
    if (!Number.isNaN(bankDate) && !Number.isNaN(txDate)) {
      const dayDiff = Math.abs(bankDate - txDate) / (86400 * 1000);
      const pctDiff = m === 0 ? 100 : (Math.abs(m - bankRow.monto) / m) * 100;
      if (!q && (dayDiff > 14 || pctDiff > 15)) continue;
      proximityScore = Math.max(0, 100 - dayDiff * 4 - pctDiff * 2);
    }

    scored.push({
      id: tx.id,
      monto: tx.monto,
      fecha: tx.fecha,
      concepto: tx.concepto,
      proximityScore,
    });
  }

  scored.sort((a, b) => b.proximityScore - a.proximityScore);
  return scored.slice(0, limit);
}

/** Aplica overrides manuales y recalcula conflictos 1:N. */
export function applyManualOverrides(
  suggestions: BankMatchSuggestion[],
  overrides: ReadonlyMap<number, BankManualOverride>
): BankMatchSuggestion[] {
  if (overrides.size === 0) {
    return suggestions.map((s) => ({ ...s }));
  }
  const next = suggestions.map((s) => {
    const o = overrides.get(s.bankRowIndex);
    if (!o) return { ...s };
    return {
      bankRowIndex: s.bankRowIndex,
      transactionId: o.transactionId,
      score: 100,
      note: o.note?.trim() || 'Match manual del contador',
      isConflict: false,
      suggestionSource: 'manual' as const,
    };
  });
  return markConflicts(next);
}

/** Confirma una sola fila (E5.4). Reutiliza patch + audit con source. */
export async function confirmSingleMatch(
  bankRows: ParsedBankRow[],
  suggestion: BankMatchSuggestion,
  options?: { source?: string }
): Promise<BankConfirmSummary> {
  const source = options?.source ?? 'manual';
  if (suggestion.isConflict) {
    return {
      confirmed: 0,
      skippedConflict: 1,
      skippedNoMatch: 0,
      errors: ['La fila sigue en conflicto; elija otra transacción'],
    };
  }
  if (!suggestion.transactionId) {
    return {
      confirmed: 0,
      skippedConflict: 0,
      skippedNoMatch: 1,
      errors: ['Sin transacción seleccionada'],
    };
  }
  const row = bankRows[suggestion.bankRowIndex];
  if (!row) {
    return {
      confirmed: 0,
      skippedConflict: 0,
      skippedNoMatch: 0,
      errors: ['Fila bancaria no encontrada'],
    };
  }
  return confirmBankMatches(
    [
      {
        bankRowIndex: suggestion.bankRowIndex,
        transactionId: suggestion.transactionId,
        score: suggestion.score,
        bankDescription: row.descripcion,
      },
    ],
    { source }
  );
}

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
