/**
 * Único punto de escrituras Firestore para ContAI.
 * Lecturas / onSnapshot permanecen en App.
 * organizationId es obligatorio en escrituras de negocio (E8.1).
 */

import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ProductDraft, TransactionDraft } from '../lib/excelContaiImport';

const BATCH_CHUNK = 400;

export async function createUserProfile(
  uid: string,
  data: { email: string | null; nombre: string; role?: string }
): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    email: data.email,
    role: data.role ?? 'admin',
    nombre: data.nombre,
    activo: true,
    creado_en: serverTimestamp(),
  });
}

/** @deprecated Prefer updateOrganizationSettings (E8.1). Conservado para compat. */
export async function updateUserSettings(
  uid: string,
  data: {
    cuentas_contables: string[];
    empresa_nombre: string;
    empresa_rfc: string;
  }
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      ...data,
      actualizado_en: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createProduct(
  userId: string,
  organizationId: string,
  data: { codigo: string; descripcion: string; unidad: string }
): Promise<void> {
  await addDoc(collection(db, 'products'), {
    organization_id: organizationId,
    usuario_id: userId,
    codigo: data.codigo,
    descripcion: data.descripcion,
    unidad: data.unidad,
    creado_en: serverTimestamp(),
  });
}

export async function createInventoryMovement(
  userId: string,
  organizationId: string,
  data: {
    product_id: string;
    tipo: string;
    cantidad: number;
    costo_unitario: number;
    fecha: string;
    nota: string;
  }
): Promise<void> {
  await addDoc(collection(db, 'inventory_movements'), {
    organization_id: organizationId,
    usuario_id: userId,
    product_id: data.product_id,
    tipo: data.tipo,
    cantidad: data.cantidad,
    costo_unitario: data.costo_unitario,
    fecha: data.fecha,
    nota: data.nota,
    creado_en: serverTimestamp(),
  });
}

export async function createTransaction(
  payload: DocumentData
): Promise<{ id: string }> {
  const docRef = await addDoc(collection(db, 'transactions'), {
    ...payload,
    creado_en: serverTimestamp(),
  });
  return { id: docRef.id };
}

export async function setTransaction(
  id: string,
  payload: DocumentData
): Promise<void> {
  await setDoc(doc(db, 'transactions', id), payload);
}

export async function createRecurring(payload: DocumentData): Promise<void> {
  await addDoc(collection(db, 'recurring_transactions'), payload);
}

export async function setRecurring(
  id: string,
  payload: DocumentData,
  options?: { merge?: boolean }
): Promise<void> {
  if (options?.merge) {
    await setDoc(doc(db, 'recurring_transactions', id), payload, { merge: true });
  } else {
    await setDoc(doc(db, 'recurring_transactions', id), payload);
  }
}

/** Commit Excel drafts. organizationId obligatorio. */
export async function commitExcelBatches(
  userId: string,
  txs: TransactionDraft[],
  products: ProductDraft[],
  organizationId: string
): Promise<{ txCount: number; productCount: number }> {
  if (!organizationId) {
    throw new Error('organizationId es obligatorio para importar Excel.');
  }
  const byCodigo = new Map<string, ProductDraft>();
  for (const p of products) byCodigo.set(p.codigo, p);
  const uniqueProducts = [...byCodigo.values()];

  let productCount = 0;
  for (let i = 0; i < uniqueProducts.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    const chunk = uniqueProducts.slice(i, i + BATCH_CHUNK);
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
  for (let i = 0; i < txs.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    const chunk = txs.slice(i, i + BATCH_CHUNK);
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

  return { txCount, productCount };
}

export async function commitCfdiTransactionBatch(
  drafts: Array<{ payload: DocumentData }>
): Promise<{ ids: string[] }> {
  const ids: string[] = [];
  for (let i = 0; i < drafts.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    const chunk = drafts.slice(i, i + BATCH_CHUNK);
    const chunkRefs = chunk.map(() => doc(collection(db, 'transactions')));
    for (let j = 0; j < chunk.length; j++) {
      batch.set(chunkRefs[j], {
        ...chunk[j].payload,
        creado_en: serverTimestamp(),
      });
      ids.push(chunkRefs[j].id);
    }
    await batch.commit();
  }
  return { ids };
}

export async function commitTransactionUpdatesBatch(
  updates: Array<{ id: string; payload: DocumentData }>
): Promise<void> {
  for (let i = 0; i < updates.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    const chunk = updates.slice(i, i + BATCH_CHUNK);
    for (const u of chunk) {
      batch.set(doc(db, 'transactions', u.id), u.payload, { merge: true });
    }
    await batch.commit();
  }
}

export { serverTimestamp, BATCH_CHUNK };
