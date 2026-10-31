/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { JournalEntry } from '../types/journalEntry';
import type { AutoApprovalTransaction } from '../types/autoApproval';

type ApprovalUpdate = {
  id: string;
  payload: {
    status: string;
    aprobado_por: string;
    aprobado_en: string;
    actualizado_en: string;
  };
};

type ApprovalAudit = {
  organization_id: string;
  periodKey: string;
  threshold: number;
  approved_count: number;
};

const { commitTransactionUpdatesBatch, logAuditEntry } = vi.hoisted(() => ({
  commitTransactionUpdatesBatch: vi.fn(async (_updates: ApprovalUpdate[]) => undefined),
  logAuditEntry: vi.fn(async (_accion: string, _recurso: string, _detalles: ApprovalAudit) => undefined),
}));

vi.mock('../services/firestoreService', () => ({
  commitTransactionUpdatesBatch,
  serverTimestamp: () => 'ts',
}));

vi.mock('../services/auditService', () => ({
  logAuditEntry,
}));

import { useAutoApproval } from './useAutoApproval';

function balanced(id: string): JournalEntry {
  return {
    transaction_id: id,
    tipo: 'egreso',
    fecha: '2026-01-15',
    atajo_pue_bancos: false,
    lines: [
      { account_code: '601.84', account_name: 'Gastos', tipo: 'cargo', monto: 100, concepto: 'Gasto' },
      { account_code: '201.01', account_name: 'Proveedores', tipo: 'abono', monto: 100, concepto: 'Gasto' },
    ],
  };
}

function row(
  partial: Partial<AutoApprovalTransaction> & Pick<AutoApprovalTransaction, 'id'>
): AutoApprovalTransaction {
  return {
    fecha: '2026-01-15T12:00:00.000Z',
    status: 'revisión',
    confidence_score: 0.95,
    asiento_devengo: balanced(partial.id),
    ...partial,
  };
}

describe('useAutoApproval', () => {
  beforeEach(() => {
    commitTransactionUpdatesBatch.mockClear();
    logAuditEntry.mockClear();
  });

  it('no escribe ni audita cuando no hay elegibles', async () => {
    const { result } = renderHook(() =>
      useAutoApproval({
        transactions: [row({ id: 'baja', confidence_score: 0.1 })],
        year: 2026,
        monthIndex: 0,
        threshold: 0.9,
        periodosCerrados: [],
        canWrite: true,
        organizationId: 'org-1',
      })
    );

    await act(async () => {
      await result.current.run();
    });

    expect(commitTransactionUpdatesBatch).not.toHaveBeenCalled();
    expect(logAuditEntry).not.toHaveBeenCalled();
  });

  it('guarda solo estado, marca y fechas, y la auditoría no lleva identificadores', async () => {
    const { result } = renderHook(() =>
      useAutoApproval({
        transactions: [
          row({ id: 'enero' }),
          row({ id: 'febrero', fecha: '2026-02-15T12:00:00.000Z' }),
        ],
        year: 2026,
        monthIndex: 0,
        threshold: 0.9,
        periodosCerrados: [],
        canWrite: true,
        organizationId: 'org-1',
      })
    );

    await act(async () => {
      await result.current.run();
    });

    expect(commitTransactionUpdatesBatch).toHaveBeenCalledTimes(1);
    const updates = commitTransactionUpdatesBatch.mock.calls[0]?.[0] ?? [];
    expect(updates.map((item) => item.id)).toEqual(['enero']);
    expect(Object.keys(updates[0]?.payload ?? {}).sort()).toEqual([
      'actualizado_en',
      'aprobado_en',
      'aprobado_por',
      'status',
    ]);
    expect(updates[0]?.payload).toMatchObject({
      status: 'conciliado',
      aprobado_por: 'auto_confidence',
    });
    expect(updates[0]?.payload).not.toHaveProperty('account_code');
    expect(updates[0]?.payload).not.toHaveProperty('asiento_devengo');

    expect(logAuditEntry).toHaveBeenCalledWith(
      'APROBACION_AUTO_CONFIDENCE_EJECUTADA',
      'transactions',
      {
        organization_id: 'org-1',
        periodKey: '2026-01',
        threshold: 0.9,
        approved_count: 1,
      }
    );
    const detalles = logAuditEntry.mock.calls[0]?.[2];
    expect(detalles).not.toHaveProperty('transaction_ids');
  });
});
