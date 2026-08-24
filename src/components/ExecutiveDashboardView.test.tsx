/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ExecutiveDashboardView } from './ExecutiveDashboardView';
import type { ExecutiveKpis, ExecutiveTrendPoint } from '../types/executiveDashboard';

const kpis: ExecutiveKpis = {
  periodoLabel: 'Agosto 2026',
  ivaSaldoNeto: 1600,
  flujoCajaNeto: 5000,
  pctBankReconciled: 50,
  isrEstimadoYtd: 8000,
  txCount: 2,
  bankReconciledCount: 1,
  ingresosPeriodo: 10000,
  egresosPeriodo: 5000,
  warnings: [],
  isEmpty: false,
};

const emptyKpis: ExecutiveKpis = {
  ...kpis,
  txCount: 0,
  bankReconciledCount: 0,
  flujoCajaNeto: 0,
  ingresosPeriodo: 0,
  egresosPeriodo: 0,
  pctBankReconciled: 0,
  isEmpty: true,
  warnings: ['No hay datos para este periodo.'],
};

const trend: ExecutiveTrendPoint[] = [
  { mes: 'Mar 2026', ingresos: 1, egresos: 1 },
  { mes: 'Abr 2026', ingresos: 2, egresos: 1 },
  { mes: 'May 2026', ingresos: 2, egresos: 2 },
  { mes: 'Jun 2026', ingresos: 3, egresos: 2 },
  { mes: 'Jul 2026', ingresos: 3, egresos: 3 },
  { mes: 'Ago 2026', ingresos: 4, egresos: 2 },
];

describe('ExecutiveDashboardView', () => {
  it('renderiza KPIs y dispara briefing', () => {
    const onGenerate = vi.fn();
    render(
      <ExecutiveDashboardView
        kpis={kpis}
        trend={trend}
        disclaimer="Solo informativo"
        briefingLoading={false}
        onGenerateBriefing={onGenerate}
      />
    );
    expect(screen.getByText('Vista ejecutiva')).toBeTruthy();
    expect(screen.getByText('IVA neto (periodo)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Generar borrador ejecutivo/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('empty state deshabilita briefing y muestra alert', () => {
    render(
      <ExecutiveDashboardView
        kpis={emptyKpis}
        trend={trend.map((t) => ({ ...t, ingresos: 0, egresos: 0 }))}
        disclaimer="Solo informativo"
        briefingLoading={false}
        onGenerateBriefing={() => undefined}
      />
    );
    expect(screen.getByText(/No hay datos para este periodo/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Generar borrador ejecutivo/i })
    ).toBeDisabled();
  });

  it('smoke axe sin violaciones graves', async () => {
    const { container } = render(
      <ExecutiveDashboardView
        kpis={kpis}
        trend={trend}
        disclaimer="Solo informativo"
        briefingLoading={false}
        onGenerateBriefing={() => undefined}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
