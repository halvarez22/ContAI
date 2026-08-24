/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardMode } from './useDashboardMode';
import { DASHBOARD_MODE_STORAGE_KEY } from '../types/dashboardMode';

describe('useDashboardMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('default operativo', () => {
    const { result } = renderHook(() => useDashboardMode());
    expect(result.current.mode).toBe('operativo');
  });

  it('persiste en localStorage al cambiar', () => {
    const { result } = renderHook(() => useDashboardMode());
    act(() => {
      result.current.setMode('ejecutivo');
    });
    expect(result.current.mode).toBe('ejecutivo');
    expect(localStorage.getItem(DASHBOARD_MODE_STORAGE_KEY)).toBe('ejecutivo');
  });

  it('lee valor almacenado al montar', () => {
    localStorage.setItem(DASHBOARD_MODE_STORAGE_KEY, 'ejecutivo');
    const { result } = renderHook(() => useDashboardMode());
    expect(result.current.mode).toBe('ejecutivo');
  });
});
