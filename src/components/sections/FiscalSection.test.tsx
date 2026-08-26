/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { FiscalSection } from './FiscalSection';
import type { TaxPreview } from '../../types/taxPreview';

vi.mock('../TaxPreviewCard', () => ({
  TaxPreviewCard: () => <div data-testid="tax-preview">TaxPreview</div>,
}));

vi.mock('../PaymentApplicationsCard', () => ({
  PaymentApplicationsCard: () => (
    <div data-testid="payment-applications">PaymentApplications</div>
  ),
}));

const preview: TaxPreview = {
  periodoLabel: 'Agosto 2026',
  year: 2026,
  monthIndex: 7,
  disclaimer: 'Estimación interna.',
  iva: {
    trasladado: 0,
    acreditable: 0,
    saldoNeto: 0,
    porTasaIngreso: {},
    porTasaEgresoAcreditable: {},
    lineasSinDesglose: 0,
  },
  isr: {
    ingresosAcumulablesYtd: 0,
    deduccionesYtd: 0,
    baseGravableYtd: 0,
    isrEstimado: 0,
    detalleTramo: '',
    mesAplicado: 7,
    nota: '',
  },
  warnings: [],
};

describe('FiscalSection', () => {
  it('renderiza cierre e import CFDI', () => {
    render(
      <FiscalSection
        taxPreview={preview}
        periodLabel="2026-08"
        periodoActualCerrado={false}
        onTogglePeriodo={vi.fn()}
        onOpenCfdiImport={vi.fn()}
      />
    );
    expect(screen.getByText(/Administración fiscal/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cerrar periodo/i })).toBeTruthy();
    expect(screen.getByTestId('tax-preview')).toBeTruthy();
  }, 15000);

  it('muestra card de aplicar pagos cuando hay org/user', () => {
    render(
      <FiscalSection
        taxPreview={preview}
        periodLabel="2026-08"
        periodoActualCerrado={false}
        onTogglePeriodo={vi.fn()}
        onOpenCfdiImport={vi.fn()}
        organizationId="org_main"
        userId="u1"
        periodosCerrados={[]}
        paymentLedger={[]}
      />
    );
    expect(screen.getByTestId('payment-applications')).toBeTruthy();
  });

  it('smoke axe', async () => {
    const { container } = render(
      <FiscalSection
        taxPreview={preview}
        periodLabel="2026-08"
        periodoActualCerrado={true}
        onTogglePeriodo={vi.fn()}
        onOpenCfdiImport={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
