/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFiscalRiskList } from './useFiscalRiskList';
import type { FiscalRiskIndex } from '../types/fiscalRisk';

const ORG = 'org_main';
const USER = 'u1';

describe('useFiscalRiskList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('no llama persistencia si canUpload=false', async () => {
    const upsert = vi.fn();
    const loadIndex = vi.fn();
    const { result } = renderHook(() =>
      useFiscalRiskList({
        organizationId: ORG,
        userId: USER,
        canUpload: false,
        upsert,
        loadIndex,
        confirmReplace: () => true,
      })
    );

    const file = new File(['RFC\nXAXX010101000'], 'lista.csv', {
      type: 'text/csv',
    });

    await act(async () => {
      await result.current.handleFile(file);
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(loadIndex).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('error');
  });

  it('success: upsert + loadIndex + onPublished', async () => {
    const index: FiscalRiskIndex = {
      rfcs: new Set(['XAXX010101000']),
      version: 'v_1',
      rfcCount: 1,
    };
    const upsert = vi.fn().mockResolvedValue({ version: 'v_1', rfcCount: 1 });
    const loadIndex = vi.fn().mockResolvedValue(index);
    const onPublished = vi.fn();

    const { result } = renderHook(() =>
      useFiscalRiskList({
        organizationId: ORG,
        userId: USER,
        canUpload: true,
        upsert,
        loadIndex,
        onPublished,
        confirmReplace: () => true,
      })
    );

    const file = new File(['RFC\nXAXX010101000'], 'lista.csv', {
      type: 'text/csv',
    });

    await act(async () => {
      await result.current.handleFile(file);
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(loadIndex).toHaveBeenCalledWith(ORG);
    expect(onPublished).toHaveBeenCalledWith(index);
    expect(result.current.phase).toBe('success');
    expect(result.current.lastRfcCount).toBe(1);
  });

  it('cancel confirm → idle sin upsert', async () => {
    const upsert = vi.fn();
    const { result } = renderHook(() =>
      useFiscalRiskList({
        organizationId: ORG,
        userId: USER,
        canUpload: true,
        upsert,
        loadIndex: vi.fn(),
        confirmReplace: () => false,
      })
    );

    const file = new File(['RFC\nXAXX010101000'], 'lista.csv', {
      type: 'text/csv',
    });

    await act(async () => {
      await result.current.handleFile(file);
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
  });
});
