/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePolizaExport } from './usePolizaExport';
import type { PolizaTxInput } from '../types/polizaExport';

const eligible: PolizaTxInput = {
  id: '1',
  fecha: '2026-08-01',
  tipo: 'egreso',
  monto: 100,
  account_name: 'Gastos',
  bank_reconciled: true,
  concepto: 'Test',
};

describe('usePolizaExport', () => {
  it('exportDisabled si 0 elegibles y no descarga', () => {
    const download = vi.fn();
    const { result } = renderHook(() =>
      usePolizaExport({
        transactions: [
          { ...eligible, bank_reconciled: false, account_name: '' },
        ],
        organizationId: 'org',
        periodKey: '2026-08',
        downloadTextFile: download,
        audit: vi.fn(),
      })
    );
    expect(result.current.exportDisabled).toBe(true);
    expect(result.current.eligibleCount).toBe(0);

    act(() => {
      result.current.exportPoliza();
    });
    expect(download).not.toHaveBeenCalled();
    expect(result.current.feedback?.variant).toBe('error');
  });

  it('success descarga Blob y audita', () => {
    const download = vi.fn();
    const audit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      usePolizaExport({
        transactions: [eligible],
        organizationId: 'org_main',
        periodKey: '2026-08',
        downloadTextFile: download,
        audit,
      })
    );
    expect(result.current.exportDisabled).toBe(false);

    act(() => {
      result.current.exportPoliza();
    });

    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0]?.[1]).toBe('poliza_ContAI_2026-08.txt');
    expect(String(download.mock.calls[0]?.[0])).toContain('100.00');
    expect(result.current.feedback?.variant).toBe('success');
    expect(audit).toHaveBeenCalled();
  });
});
