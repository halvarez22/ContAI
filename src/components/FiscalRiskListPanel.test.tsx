/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { FiscalRiskListPanel } from './FiscalRiskListPanel';

vi.mock('../hooks/useFiscalRiskList', () => ({
  useFiscalRiskList: () => ({
    phase: 'idle' as const,
    feedback: null as { variant: 'info' | 'success' | 'warning' | 'error'; message: string } | null,
    parseErrors: [] as import('../types/fiscalRisk').FiscalRiskParseError[],
    handleFile: vi.fn(),
    uploadHint: 'hint',
    canUpload: true,
    reset: vi.fn(),
    lastVersion: null as number | null,
    lastRfcCount: null as number | null,
  }),
}));

describe('FiscalRiskListPanel', () => {
  it('renderiza título y botón de carga', () => {
    render(
      <FiscalRiskListPanel
        organizationId="org_main"
        userId="u1"
        canUpload
      />
    );
    expect(screen.getByText(/Lista de riesgo fiscal 69-B/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Cargar CSV \/ Excel/i })
    ).toBeTruthy();
  });

  it('smoke axe', async () => {
    const { container } = render(
      <FiscalRiskListPanel
        organizationId="org_main"
        userId="u1"
        canUpload
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
