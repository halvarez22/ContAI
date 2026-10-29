import type { ProductDraft, TransactionDraft } from '../lib/excelContaiImport';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import type { CatalogAccount, AccountMappingRule } from '../types/chartOfAccounts';
import type { ExcelRowDraft } from '../types/excelImport';
import type { AccrualDraft } from './journalEntryService';
import { postClassifiedAccrual } from './accrualPostingService';
import { decideAccount, type ClassifyAccountFn } from './accountMappingService';
import { logAuditEntry } from './auditService';
import { allocateTransactionIds, commitExcelBatches } from './firestoreService';

export const EXCEL_MISSING_FISCAL = 'Faltan subtotal e IVA para generar el devengo';
export const EXCEL_CLOSED_PERIOD = 'Periodo cerrado';

export function excelRowReason(rowIndex: number, detail: string): string {
  const prefix = `Fila ${rowIndex}: `;
  return detail.startsWith(prefix) ? detail : `${prefix}${detail}`;
}

export function toExcelRowDraft(draft: TransactionDraft): ExcelRowDraft {
  if (!Number.isInteger(draft.rowIndex) || draft.rowIndex < 1) {
    throw new Error('La fila de Excel no tiene índice.');
  }
  return {
    concepto: draft.concepto,
    monto: draft.monto,
    fiscal_subtotal: typeof draft.fiscal_subtotal === 'number' ? draft.fiscal_subtotal : null,
    fiscal_iva: typeof draft.fiscal_iva === 'number' ? draft.fiscal_iva : null,
    rowIndex: draft.rowIndex,
    tipo: draft.tipo,
    fecha: draft.fecha,
    proveedor: draft.proveedor,
  };
}

export type ExcelRowAssessment =
  | { outcome: 'closed'; reason: string }
  | { outcome: 'missing_fiscal'; reason: string }
  | { outcome: 'ready' };

/** El periodo cerrado se decide antes de armar el asiento. */
export function assessExcelRow(
  row: ExcelRowDraft,
  periodosCerrados: readonly string[]
): ExcelRowAssessment {
  if (isTransactionDateInClosedPeriod(row.fecha, [...periodosCerrados])) {
    return { outcome: 'closed', reason: excelRowReason(row.rowIndex, EXCEL_CLOSED_PERIOD) };
  }
  if (
    row.fiscal_subtotal === null ||
    row.fiscal_iva === null ||
    !Number.isFinite(row.fiscal_subtotal) ||
    !Number.isFinite(row.fiscal_iva)
  ) {
    return { outcome: 'missing_fiscal', reason: excelRowReason(row.rowIndex, EXCEL_MISSING_FISCAL) };
  }
  return { outcome: 'ready' };
}

export function toAccrualDraft(row: ExcelRowDraft, id: string, accountCode: string): AccrualDraft {
  return {
    id,
    tipo: row.tipo,
    monto: row.monto,
    fecha: row.fecha,
    fiscal_subtotal: row.fiscal_subtotal ?? undefined,
    fiscal_iva: row.fiscal_iva ?? undefined,
    account_code: accountCode,
    concepto: row.concepto,
    proveedor: row.proveedor,
    is_nomina: false,
  };
}

export async function commitExcelImport(
  userId: string,
  txs: TransactionDraft[],
  products: ProductDraft[],
  organizationId: string,
  options: {
    periodosCerrados: readonly string[];
    accounts: readonly CatalogAccount[];
    rules: readonly AccountMappingRule[];
    atajoPueBancos: boolean;
    classify: ClassifyAccountFn;
  }
): Promise<{ txCount: number; productCount: number; notices: string[] }> {
  const notices: string[] = [];
  const saving: TransactionDraft[] = [];

  for (const source of txs) {
    const row = toExcelRowDraft(source);
    const assessment = assessExcelRow(row, options.periodosCerrados);
    if (assessment.outcome === 'closed') {
      notices.push(assessment.reason);
      continue;
    }
    if (assessment.outcome === 'missing_fiscal') {
      notices.push(assessment.reason);
      saving.push({
        ...source,
        status: 'revisión',
        policy_review_reason: assessment.reason,
      });
      continue;
    }
    saving.push(source);
  }

  const ids = allocateTransactionIds(saving.length);
  const readyWrites: TransactionDraft[] = [];
  for (let i = 0; i < saving.length; i++) {
    const source = saving[i];
    const row = toExcelRowDraft(source);
    if (source.policy_review_reason) {
      readyWrites.push(source);
      continue;
    }
    const assignment = await decideAccount(
      {
        tipo: row.tipo,
        monto: row.monto,
        concepto: row.concepto,
        proveedor: row.proveedor,
        fecha: row.fecha,
        moneda: source.moneda,
      },
      options.accounts,
      options.rules,
      options.classify
    );
    const persisted = await postClassifiedAccrual({
      organizationId,
      draft: toAccrualDraft(row, ids[i], assignment.account_code),
      chart: options.accounts,
      atajoPueBancos: options.atajoPueBancos,
      proposedStatus: assignment.requires_human_approval ? 'revisión' : 'conciliado',
      proposedReason: null,
      subtotal: row.fiscal_subtotal ?? 0,
      iva: row.fiscal_iva ?? 0,
      total: row.monto,
    });
    const reason = persisted.policy_review_reason
      ? excelRowReason(row.rowIndex, persisted.policy_review_reason)
      : null;
    if (persisted.status === 'revisión' && reason) notices.push(reason);
    readyWrites.push({
      ...source,
      status: persisted.status,
      account_name: assignment.account_name,
      account_code: assignment.account_code,
      account_source: assignment.account_source,
      policy_review_reason: reason,
      ...(persisted.asiento_devengo ? { asiento_devengo: persisted.asiento_devengo } : {}),
    });
  }

  const { txCount, productCount } = await commitExcelBatches(
    userId,
    readyWrites,
    products,
    organizationId,
    ids
  );
  await logAuditEntry('BULK_IMPORT_EXCEL', 'transactions', {
    txCount,
    productCount,
    omitted: notices.length,
  });
  return { txCount, productCount, notices };
}
