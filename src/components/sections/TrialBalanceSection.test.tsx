/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrialBalanceSection } from './TrialBalanceSection';
import { TRIAL_BALANCE_TRUNCATED_HINT, type TrialBalanceReport } from '../../types/financialReports';

const report: TrialBalanceReport = {
  periodKey: '2026-03',
  rows: [],
  anomalies: [],
  total_cargos: 0,
  total_abonos: 0,
  is_balanced: true,
  truncated: true,
  sin_devengo: 1,
};

describe('TrialBalanceSection asientos faltantes', () => {
  it('deshabilita el botón en un periodo cerrado y dice por qué', () => {
    render(
      <TrialBalanceSection
        report={{ ...report, truncated: false }}
        missingJournals={{
          generating: false,
          message: null,
          disabled: true,
          disabledHint: 'Periodo cerrado',
          truncated: false,
          onGenerate: vi.fn(),
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'Generar asientos faltantes' })).toBeDisabled();
    expect(screen.getByText('Periodo cerrado')).toBeTruthy();
  });

  it('muestra la carga, el resultado y el aviso preliminar', () => {
    render(
      <TrialBalanceSection
        report={report}
        missingJournals={{
          generating: true,
          message: 'Se generaron 2 asientos.\n1 quedó en revisión.',
          disabled: false,
          disabledHint: '',
          truncated: true,
          onGenerate: vi.fn(),
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'Generando…' })).toBeDisabled();
    expect(screen.getByText(/Se generaron 2 asientos/)).toBeTruthy();
    expect(screen.getByText(/1 quedó en revisión/)).toBeTruthy();
    expect(screen.getAllByText(TRIAL_BALANCE_TRUNCATED_HINT).length).toBeGreaterThan(0);
  });
});
