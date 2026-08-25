/**
 * Persistencia de bank_movements + bank_allocations (E9.1).
 * Validación de remaining previa al writeBatch (MVP concurrency).
 */

import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { roundMoney } from './taxCalculatorService';
import { commitTransactionUpdatesBatch } from './firestoreService';
import { logAuditEntry } from './auditService';
import type { ParsedBankRow } from '../types/bankReconciliation';
import type { BankAllocationDraft } from '../types/bankAllocation';
import {
  assertValidAllocationsAgainstBank,
  bankMovementFingerprint,
  deriveBankReconcileStatus,
  moneyWithinPct,
  sumAllocationAmounts,
  txRemainingAmount,
} from '../types/bankAllocation';

const MOVEMENTS = 'bank_movements';
const ALLOCATIONS = 'bank_allocations';

export type ConfirmSplitInput = {
  organizationId: string;
  userId: string;
  bankRow: ParsedBankRow;
  bankRowIndex: number;
  allocations: BankAllocationDraft[];
  score: number;
  /** remaining map mutado: txId → remaining after this confirm */
  remainingByTx: Map<string, number>;
  /** monto total de cada TX (para status) */
  montoByTx: Map<string, number>;
  /** allocated acumulado previo (mutado) */
  allocatedByTx: Map<string, number>;
};

export type ConfirmSplitResult = {
  ok: boolean;
  error?: string;
  movementId?: string;
  allocationCount?: number;
};

function truncateDesc(desc: string, max = 255): string {
  const t = desc.trim();
  return t.length <= max ? t : t.slice(0, max);
}

/**
 * Valida allocations contra remaining y prepara payloads.
 * No escribe — solo valida (concurrency: pre-check MVP).
 */
export function validateSplitAgainstRemaining(
  bankAmount: number,
  allocations: BankAllocationDraft[],
  remainingByTx: Map<string, number>
): { ok: true; normalized: BankAllocationDraft[] } | { ok: false; error: string } {
  const sumCheck = assertValidAllocationsAgainstBank({
    bankAmount,
    allocations,
  });
  if (sumCheck.ok === false) {
    return { ok: false, error: sumCheck.error };
  }

  const normalized = allocations.map((a) => ({
    transactionId: a.transactionId,
    amount: roundMoney(a.amount),
  }));

  for (const a of normalized) {
    const rem = roundMoney(remainingByTx.get(a.transactionId) ?? 0);
    if (a.amount > rem + 0.005) {
      return {
        ok: false,
        error: `Sobreasigna TX ${a.transactionId}: ${a.amount} > remaining ${rem}`,
      };
    }
  }
  return { ok: true, normalized };
}

export async function commitBankSplitAllocation(
  input: ConfirmSplitInput
): Promise<ConfirmSplitResult> {
  const validated = validateSplitAgainstRemaining(
    input.bankRow.monto,
    input.allocations,
    input.remainingByTx
  );
  if (validated.ok === false) {
    return { ok: false, error: validated.error };
  }
  const allocations = validated.normalized;
  const sum = sumAllocationAmounts(allocations);
  const bankAmount = roundMoney(input.bankRow.monto);
  const closed = moneyWithinPct(sum, bankAmount);

  const movementRef = doc(collection(db, MOVEMENTS));
  const fingerprint = bankMovementFingerprint(input.bankRow);

  const batch = writeBatch(db);
  batch.set(movementRef, {
    organization_id: input.organizationId,
    fecha: input.bankRow.fecha,
    monto: bankAmount,
    descripcion: truncateDesc(input.bankRow.descripcion),
    fingerprint,
    status: closed ? 'closed' : 'allocated',
    usuario_id: input.userId,
    creado_en: serverTimestamp(),
    actualizado_en: serverTimestamp(),
  } satisfies DocumentData);

  for (const a of allocations) {
    const allocRef = doc(collection(db, ALLOCATIONS));
    batch.set(allocRef, {
      organization_id: input.organizationId,
      bank_movement_id: movementRef.id,
      transaction_id: a.transactionId,
      amount: a.amount,
      usuario_id: input.userId,
      creado_en: serverTimestamp(),
    });
  }

  await batch.commit();

  const txUpdates: Array<{ id: string; payload: DocumentData }> = [];
  for (const a of allocations) {
    const prev = roundMoney(input.allocatedByTx.get(a.transactionId) ?? 0);
    const nextAllocated = roundMoney(prev + a.amount);
    const monto = roundMoney(
      input.montoByTx.get(a.transactionId) ?? nextAllocated
    );
    const status = deriveBankReconcileStatus(monto, nextAllocated);
    input.allocatedByTx.set(a.transactionId, nextAllocated);
    input.remainingByTx.set(
      a.transactionId,
      txRemainingAmount(monto, nextAllocated)
    );
    txUpdates.push({
      id: a.transactionId,
      payload: {
        bank_reconciled_amount: nextAllocated,
        bank_reconcile_status: status,
        bank_reconciled: status === 'full',
        bank_match_score: Math.max(0, Math.min(100, Number(input.score) || 0)),
        bank_match_desc: truncateDesc(input.bankRow.descripcion),
        actualizado_en: serverTimestamp(),
      },
    });
  }

  await commitTransactionUpdatesBatch(txUpdates);

  await logAuditEntry('BANK_SPLIT_CONFIRMED', 'bank_movements', {
    movementId: movementRef.id,
    bankRowIndex: input.bankRowIndex,
    allocationCount: allocations.length,
    sum,
    organization_id: input.organizationId,
  });

  return {
    ok: true,
    movementId: movementRef.id,
    allocationCount: allocations.length,
  };
}

/** Confirma varias filas en secuencia (remaining compartido). */
export async function confirmBankAllocationsBatch(params: {
  organizationId: string;
  userId: string;
  items: Array<{
    bankRow: ParsedBankRow;
    bankRowIndex: number;
    allocations: BankAllocationDraft[];
    score: number;
  }>;
  ledger: Array<{
    id: string;
    monto: number;
    bank_reconciled_amount?: number;
  }>;
}): Promise<{ confirmed: number; errors: string[] }> {
  const remainingByTx = new Map<string, number>();
  const montoByTx = new Map<string, number>();
  const allocatedByTx = new Map<string, number>();

  for (const tx of params.ledger) {
    const monto = roundMoney(tx.monto);
    const allocated = roundMoney(tx.bank_reconciled_amount ?? 0);
    montoByTx.set(tx.id, monto);
    allocatedByTx.set(tx.id, allocated);
    remainingByTx.set(tx.id, txRemainingAmount(monto, allocated));
  }

  let confirmed = 0;
  const errors: string[] = [];

  for (const item of params.items) {
    const result = await commitBankSplitAllocation({
      organizationId: params.organizationId,
      userId: params.userId,
      bankRow: item.bankRow,
      bankRowIndex: item.bankRowIndex,
      allocations: item.allocations,
      score: item.score,
      remainingByTx,
      montoByTx,
      allocatedByTx,
    });
    if (result.ok) {
      confirmed += 1;
    } else {
      errors.push(
        `Fila ${item.bankRowIndex + 1}: ${result.error || 'error'}`
      );
    }
  }

  return { confirmed, errors };
}
