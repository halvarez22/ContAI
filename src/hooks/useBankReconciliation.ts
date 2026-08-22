import { useState, useCallback, useEffect } from 'react';
import {
  parseBankCsv,
  suggestBankMatches,
  confirmNonConflictMatches,
  enrichSuggestionsWithAi,
  selectAiEligibleRows,
  toBankLedgerItems,
} from '../services/bankReconciliationService';
import { proposeBankMatch } from '../services/groqAIService';
import type {
  BankLedgerItem,
  BankMatchSuggestion,
  ParsedBankRow,
  ProposeBankMatchFn,
} from '../types/bankReconciliation';
import type { BankRowFilter } from '../lib/bankReconciliationView';
import {
  countBankRowsByStatus,
  filterBankRowsByStatus,
} from '../lib/bankReconciliationView';

export type UseBankReconciliationParams = {
  /** Libro del periodo (subset tipado). */
  ledger: BankLedgerItem[];
  propose?: ProposeBankMatchFn;
};

export function useBankReconciliation({
  ledger,
  propose = proposeBankMatch,
}: UseBankReconciliationParams) {
  const [csvPreview, setCsvPreview] = useState<{
    rows: ParsedBankRow[];
    errors: string[];
  } | null>(null);
  const [hints, setHints] = useState<BankMatchSuggestion[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiEnriching, setAiEnriching] = useState(false);
  const [aiErrors, setAiErrors] = useState<Record<number, string>>({});
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const [filter, setFilter] = useState<BankRowFilter>('all');

  const rematch = useCallback(
    (rows: ParsedBankRow[]) => {
      setHints(suggestBankMatches(rows, ledger));
      setAiErrors({});
    },
    [ledger]
  );

  useEffect(() => {
    if (!csvPreview?.rows?.length) return;
    rematch(csvPreview.rows);
  }, [ledger, csvPreview, rematch]);

  const handleBankFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      setMessage(null);
      setAiErrors({});
      setAiProgress(null);
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        const parsed = parseBankCsv(text);
        setCsvPreview(parsed);
        if (parsed.rows.length > 0) {
          setHints(suggestBankMatches(parsed.rows, ledger));
        } else {
          setHints([]);
        }
      };
      reader.readAsText(file, 'UTF-8');
    },
    [ledger]
  );

  const handleSuggestWithAi = useCallback(async () => {
    if (!csvPreview?.rows?.length || hints.length === 0) return;
    const eligible = selectAiEligibleRows(hints);
    if (eligible.length === 0) {
      setMessage(
        'No hay filas elegibles para IA (todas tienen match fuerte o conflicto).'
      );
      return;
    }
    setAiEnriching(true);
    setAiErrors({});
    setAiProgress(null);
    setMessage(null);
    try {
      const summary = await enrichSuggestionsWithAi({
        bankRows: csvPreview.rows,
        ledger,
        suggestions: hints,
        propose,
        onProgress: (current, total, bankRowIndex) => {
          setAiProgress(`IA ${current}/${total} · fila ${bankRowIndex + 1}`);
        },
      });
      setHints(summary.suggestions);
      setAiErrors(summary.errorByRowIndex);
      const errCount = Object.keys(summary.errorByRowIndex).length;
      setMessage(
        `IA: ${summary.enriched} enriquecida(s) de ${summary.attempted} intentos` +
          (errCount ? ` · ${errCount} error(es) por fila` : '') +
          '. Confirma manualmente las coincidencias.'
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al sugerir con IA');
    } finally {
      setAiEnriching(false);
      setAiProgress(null);
    }
  }, [csvPreview, hints, ledger, propose]);

  const handleConfirm = useCallback(async () => {
    if (!csvPreview?.rows?.length || hints.length === 0) return;
    setConfirming(true);
    setMessage(null);
    try {
      const summary = await confirmNonConflictMatches(csvPreview.rows, hints);
      if (summary.errors.length > 0) {
        setMessage(summary.errors.join(' · '));
      } else {
        setMessage(
          `Confirmados: ${summary.confirmed}. Omitidos por conflicto: ${summary.skippedConflict}. Sin match: ${summary.skippedNoMatch}.`
        );
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Error al confirmar coincidencias'
      );
    } finally {
      setConfirming(false);
    }
  }, [csvPreview, hints]);

  const rows = csvPreview?.rows ?? [];
  const visibleIndices = filterBankRowsByStatus(rows, hints, aiErrors, filter);
  const counts = countBankRowsByStatus(rows, hints, aiErrors);
  const readyCount = hints.filter((h) => h.transactionId && !h.isConflict).length;
  const eligibleAiCount = selectAiEligibleRows(hints).length;

  return {
    csvPreview,
    hints,
    confirming,
    message,
    aiEnriching,
    aiErrors,
    aiProgress,
    filter,
    setFilter,
    visibleIndices,
    counts,
    readyCount,
    eligibleAiCount,
    handleBankFile,
    handleSuggestWithAi,
    handleConfirm,
  };
}

/** Helper para App: mapear transacciones del periodo a ledger tipado. */
export { toBankLedgerItems };
