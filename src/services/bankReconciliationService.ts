/**
 * Conciliación bancaria E5.1–E5.4 + E9.1 split.
 * Sin React. Persistencia vía bankAllocationService / firestoreService.
 */

import {
  commitTransactionUpdatesBatch,
  serverTimestamp,
} from './firestoreService';
import { confirmBankAllocationsBatch } from './bankAllocationService';
import { logAuditEntry } from './auditService';
import { roundMoney } from './taxCalculatorService';
import type { BankAllocationDraft } from '../types/bankAllocation';
import {
  BANK_SPLIT_MAX_LEGS,
  assertValidAllocationsAgainstBank,
  moneyWithinPct,
  sumAllocationAmounts,
  txRemainingAmount,
} from '../types/bankAllocation';
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
  BANK_MATCH_DESC_MAX_LEN,
  BANK_MATCH_MAX_DAYS_DIFF,
  BANK_MATCH_AMOUNT_TOLERANCE_PCT,
} from '../types/bankReconciliation';

export function truncateBankMatchDesc(desc: string): string {
  const t = desc.trim();
  if (t.length <= BANK_MATCH_DESC_MAX_LEN) return t;
  return t.slice(0, BANK_MATCH_DESC_MAX_LEN);
}

export function normalizeSuggestionAllocations(
  suggestion: BankMatchSuggestion,
  bankRow: ParsedBankRow | undefined
): BankAllocationDraft[] {
  if (suggestion.allocations?.length) {
    return suggestion.allocations.map((a) => ({
      transactionId: a.transactionId,
      amount: roundMoney(a.amount),
    }));
  }
  if (suggestion.transactionId && bankRow) {
    return [
      {
        transactionId: suggestion.transactionId,
        amount: roundMoney(bankRow.monto),
      },
    ];
  }
  return [];
}

export function suggestionHasMatch(s: BankMatchSuggestion): boolean {
  return Boolean(
    (s.allocations && s.allocations.length > 0) || s.transactionId
  );
}

/** Parse CSV simple: columnas fecha, monto, descripción (coma o punto y coma). */
export function parseBankCsv(text: string): {
  rows: ParsedBankRow[];
  errors: string[];
} {
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
        const y =
          segs[2].length === 2
            ? 2000 + parseInt(segs[2], 10)
            : parseInt(segs[2], 10);
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

/**
 * Conflictos: overclaim de remaining entre filas, o ambigüedad ya marcada.
 * N bancos → 1 TX permitido si caben en remaining.
 */
export function markConflicts(
  suggestions: BankMatchSuggestion[],
  bankRows: ParsedBankRow[],
  ledger: BankLedgerItem[]
): BankMatchSuggestion[] {
  const remaining = new Map<string, number>();
  for (const tx of ledger) {
    remaining.set(
      tx.id,
      txRemainingAmount(tx.monto, tx.bank_reconciled_amount ?? 0)
    );
  }

  const claimed = new Map<string, number>();
  for (const s of suggestions) {
    if (s.isConflict) continue;
    const row = bankRows[s.bankRowIndex];
    const allocs = normalizeSuggestionAllocations(s, row);
    for (const a of allocs) {
      claimed.set(
        a.transactionId,
        roundMoney((claimed.get(a.transactionId) ?? 0) + a.amount)
      );
    }
  }

  return suggestions.map((s) => {
    const row = bankRows[s.bankRowIndex];
    const allocs = normalizeSuggestionAllocations(s, row);
    if (s.isConflict) {
      return { ...s, allocations: allocs };
    }
    let overclaim = false;
    for (const a of allocs) {
      const rem = remaining.get(a.transactionId) ?? 0;
      const totalClaim = claimed.get(a.transactionId) ?? 0;
      if (totalClaim > rem + 0.005) {
        overclaim = true;
        break;
      }
    }
    if (!overclaim) {
      return { ...s, allocations: allocs };
    }
    return {
      ...s,
      allocations: allocs,
      isConflict: true,
      note: `${s.note} · CONFLICTO: overclaim de remaining en TX`.slice(0, 200),
    };
  });
}

/**
 * Heurística 1↔1 + split greedy para unmatched.
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
    const scored: Array<{ id: string; score: number; remaining: number }> = [];

    for (const tx of ledger) {
      if (!tx.id) continue;
      const rem = txRemainingAmount(tx.monto, tx.bank_reconciled_amount ?? 0);
      if (rem <= 0) continue;
      const txDate = new Date(tx.fecha).getTime();
      if (Number.isNaN(bankDate) || Number.isNaN(txDate)) continue;

      const dayDiff = Math.abs(bankDate - txDate) / (86400 * 1000);
      if (dayDiff > maxDaysDiff) continue;

      const pctDiff =
        rem === 0 ? 100 : (Math.abs(rem - br.monto) / rem) * 100;
      if (pctDiff > amountTolerancePct) continue;

      const score = 100 - dayDiff * 8 - pctDiff * 3;
      scored.push({ id: String(tx.id), score, remaining: rem });
    }

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0] ?? null;
    const second = scored[1] ?? null;
    const ambiguous =
      Boolean(best && second) &&
      best!.score - second!.score < BANK_MATCH_AMBIGUOUS_SCORE_DELTA;

    if (best) {
      const amount = roundMoney(Math.min(best.remaining, br.monto));
      suggestions.push({
        bankRowIndex: i,
        transactionId: best.id,
        allocations: [{ transactionId: best.id, amount }],
        score: best.score,
        note: ambiguous
          ? `Ambigüedad entre candidatos (${best.score.toFixed(0)} vs ${second!.score.toFixed(0)} pts)`
          : `Posible coincidencia (${best.score.toFixed(0)} pts)`,
        isConflict: ambiguous,
        suggestionSource: 'heuristic',
      });
    } else {
      suggestions.push({
        bankRowIndex: i,
        transactionId: null,
        allocations: [],
        score: 0,
        note: 'Sin coincidencia en libro',
        isConflict: false,
        suggestionSource: 'heuristic',
      });
    }
  }

  const withSplit = suggestSplitForUnmatched(bankRows, ledger, suggestions);
  return markConflicts(withSplit, bankRows, ledger);
}

/**
 * Para filas sin match 1↔1: greedy 2–N legs (máx BANK_SPLIT_MAX_LEGS).
 */
export function suggestSplitForUnmatched(
  bankRows: ParsedBankRow[],
  ledger: BankLedgerItem[],
  suggestions: BankMatchSuggestion[],
  maxDaysDiff = BANK_MATCH_MAX_DAYS_DIFF
): BankMatchSuggestion[] {
  const usedTx = new Set<string>();
  for (const s of suggestions) {
    for (const a of normalizeSuggestionAllocations(
      s,
      bankRows[s.bankRowIndex]
    )) {
      if (!s.isConflict && suggestionHasMatch(s)) usedTx.add(a.transactionId);
    }
  }

  return suggestions.map((s) => {
    if (s.isConflict || suggestionHasMatch(s)) return s;
    const br = bankRows[s.bankRowIndex];
    if (!br) return s;
    const bankDate = new Date(br.fecha).getTime();
    const bankAmount = roundMoney(br.monto);

    const candidates: Array<{
      id: string;
      remaining: number;
      score: number;
    }> = [];

    for (const tx of ledger) {
      if (!tx.id || usedTx.has(tx.id)) continue;
      const rem = txRemainingAmount(tx.monto, tx.bank_reconciled_amount ?? 0);
      if (rem <= 0) continue;
      const txDate = new Date(tx.fecha).getTime();
      if (Number.isNaN(bankDate) || Number.isNaN(txDate)) continue;
      const dayDiff = Math.abs(bankDate - txDate) / (86400 * 1000);
      if (dayDiff > maxDaysDiff) continue;
      const score = 100 - dayDiff * 8;
      candidates.push({ id: tx.id, remaining: rem, score });
    }

    candidates.sort((a, b) => b.score - a.score || b.remaining - a.remaining);

    const allocations: BankAllocationDraft[] = [];
    let covered = 0;
    for (const c of candidates) {
      if (allocations.length >= BANK_SPLIT_MAX_LEGS) break;
      const need = roundMoney(bankAmount - covered);
      if (need <= 0) break;
      const take = roundMoney(Math.min(c.remaining, need));
      if (take <= 0) continue;
      allocations.push({ transactionId: c.id, amount: take });
      covered = roundMoney(covered + take);
      usedTx.add(c.id);
    }

    if (allocations.length < 2) return s;
    if (!moneyWithinPct(covered, bankAmount)) return s;

    const check = assertValidAllocationsAgainstBank({
      bankAmount,
      allocations,
    });
    if (!check.ok) return s;

    return {
      bankRowIndex: s.bankRowIndex,
      transactionId: allocations[0]?.transactionId ?? null,
      allocations,
      score: 75,
      note: `Split heurístico (${allocations.length} facturas)`,
      isConflict: false,
      suggestionSource: 'heuristic_split',
    };
  });
}

export function selectAiEligibleRows(
  suggestions: BankMatchSuggestion[],
  lowScoreThreshold: number = BANK_AI_LOW_SCORE_THRESHOLD
): number[] {
  const out: number[] = [];
  for (const s of suggestions) {
    if (s.isConflict) continue;
    if (!suggestionHasMatch(s) || s.score < lowScoreThreshold) {
      out.push(s.bankRowIndex);
    }
  }
  return out;
}

export function buildAiCandidates(
  bankRow: ParsedBankRow,
  ledger: BankLedgerItem[],
  maxN: number = BANK_AI_MAX_CANDIDATES
): BankLedgerItem[] {
  const bankDate = new Date(bankRow.fecha).getTime();
  const scored: Array<{ item: BankLedgerItem; score: number }> = [];

  for (const tx of ledger) {
    const rem = txRemainingAmount(tx.monto, tx.bank_reconciled_amount ?? 0);
    if (rem <= 0) continue;
    const txDate = new Date(tx.fecha).getTime();
    if (Number.isNaN(bankDate) || Number.isNaN(txDate)) continue;
    const dayDiff = Math.abs(bankDate - txDate) / (86400 * 1000);
    if (dayDiff > 14) continue;
    const pctDiff =
      rem === 0 ? 100 : (Math.abs(rem - bankRow.monto) / rem) * 100;
    if (pctDiff > 15) continue;
    const score = 100 - dayDiff * 4 - pctDiff * 2;
    scored.push({ item: tx, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxN).map((s) => s.item);
}

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
  const next = suggestions.map((s) => ({
    ...s,
    allocations: [...(s.allocations ?? [])],
  }));
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
        const tx = ledger.find((l) => l.id === proposal.matchedTransactionId);
        const rem = tx
          ? txRemainingAmount(tx.monto, tx.bank_reconciled_amount ?? 0)
          : roundMoney(row.monto);
        const amount = roundMoney(Math.min(rem, row.monto));
        next[rowIndex] = {
          bankRowIndex: rowIndex,
          transactionId: proposal.matchedTransactionId,
          allocations: [
            {
              transactionId: proposal.matchedTransactionId,
              amount,
            },
          ],
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
    suggestions: markConflicts(next, bankRows, ledger),
  };
}

export function buildConfirmableMatches(
  bankRows: ParsedBankRow[],
  suggestions: BankMatchSuggestion[]
): BankReconcileConfirm[] {
  const out: BankReconcileConfirm[] = [];
  for (const s of suggestions) {
    if (s.isConflict) continue;
    const row = bankRows[s.bankRowIndex];
    if (!row) continue;
    const allocations = normalizeSuggestionAllocations(s, row);
    if (allocations.length === 0) continue;
    const check = assertValidAllocationsAgainstBank({
      bankAmount: row.monto,
      allocations,
    });
    if (!check.ok) continue;
    out.push({
      bankRowIndex: s.bankRowIndex,
      transactionId: allocations[0]!.transactionId,
      allocations,
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
    bank_reconcile_status: 'full';
    bank_reconciled_amount: number;
    bank_match_score: number;
    bank_match_desc: string;
    actualizado_en: ReturnType<typeof serverTimestamp>;
  };
} {
  const score = Math.max(0, Math.min(100, Number(confirm.score) || 0));
  const amount = sumAllocationAmounts(
    confirm.allocations.length
      ? confirm.allocations
      : [{ transactionId: confirm.transactionId, amount: 0 }]
  );
  return {
    id: confirm.transactionId,
    payload: {
      bank_reconciled: true,
      bank_reconcile_status: 'full',
      bank_reconciled_amount: amount,
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
      e instanceof Error
        ? e.message
        : 'Error al guardar conciliación en Firestore'
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
    const remaining = txRemainingAmount(
      tx.monto,
      tx.bank_reconciled_amount ?? 0
    );
    if (remaining <= 0 && !q) continue;
    if (q) {
      const hay =
        `${tx.concepto || ''} ${tx.monto} ${tx.fecha} ${tx.id}`.toLowerCase();
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
      bank_reconciled_amount: tx.bank_reconciled_amount,
      proximityScore,
      remaining,
    });
  }

  scored.sort((a, b) => b.proximityScore - a.proximityScore);
  return scored.slice(0, limit);
}

export function applyManualOverrides(
  suggestions: BankMatchSuggestion[],
  overrides: ReadonlyMap<number, BankManualOverride>,
  bankRows: ParsedBankRow[] = [],
  ledger: BankLedgerItem[] = []
): BankMatchSuggestion[] {
  if (overrides.size === 0) {
    return suggestions.map((s) => ({
      ...s,
      allocations: [...(s.allocations ?? [])],
    }));
  }
  const next = suggestions.map((s) => {
    const o = overrides.get(s.bankRowIndex);
    if (!o) return { ...s, allocations: [...(s.allocations ?? [])] };
    const row = bankRows[s.bankRowIndex];
    const allocations = o.allocations?.length
      ? o.allocations.map((a) => ({
          transactionId: a.transactionId,
          amount: roundMoney(a.amount),
        }))
      : [
          {
            transactionId: o.transactionId,
            amount: roundMoney(row?.monto ?? 0),
          },
        ];
    return {
      bankRowIndex: s.bankRowIndex,
      transactionId: allocations[0]?.transactionId ?? o.transactionId,
      allocations,
      score: 100,
      note: o.note?.trim() || 'Match manual del contador',
      isConflict: false,
      suggestionSource: 'manual' as const,
    };
  });
  if (bankRows.length && ledger.length) {
    return markConflicts(next, bankRows, ledger);
  }
  return next;
}

export async function confirmSingleMatch(
  bankRows: ParsedBankRow[],
  suggestion: BankMatchSuggestion,
  options?: {
    source?: string;
    organizationId?: string;
    userId?: string;
    ledger?: BankLedgerItem[];
  }
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
  const row = bankRows[suggestion.bankRowIndex];
  if (!row) {
    return {
      confirmed: 0,
      skippedConflict: 0,
      skippedNoMatch: 0,
      errors: ['Fila bancaria no encontrada'],
    };
  }
  const allocations = normalizeSuggestionAllocations(suggestion, row);
  if (allocations.length === 0) {
    return {
      confirmed: 0,
      skippedConflict: 0,
      skippedNoMatch: 1,
      errors: ['Sin transacción seleccionada'],
    };
  }

  if (options?.organizationId && options?.userId) {
    const result = await confirmBankAllocationsBatch({
      organizationId: options.organizationId,
      userId: options.userId,
      ledger: options.ledger ?? [],
      items: [
        {
          bankRow: row,
          bankRowIndex: suggestion.bankRowIndex,
          allocations,
          score: suggestion.score,
        },
      ],
    });
    return {
      confirmed: result.confirmed,
      skippedConflict: 0,
      skippedNoMatch: 0,
      errors: result.errors,
    };
  }

  return confirmBankMatches(
    [
      {
        bankRowIndex: suggestion.bankRowIndex,
        transactionId: allocations[0]!.transactionId,
        allocations,
        score: suggestion.score,
        bankDescription: row.descripcion,
      },
    ],
    { source }
  );
}

export async function confirmNonConflictMatches(
  bankRows: ParsedBankRow[],
  suggestions: BankMatchSuggestion[],
  options?: {
    organizationId?: string;
    userId?: string;
    ledger?: BankLedgerItem[];
  }
): Promise<BankConfirmSummary> {
  const skippedConflict = suggestions.filter((s) => s.isConflict).length;
  const skippedNoMatch = suggestions.filter((s) => !suggestionHasMatch(s))
    .length;
  const confirms = buildConfirmableMatches(bankRows, suggestions);

  if (options?.organizationId && options?.userId) {
    const result = await confirmBankAllocationsBatch({
      organizationId: options.organizationId,
      userId: options.userId,
      ledger: options.ledger ?? [],
      items: confirms.map((c) => ({
        bankRow: bankRows[c.bankRowIndex]!,
        bankRowIndex: c.bankRowIndex,
        allocations: c.allocations,
        score: c.score,
      })),
    });
    return {
      confirmed: result.confirmed,
      skippedConflict,
      skippedNoMatch,
      errors: result.errors,
    };
  }

  const summary = await confirmBankMatches(confirms);
  summary.skippedConflict = skippedConflict;
  summary.skippedNoMatch = skippedNoMatch;
  return summary;
}

export function toBankLedgerItems(
  rows: Array<{
    id?: string;
    monto?: number;
    fecha?: string;
    concepto?: string;
    bank_reconciled_amount?: number;
  }>
): BankLedgerItem[] {
  const out: BankLedgerItem[] = [];
  for (const r of rows) {
    if (!r.id || r.fecha == null || r.monto == null) continue;
    out.push({
      id: String(r.id),
      monto: Number(r.monto) || 0,
      fecha: String(r.fecha),
      concepto: r.concepto != null ? String(r.concepto) : undefined,
      bank_reconciled_amount:
        r.bank_reconciled_amount != null
          ? Number(r.bank_reconciled_amount) || 0
          : undefined,
    });
  }
  return out;
}
