/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { CatalogAccount } from '../types/chartOfAccounts';
import type { JournalEntry } from '../types/journalEntry';

type LineUpdate = {
  id: string;
  payload: {
    asiento_devengo: JournalEntry;
    actualizado_en: string;
  };
};

type LineAudit = {
  organization_id: string;
  transaction_id: string;
  line_index: number;
  old_account_code: string;
  new_account_code: string;
};

const { commitTransactionUpdatesBatch, logAuditEntry } = vi.hoisted(() => ({
  commitTransactionUpdatesBatch: vi.fn(async (_updates: LineUpdate[]) => undefined),
  logAuditEntry: vi.fn(async (_accion: string, _recurso: string, _detalles: LineAudit) => undefined),
}));

vi.mock('../services/firestoreService', () => ({
  commitTransactionUpdatesBatch,
  serverTimestamp: () => 'ts',
}));

vi.mock('../services/auditService', () => ({
  logAuditEntry,
}));

import { useLineReassignment } from './useLineReassignment';

const gasto: CatalogAccount = {
  code: '601.84',
  name: 'Gastos Operativos',
  naturaleza: 'gasto',
  activa: true,
};
const viaticos: CatalogAccount = {
  code: '601.49',
  name: 'Viáticos y Viajes',
  naturaleza: 'gasto',
  activa: true,
};

const current: JournalEntry = {
  transaction_id: 'tx-1',
  tipo: 'egreso',
  fecha: '2026-01-15',
  atajo_pue_bancos: false,
  lines: [
    { account_code: '601.84', account_name: 'Gastos Operativos', tipo: 'cargo', monto: 100, concepto: 'Servicio' },
    { account_code: '201.01', account_name: 'Proveedores', tipo: 'abono', monto: 100, concepto: 'Servicio' },
  ],
};

describe('useLineReassignment', () => {
  beforeEach(() => {
    commitTransactionUpdatesBatch.mockClear();
    logAuditEntry.mockClear();
  });

  it('no escribe cuando el movimiento está conciliado', async () => {
    const { result } = renderHook(() =>
      useLineReassignment({
        transactionId: 'tx-1',
        status: 'conciliado',
        fecha: '2026-01-15T12:00:00.000Z',
        periodosCerrados: [],
        chart: [gasto, viaticos],
        canWrite: true,
        organizationId: 'org-1',
      })
    );

    await act(async () => {
      await result.current.save(0, '601.49', current);
    });

    expect(commitTransactionUpdatesBatch).not.toHaveBeenCalled();
    expect(logAuditEntry).not.toHaveBeenCalled();
  });

  it('guarda solo el asiento y audita sin RFC ni importes', async () => {
    const { result } = renderHook(() =>
      useLineReassignment({
        transactionId: 'tx-1',
        status: 'revisión',
        fecha: '2026-01-15T12:00:00.000Z',
        periodosCerrados: [],
        chart: [gasto, viaticos],
        canWrite: true,
        organizationId: 'org-1',
      })
    );

    await act(async () => {
      await result.current.save(0, '601.49', current);
    });

    const updates = commitTransactionUpdatesBatch.mock.calls[0]?.[0] ?? [];
    expect(Object.keys(updates[0]?.payload ?? {}).sort()).toEqual(['actualizado_en', 'asiento_devengo']);
    expect(updates[0]?.payload).not.toHaveProperty('account_code');
    expect(updates[0]?.payload).not.toHaveProperty('status');
    expect(logAuditEntry).toHaveBeenCalledWith('CUENTA_LINEA_REASIGNADA', 'transactions', {
      organization_id: 'org-1',
      transaction_id: 'tx-1',
      line_index: 0,
      old_account_code: '601.84',
      new_account_code: '601.49',
    });
    expect(logAuditEntry.mock.calls[0]?.[2]).not.toHaveProperty('rfc');
  });
});
