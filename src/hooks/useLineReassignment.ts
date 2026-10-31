import { useCallback, useRef, useState } from 'react';
import type { CatalogAccount } from '../types/chartOfAccounts';
import type { JournalEntry } from '../types/journalEntry';
import { AUDIT_CUENTA_LINEA_REASIGNADA } from '../types/lineReassignment';
import { logAuditEntry } from '../services/auditService';
import { commitTransactionUpdatesBatch, serverTimestamp } from '../services/firestoreService';
import { validateLineAccountChange } from '../services/lineReassignmentService';

const ROLE_HINT = 'No puedes modificar los movimientos de esta organización.';

export function useLineReassignment(input: {
  transactionId: string;
  status?: string | null;
  fecha: string;
  isNomina?: boolean;
  cfdiTipo?: string | null;
  periodosCerrados: readonly string[];
  chart: readonly CatalogAccount[];
  canWrite: boolean;
  organizationId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = useCallback(
    async (
      lineIndex: number,
      newAccountCode: string,
      currentEntry: JournalEntry
    ): Promise<{ ok: true; entry: JournalEntry } | { ok: false; reason: string }> => {
      if (savingRef.current) return { ok: false, reason: 'Espera a que termine el guardado.' };
      if (!input.canWrite || !input.organizationId) {
        return { ok: false, reason: input.canWrite ? 'Elige una organización.' : ROLE_HINT };
      }
      const currentLine = currentEntry.lines[lineIndex];
      const planned = validateLineAccountChange({
        transaction_id: input.transactionId,
        line_index: lineIndex,
        new_account_code: newAccountCode,
        current_entry: currentEntry,
        status: input.status,
        fecha: input.fecha,
        is_nomina: input.isNomina,
        cfdi_tipo_comprobante: input.cfdiTipo,
        periodosCerrados: input.periodosCerrados,
        chart: input.chart,
      });
      if (!planned.ok) return planned;

      savingRef.current = true;
      setSaving(true);
      try {
        await commitTransactionUpdatesBatch([
          {
            id: input.transactionId,
            payload: {
              asiento_devengo: planned.entry,
              actualizado_en: serverTimestamp(),
            },
          },
        ]);
        await logAuditEntry(AUDIT_CUENTA_LINEA_REASIGNADA, 'transactions', {
          organization_id: input.organizationId,
          transaction_id: input.transactionId,
          line_index: lineIndex,
          old_account_code: currentLine?.account_code ?? '',
          new_account_code: newAccountCode.trim(),
        });
        return planned;
      } catch (error: unknown) {
        const message = 'No se pudo guardar la cuenta de la línea.';
        return { ok: false, reason: error instanceof Error ? message : message };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [input]
  );

  return { save, saving };
}
