/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';

type WrittenUpdate = {
  id: string;
  payload: {
    status: string;
    aprobado_por: { kind: 'delete' };
    aprobado_en: { kind: 'delete' };
  };
};

const { commitTransactionUpdatesBatch, logAuditEntry, deleteSentinel } = vi.hoisted(() => {
  const sentinel = { kind: 'delete' as const };
  return {
    deleteSentinel: sentinel,
    commitTransactionUpdatesBatch: vi.fn(async (_updates: WrittenUpdate[]) => undefined),
    logAuditEntry: vi.fn(
      async (_accion: string, _recurso: string, _detalles: { usuario_id: string }) => undefined
    ),
  };
});

vi.mock('../services/firestoreService', () => ({
  commitTransactionUpdatesBatch,
  deleteField: () => deleteSentinel,
  serverTimestamp: () => 'ts',
}));

vi.mock('../services/auditService', () => ({
  logAuditEntry,
}));

import { useReconciledReassignment } from './useReconciledReassignment';

const base = {
  transactionId: 'tx-1',
  fecha: '2026-01-15T12:00:00.000Z',
  status: 'conciliado' as const,
  tipo: 'egreso',
  monto: 1160,
  fiscalSubtotal: 1000,
  fiscalIva: 160,
  accountCode: '601.84',
  concepto: 'Servicio',
  proveedor: 'Proveedor',
  confidenceScore: 0.95,
  canManage: true,
  atajoPueBancos: false,
  periodosCerrados: [] as string[],
  chart: getChartOfAccountsSeed(),
  organizationId: 'org-1',
  actorUserId: 'admin-1',
};

describe('useReconciledReassignment', () => {
  beforeEach(() => {
    commitTransactionUpdatesBatch.mockClear();
    logAuditEntry.mockClear();
  });

  it('no escribe cuando el usuario no administra la organización', async () => {
    const { result } = renderHook(() =>
      useReconciledReassignment({ ...base, canManage: false, actorUserId: 'contador-1' })
    );

    await act(async () => {
      await result.current.save('601.49');
    });

    expect(commitTransactionUpdatesBatch).not.toHaveBeenCalled();
    expect(logAuditEntry).not.toHaveBeenCalled();
  });

  it('borra la aprobación anterior, no toca la confianza y audita al actor', async () => {
    const { result } = renderHook(() => useReconciledReassignment(base));

    await act(async () => {
      await result.current.save('601.49');
    });

    const payload = commitTransactionUpdatesBatch.mock.calls[0]?.[0]?.[0]?.payload;
    expect(payload?.aprobado_por).toEqual(deleteSentinel);
    expect(payload?.aprobado_en).toEqual(deleteSentinel);
    expect(payload).not.toHaveProperty('confidence_score');
    expect(payload?.status).toBe('revisión');
    expect(logAuditEntry).toHaveBeenCalledWith(
      'RECLASIFICACION_CONCILIADO_EJECUTADA',
      'transactions',
      {
        organization_id: 'org-1',
        transaction_id: 'tx-1',
        old_account_code: '601.84',
        new_account_code: '601.49',
        usuario_id: 'admin-1',
        fecha: '2026-01-15T12:00:00.000Z',
      }
    );
  });
});
