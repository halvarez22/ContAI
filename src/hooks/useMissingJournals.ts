import { useCallback, useState } from 'react';
import { periodKey } from '../lib/periodClose';
import type { AccountMappingRule, CatalogAccount } from '../types/chartOfAccounts';
import type { TransactionListenerDoc } from '../types/orgListeners';
import { commitTransactionUpdatesBatch } from '../services/firestoreService';
import { executeAgent, AGENT_TYPES } from '../services/groqAIService';
import { logAuditEntry } from '../services/auditService';
import {
  formatMissingJournalResult,
  reconstructMissingJournals,
  recordMissingJournalRun,
  toHistoricalReconstructionDraft,
} from '../services/missingJournalService';

export type UseMissingJournalsParams = {
  userId: string | undefined;
  organizationId: string | undefined;
  canWrite: boolean;
  periodClosed: boolean;
  truncated: boolean;
  year: number;
  monthIndex: number;
  transactions: readonly TransactionListenerDoc[];
  periodosCerrados: readonly string[];
  accounts: readonly CatalogAccount[];
  rules: readonly AccountMappingRule[];
  atajoPueBancos: boolean;
};

export function useMissingJournals(params: UseMissingJournalsParams) {
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const disabledHint = !params.organizationId
    ? 'Selecciona una organización antes de generar los asientos.'
    : !params.canWrite
      ? 'No puedes modificar los movimientos de esta organización.'
      : params.periodClosed
        ? 'Periodo cerrado'
        : '';

  const run = useCallback(async () => {
    if (!params.userId || !params.organizationId || !params.canWrite || params.periodClosed) {
      return;
    }
    setGenerating(true);
    setMessage(null);
    try {
      const month = params.transactions.filter((tx) => {
        const parsed = new Date(tx.fecha);
        return (
          !Number.isNaN(parsed.getTime()) &&
          parsed.getFullYear() === params.year &&
          parsed.getMonth() === params.monthIndex
        );
      });
      const drafts = month.flatMap((tx) => {
        const draft = toHistoricalReconstructionDraft(tx);
        return draft ? [draft] : [];
      });
      const unread = month.length - drafts.length;
      const plan = await reconstructMissingJournals(drafts, {
        organizationId: params.organizationId,
        periodosCerrados: params.periodosCerrados,
        accounts: params.accounts,
        rules: params.rules,
        atajoPueBancos: params.atajoPueBancos,
        classify: async (payload) => {
          const result = await executeAgent(AGENT_TYPES.CLASIFICADOR, payload);
          await logAuditEntry(
            'AI_CLASSIFICATION_GROQ',
            'transactions',
            { decision: result.decision },
            {
              provider: result.provider,
              modelUsed: result.modelUsed,
              tokensUsed: result.tokensUsed,
            }
          );
          return result.decision;
        },
      });
      if (plan.updates.length > 0) {
        await commitTransactionUpdatesBatch(plan.updates);
      }
      await recordMissingJournalRun({
        organizationId: params.organizationId,
        periodKey: periodKey(params.year, params.monthIndex),
        generated: plan.generated,
        review: plan.review,
        omitted: plan.omitted,
      });
      const notices =
        unread > 0
          ? [
              `${unread} movimiento${unread === 1 ? '' : 's'} no se pudo leer.`,
              ...plan.notices,
            ]
          : plan.notices;
      setMessage(formatMissingJournalResult({ ...plan, notices }, params.truncated));
    } catch (error: unknown) {
      console.error(error);
      setMessage('No se pudieron generar los asientos. Reintenta.');
    } finally {
      setGenerating(false);
    }
  }, [
    params.userId,
    params.organizationId,
    params.canWrite,
    params.periodClosed,
    params.truncated,
    params.year,
    params.monthIndex,
    params.transactions,
    params.periodosCerrados,
    params.accounts,
    params.rules,
    params.atajoPueBancos,
  ]);

  return {
    generating,
    message,
    disabled: disabledHint !== '',
    disabledHint,
    truncated: params.truncated,
    run,
  };
}
