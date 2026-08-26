/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { PaymentApplicationPanel } from './PaymentApplicationPanel';
import type { PaymentTargetCandidate } from '../hooks/usePaymentApplications';

const candidates: PaymentTargetCandidate[] = [
  {
    id: 'tx1',
    concepto: 'Factura abierta',
    fecha: '2026-01-10T12:00:00.000Z',
    monto: 600,
    saldoPendiente: 600,
    montoOriginal: 600,
    appliedPaymentAmount: 0,
    closedPeriod: false,
  },
  {
    id: 'tx-closed',
    concepto: 'Factura cerrada',
    fecha: '2025-12-15T12:00:00.000Z',
    monto: 200,
    saldoPendiente: 200,
    montoOriginal: 200,
    appliedPaymentAmount: 0,
    closedPeriod: true,
  },
];

describe('PaymentApplicationPanel', () => {
  it('smoke: restante origen y factura cerrada deshabilitada', () => {
    const draft = new Map<string, number>([['tx1', 400]]);
    render(
      <PaymentApplicationPanel
        sourceLabel="Pago CFDI P · uuid"
        sourceAmount={1000}
        candidates={candidates}
        query=""
        onQueryChange={vi.fn()}
        draftLegs={draft}
        draftAssigned={400}
        onToggleLeg={vi.fn()}
        onChangeLegAmount={vi.fn()}
        canConfirm={false}
        confirming={false}
        feedback={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/Aplicar pago a facturas/i)).toBeTruthy();
    expect(screen.getByText(/Restante del origen/i)).toBeTruthy();
    expect(screen.getByText(/Factura en periodo cerrado/i)).toBeTruthy();
    const closedCheckbox = screen.getByRole('checkbox', {
      name: /Seleccionar factura Factura cerrada/i,
    });
    expect(closedCheckbox).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Confirmar aplicación/i })
    ).toBeDisabled();
  });

  it('smoke axe sin violaciones graves', async () => {
    const { container } = render(
      <PaymentApplicationPanel
        sourceLabel="Pago manual"
        sourceAmount={100}
        candidates={candidates}
        query=""
        onQueryChange={vi.fn()}
        draftLegs={new Map()}
        draftAssigned={0}
        onToggleLeg={vi.fn()}
        onChangeLegAmount={vi.fn()}
        canConfirm={false}
        confirming={false}
        feedback={{
          variant: 'info',
          message: 'Este comprobante ya fue procesado previamente.',
        }}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
