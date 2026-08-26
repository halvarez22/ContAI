/**
 * @vitest-environment jsdom
 * E8.3: resiliencia de orgBootstrapping ante fallo de bootstrap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const bootstrapUserOrganizations = vi.fn();
const listOrganizationSummaries = vi.fn();

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  onSnapshot: vi.fn((_ref: unknown, onNext: (snap: { data: () => Record<string, unknown> }) => void) => {
    onNext({ data: () => ({}) });
    return vi.fn();
  }),
}));

vi.mock('../services/organizationService', () => ({
  bootstrapUserOrganizations: (...args: unknown[]) =>
    bootstrapUserOrganizations(...args),
  listOrganizationSummaries: (...args: unknown[]) =>
    listOrganizationSummaries(...args),
  createOrganizationForUser: vi.fn(),
  setActiveOrganizationId: vi.fn(),
}));

import { useActiveOrganization } from './useActiveOrganization';

describe('useActiveOrganization (E8.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOrganizationSummaries.mockResolvedValue([]);
  });

  it('resuelve bootstrapping a false si bootstrapUserOrganizations lanza', async () => {
    bootstrapUserOrganizations.mockRejectedValue(
      new Error('Missing or insufficient permissions.')
    );

    const { result } = renderHook(() =>
      useActiveOrganization({
        userId: 'uid_test_1',
        email: 'a@test.com',
        displayName: 'Tester',
      })
    );

    await waitFor(() => {
      expect(result.current.bootstrapping).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toMatch(/permissions|Error al cargar/i);
    expect(bootstrapUserOrganizations).toHaveBeenCalled();
  });

  it('resuelve bootstrapping a false tras bootstrap exitoso', async () => {
    bootstrapUserOrganizations.mockResolvedValue({
      organizationId: 'personal_uid_test_1',
      backfillDone: true,
    });
    listOrganizationSummaries.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useActiveOrganization({
        userId: 'uid_test_1',
        email: 'a@test.com',
        displayName: 'Tester',
      })
    );

    await waitFor(() => {
      expect(result.current.bootstrapping).toBe(false);
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });
});
