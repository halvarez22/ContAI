/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PendingActionsSection } from './PendingActionsSection';
import type { PendingActionsReport } from '../../types/pendingActions';

const emptyReport: PendingActionsReport = {
  items: [],
  summary: {
    in_review: 0,
    missing_account: 0,
    pending_reconciliation: 0,
    total: 0,
  },
};

function reportWith(
  category: PendingActionsReport['items'][number]['category'],
  id: string
): PendingActionsReport {
  return {
    items: [
      {
        id,
        fecha: '2026-01-15T12:00:00.000Z',
        concepto: 'Honorarios',
        monto: 1160,
        category,
        reason: category === 'in_review' ? 'Falta el subtotal' : 'Falta la cuenta',
      },
    ],
    summary: {
      in_review: category === 'in_review' ? 1 : 0,
      missing_account: category === 'missing_account' ? 1 : 0,
      pending_reconciliation: category === 'pending_reconciliation' ? 1 : 0,
      total: 1,
    },
  };
}

describe('PendingActionsSection', () => {
  it('muestra el estado vacío del periodo', () => {
    render(
      <PendingActionsSection
        report={emptyReport}
        onOpenTransaction={vi.fn()}
        onReview={vi.fn()}
        onReconcile={vi.fn()}
      />
    );
    expect(
      screen.getByText('No hay acciones pendientes para este periodo. ¡Todo en orden!')
    ).toBeTruthy();
  });

  it('Revisar solo abre la pantalla de transacciones', () => {
    const onReview = vi.fn();
    const onOpenTransaction = vi.fn();
    const onReconcile = vi.fn();
    render(
      <PendingActionsSection
        report={reportWith('in_review', 'rev-1')}
        onOpenTransaction={onOpenTransaction}
        onReview={onReview}
        onReconcile={onReconcile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }));

    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onOpenTransaction).not.toHaveBeenCalled();
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it('Abrir movimiento y Conciliar solo navegan', () => {
    const onOpenTransaction = vi.fn();
    const onReconcile = vi.fn();
    const { rerender } = render(
      <PendingActionsSection
        report={reportWith('missing_account', 'tx-9')}
        onOpenTransaction={onOpenTransaction}
        onReview={vi.fn()}
        onReconcile={onReconcile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir movimiento' }));
    expect(onOpenTransaction).toHaveBeenCalledWith('tx-9');
    expect(onReconcile).not.toHaveBeenCalled();

    rerender(
      <PendingActionsSection
        report={reportWith('pending_reconciliation', 'tx-4')}
        onOpenTransaction={onOpenTransaction}
        onReview={vi.fn()}
        onReconcile={onReconcile}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Conciliar' }));
    expect(onReconcile).toHaveBeenCalledTimes(1);
  });
});
