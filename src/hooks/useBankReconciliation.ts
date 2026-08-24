import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  parseBankCsv,
  suggestBankMatches,
  confirmNonConflictMatches,
  confirmSingleMatch,
  enrichSuggestionsWithAi,
  selectAiEligibleRows,
  toBankLedgerItems,
  applyManualOverrides,
  listManualCandidates,
} from '../services/bankReconciliationService';
import { proposeBankMatch } from '../services/groqAIService';
import type {
  BankLedgerItem,
  BankManualOverride,
  BankMatchSuggestion,
  ParsedBankRow,
  ProposeBankMatchFn,
} from '../types/bankReconciliation';
import type { BankRowFilter } from '../lib/bankReconciliationView';
import {
  countBankRowsByStatus,
  filterBankRowsByStatus,
  getBankRowViewStatus,
  isManuallyResolvableStatus,
} from '../lib/bankReconciliationView';

export type UseBankReconciliationParams = {
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
  const [baseHints, setBaseHints] = useState<BankMatchSuggestion[]>([]);
  const [manualOverrides, setManualOverrides] = useState<
    Map<number, BankManualOverride>
  >(() => new Map());
  const [sessionConfirmed, setSessionConfirmed] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [pickedTxId, setPickedTxId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmingSingle, setConfirmingSingle] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [aiEnriching, setAiEnriching] = useState(false);
  const [aiErrors, setAiErrors] = useState<Record<number, string>>({});
  const [aiProgress, setAiProgress] = useState<string | null>(null);
  const [filter, setFilter] = useState<BankRowFilter>('all');

  const hints = useMemo(
    () => applyManualOverrides(baseHints, manualOverrides),
    [baseHints, manualOverrides]
  );

  const rematch = useCallback(
    (rows: ParsedBankRow[]) => {
      setBaseHints(suggestBankMatches(rows, ledger));
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
      setManualOverrides(new Map());
      setSessionConfirmed(new Set());
      setSelectedRowIndex(null);
      setPickedTxId(null);
      setCandidateQuery('');
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        const parsed = parseBankCsv(text);
        setCsvPreview(parsed);
        if (parsed.rows.length > 0) {
          setBaseHints(suggestBankMatches(parsed.rows, ledger));
        } else {
          setBaseHints([]);
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
      setBaseHints(summary.suggestions);
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
        const confirmedIndices = hints
          .filter((h) => h.transactionId && !h.isConflict)
          .map((h) => h.bankRowIndex);
        setSessionConfirmed((prev) => {
          const next = new Set(prev);
          for (const i of confirmedIndices) next.add(i);
          return next;
        });
        setManualOverrides((prev) => {
          const next = new Map(prev);
          for (const i of confirmedIndices) next.delete(i);
          return next;
        });
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

  const selectRowForManual = useCallback(
    (rowIndex: number | null) => {
      setSelectedRowIndex(rowIndex);
      setCandidateQuery('');
      if (rowIndex == null) {
        setPickedTxId(null);
        return;
      }
      const h = hints[rowIndex];
      setPickedTxId(h?.transactionId ?? null);
    },
    [hints]
  );

  const handleApplyManual = useCallback(() => {
    if (selectedRowIndex == null || !pickedTxId) return;
    setManualOverrides((prev) => {
      const next = new Map(prev);
      next.set(selectedRowIndex, {
        bankRowIndex: selectedRowIndex,
        transactionId: pickedTxId,
        note: 'Match manual del contador',
      });
      return next;
    });
    setAiErrors((prev) => {
      if (!(selectedRowIndex in prev)) return prev;
      const next = { ...prev };
      delete next[selectedRowIndex];
      return next;
    });
    setMessage(
      `Match manual aplicado en fila ${selectedRowIndex + 1}. Revise y confirme.`
    );
  }, [selectedRowIndex, pickedTxId]);

  const handleConfirmSingle = useCallback(async () => {
    if (selectedRowIndex == null || !csvPreview?.rows?.length) return;
    const suggestion = hints[selectedRowIndex];
    if (!suggestion) return;
    setConfirmingSingle(true);
    setMessage(null);
    try {
      const summary = await confirmSingleMatch(csvPreview.rows, suggestion, {
        source: 'manual',
      });
      if (summary.errors.length > 0 || summary.confirmed === 0) {
        setMessage(
          summary.errors.join(' · ') ||
            'No se pudo confirmar la fila (conflicto o sin match).'
        );
        return;
      }
      setManualOverrides((prev) => {
        const next = new Map(prev);
        next.delete(selectedRowIndex);
        return next;
      });
      setSessionConfirmed((prev) => {
        const next = new Set(prev);
        next.add(selectedRowIndex);
        return next;
      });
      setMessage(`Fila ${selectedRowIndex + 1} confirmada (manual).`);
      setSelectedRowIndex(null);
      setPickedTxId(null);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Error al confirmar fila manual'
      );
    } finally {
      setConfirmingSingle(false);
    }
  }, [selectedRowIndex, csvPreview, hints]);

  const rows = csvPreview?.rows ?? [];
  const visibleIndices = filterBankRowsByStatus(
    rows,
    hints,
    aiErrors,
    filter,
    sessionConfirmed
  );
  const counts = countBankRowsByStatus(
    rows,
    hints,
    aiErrors,
    sessionConfirmed
  );
  const readyCount = hints.filter(
    (h, i) =>
      (h.transactionId && !h.isConflict) || sessionConfirmed.has(i)
  ).length;
  const eligibleAiCount = selectAiEligibleRows(hints).length;

  const selectedBankRow =
    selectedRowIndex != null ? rows[selectedRowIndex] : null;
  const selectedHint =
    selectedRowIndex != null ? hints[selectedRowIndex] : null;
  const selectedStatus =
    selectedRowIndex != null
      ? getBankRowViewStatus(
          hints[selectedRowIndex],
          aiErrors[selectedRowIndex],
          sessionConfirmed.has(selectedRowIndex)
        )
      : null;

  const manualCandidates = useMemo(() => {
    if (!selectedBankRow) return [];
    return listManualCandidates(selectedBankRow, ledger, {
      query: candidateQuery,
      limit: 20,
    });
  }, [selectedBankRow, ledger, candidateQuery]);

  const canApplyManual = Boolean(
    selectedRowIndex != null &&
      pickedTxId &&
      !sessionConfirmed.has(selectedRowIndex)
  );
  const canConfirmSingle = Boolean(
    selectedRowIndex != null &&
      selectedHint?.transactionId &&
      !selectedHint.isConflict &&
      selectedHint.suggestionSource === 'manual' &&
      !sessionConfirmed.has(selectedRowIndex)
  );

  return {
    csvPreview,
    hints,
    confirming,
    confirmingSingle,
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
    sessionConfirmed,
    selectedRowIndex,
    selectedBankRow,
    selectedHint,
    selectedStatus,
    candidateQuery,
    setCandidateQuery,
    pickedTxId,
    setPickedTxId,
    manualCandidates,
    canApplyManual,
    canConfirmSingle,
    handleBankFile,
    handleSuggestWithAi,
    handleConfirm,
    selectRowForManual,
    handleApplyManual,
    handleConfirmSingle,
    isRowResolvable: (i: number) => {
      const status = getBankRowViewStatus(
        hints[i],
        aiErrors[i],
        sessionConfirmed.has(i)
      );
      return isManuallyResolvableStatus(status, sessionConfirmed.has(i));
    },
  };
}

export { toBankLedgerItems };
