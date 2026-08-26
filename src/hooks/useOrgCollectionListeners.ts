/**
 * Listeners de colecciones por organización (H1).
 * Ventana YTD en transactions; cleanup al cambiar org / periodYear.
 * Sin JSX.
 */

import { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  AUDIT_LOGS_LIMIT,
  INVENTORY_MOVEMENTS_LIMIT,
  RECURRING_LIMIT,
  TRANSACTIONS_YTD_LIMIT,
  ytdStartIso,
} from '../lib/firestoreWindows';

export type OrgListenerDoc = { id: string; [key: string]: any };

export type UseOrgCollectionListenersParams = {
  userId: string | undefined;
  organizationId: string | null;
  periodYear: number;
};

export function useOrgCollectionListeners(
  params: UseOrgCollectionListenersParams
): {
  transactions: OrgListenerDoc[];
  auditLogs: OrgListenerDoc[];
  recurringTransactions: OrgListenerDoc[];
  products: OrgListenerDoc[];
  inventoryMovements: OrgListenerDoc[];
  transactionsTruncated: boolean;
} {
  const { userId, organizationId, periodYear } = params;

  const [transactions, setTransactions] = useState<OrgListenerDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<OrgListenerDoc[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<
    OrgListenerDoc[]
  >([]);
  const [products, setProducts] = useState<OrgListenerDoc[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<
    OrgListenerDoc[]
  >([]);
  const [transactionsTruncated, setTransactionsTruncated] = useState(false);

  useEffect(() => {
    if (!userId || !organizationId) {
      setTransactions([]);
      setAuditLogs([]);
      setRecurringTransactions([]);
      setProducts([]);
      setInventoryMovements([]);
      setTransactionsTruncated(false);
      return;
    }

    if (import.meta.env.DEV) {
      console.debug(
        '[useOrgCollectionListeners] subscribe',
        { organizationId, periodYear, userId }
      );
    }

    const ytdStart = ytdStartIso(periodYear);

    const qTransactions = query(
      collection(db, 'transactions'),
      where('organization_id', '==', organizationId),
      where('fecha', '>=', ytdStart),
      orderBy('fecha', 'desc'),
      limit(TRANSACTIONS_YTD_LIMIT)
    );
    const unsubTransactions = onSnapshot(
      qTransactions,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as OrgListenerDoc[];
        setTransactions(data);
        setTransactionsTruncated(snapshot.size >= TRANSACTIONS_YTD_LIMIT);
      },
      (error) => {
        console.error('No se pudieron leer transacciones (permisos):', error);
        setTransactions([]);
        setTransactionsTruncated(false);
      }
    );

    const qLogs = query(
      collection(db, 'audit_logs'),
      where('usuario_id', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(AUDIT_LOGS_LIMIT)
    );
    const unsubLogs = onSnapshot(
      qLogs,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as OrgListenerDoc[];
        setAuditLogs(data);
      },
      (error) => {
        console.error('No se pudo leer bitácora (permisos):', error);
        setAuditLogs([]);
      }
    );

    const qRecurring = query(
      collection(db, 'recurring_transactions'),
      where('organization_id', '==', organizationId),
      orderBy('creado_en', 'desc'),
      limit(RECURRING_LIMIT)
    );
    const unsubRecurring = onSnapshot(
      qRecurring,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as OrgListenerDoc[];
        setRecurringTransactions(data);
      },
      (error) => {
        console.error('No se pudieron leer recurrentes (permisos):', error);
        setRecurringTransactions([]);
      }
    );

    const qProducts = query(
      collection(db, 'products'),
      where('organization_id', '==', organizationId)
    );
    const unsubProducts = onSnapshot(
      qProducts,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as OrgListenerDoc[];
        data.sort((a, b) =>
          String(a.codigo ?? '').localeCompare(String(b.codigo ?? ''))
        );
        setProducts(data);
      },
      () => setProducts([])
    );

    const qInv = query(
      collection(db, 'inventory_movements'),
      where('organization_id', '==', organizationId),
      orderBy('fecha', 'desc'),
      limit(INVENTORY_MOVEMENTS_LIMIT)
    );
    const unsubInv = onSnapshot(
      qInv,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as OrgListenerDoc[];
        setInventoryMovements(data);
      },
      () => setInventoryMovements([])
    );

    return () => {
      if (import.meta.env.DEV) {
        console.debug(
          '[useOrgCollectionListeners] unsubscribe',
          { organizationId, periodYear }
        );
      }
      unsubTransactions();
      unsubLogs();
      unsubRecurring();
      unsubProducts();
      unsubInv();
    };
  }, [userId, organizationId, periodYear]);

  return {
    transactions,
    auditLogs,
    recurringTransactions,
    products,
    inventoryMovements,
    transactionsTruncated,
  };
}
