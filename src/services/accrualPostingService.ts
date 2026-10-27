/**
 * Publica la auditoría del devengo. El asiento lo calcula journalEntryService.
 */

import type { CatalogAccount } from '../types/chartOfAccounts';
import { logAuditEntry } from './auditService';
import { AUDIT_POLIZA_DEVENGO_GENERADA, ATAJO_PUE_CONCEPTO } from '../types/journalEntry';
import type { JournalEntry } from '../types/journalEntry';
import {
  accrualPersistence,
  buildAccrualJournalEntry,
  type AccrualDraft,
} from './journalEntryService';

export async function auditPolizaDevengo(params: {
  organizationId: string;
  entry: JournalEntry;
  subtotal: number;
  iva: number;
  total: number;
}): Promise<void> {
  await logAuditEntry(AUDIT_POLIZA_DEVENGO_GENERADA, 'transactions', {
    organization_id: params.organizationId,
    transaction_id: params.entry.transaction_id,
    account_codes: params.entry.lines.map((line) => line.account_code),
    subtotal: params.subtotal,
    iva: params.iva,
    total: params.total,
    atajo_pue_bancos: params.entry.atajo_pue_bancos,
    ...(params.entry.atajo_pue_bancos ? { nota: ATAJO_PUE_CONCEPTO } : {}),
  });
}

export async function postClassifiedAccrual(params: {
  organizationId: string;
  draft: AccrualDraft;
  chart: readonly CatalogAccount[];
  atajoPueBancos: boolean;
  proposedStatus: 'revisión' | 'conciliado';
  proposedReason: string | null;
  subtotal: number;
  iva: number;
  total: number;
}): Promise<ReturnType<typeof accrualPersistence>> {
  const result = buildAccrualJournalEntry(params.draft, params.chart, params.atajoPueBancos);
  const persisted = accrualPersistence(result, params.proposedStatus, params.proposedReason);
  if (result.ok) {
    await auditPolizaDevengo({
      organizationId: params.organizationId,
      entry: result.entry,
      subtotal: params.subtotal,
      iva: params.iva,
      total: params.total,
    });
  }
  return persisted;
}
