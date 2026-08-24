import type { ProductDraft, TransactionDraft } from '../lib/excelContaiImport';
import { commitExcelBatches } from './firestoreService';
import { logAuditEntry } from './auditService';

export async function commitExcelImport(
  userId: string,
  txs: TransactionDraft[],
  products: ProductDraft[],
  organizationId: string
): Promise<{ txCount: number; productCount: number }> {
  const { txCount, productCount } = await commitExcelBatches(
    userId,
    txs,
    products,
    organizationId
  );

  await logAuditEntry('BULK_IMPORT_EXCEL', 'transactions', {
    txCount,
    productCount,
  });

  return { txCount, productCount };
}
