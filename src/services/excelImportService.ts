import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { ProductDraft, TransactionDraft } from '../lib/excelContaiImport';
import { logAuditEntry } from './auditService';

const CHUNK = 400;

export async function commitExcelImport(
  userId: string,
  txs: TransactionDraft[],
  products: ProductDraft[],
  organizationId = 'org_main'
): Promise<{ txCount: number; productCount: number }> {
  const byCodigo = new Map<string, ProductDraft>();
  for (const p of products) byCodigo.set(p.codigo, p);
  const uniqueProducts = [...byCodigo.values()];

  let productCount = 0;
  for (let i = 0; i < uniqueProducts.length; i += CHUNK) {
    const batch = writeBatch(db);
    const chunk = uniqueProducts.slice(i, i + CHUNK);
    for (const p of chunk) {
      const ref = doc(collection(db, 'products'));
      batch.set(ref, {
        organization_id: organizationId,
        usuario_id: userId,
        codigo: p.codigo,
        descripcion: p.descripcion,
        unidad: p.unidad,
        creado_en: serverTimestamp(),
      });
    }
    await batch.commit();
    productCount += chunk.length;
  }

  let txCount = 0;
  for (let i = 0; i < txs.length; i += CHUNK) {
    const batch = writeBatch(db);
    const chunk = txs.slice(i, i + CHUNK);
    for (const t of chunk) {
      const ref = doc(collection(db, 'transactions'));
      batch.set(ref, {
        organization_id: organizationId,
        usuario_id: userId,
        tipo: t.tipo,
        monto: t.monto,
        moneda: t.moneda,
        concepto: t.concepto,
        proveedor: t.proveedor,
        fecha: t.fecha,
        status: t.status,
        tags: t.tags,
        account_source: 'import',
        ...(t.iva_tasa !== undefined ? { iva_tasa: t.iva_tasa } : {}),
        ...(t.fiscal_subtotal !== undefined ? { fiscal_subtotal: t.fiscal_subtotal } : {}),
        ...(t.fiscal_iva !== undefined ? { fiscal_iva: t.fiscal_iva } : {}),
        creado_en: serverTimestamp(),
      });
    }
    await batch.commit();
    txCount += chunk.length;
  }

  await logAuditEntry('BULK_IMPORT_EXCEL', 'transactions', {
    txCount,
    productCount,
  });

  return { txCount, productCount };
}
