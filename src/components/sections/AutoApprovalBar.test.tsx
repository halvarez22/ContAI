/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AutoApprovalBar } from './AutoApprovalBar';

describe('AutoApprovalBar', () => {
  it('muestra el conteo y deja el botón deshabilitado si no hay elegibles', () => {
    const onApprove = vi.fn();
    render(
      <AutoApprovalBar
        approvedCount={0}
        threshold={0.9}
        disabled
        disabledHint="No hay movimientos de este mes que cumplan el umbral."
        busy={false}
        onApprove={onApprove}
      />
    );

    expect(
      screen.getByText('Se aprobarán automáticamente 0 transacciones con confianza ≥ 90%.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprobar por confianza' })).toBeDisabled();
    expect(screen.getByText('No hay movimientos de este mes que cumplan el umbral.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar por confianza' }));
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('ejecuta la aprobación cuando hay elegibles y el rol puede escribir', () => {
    const onApprove = vi.fn();
    render(
      <AutoApprovalBar
        approvedCount={12}
        threshold={0.9}
        disabled={false}
        disabledHint=""
        busy={false}
        onApprove={onApprove}
      />
    );

    expect(
      screen.getByText('Se aprobarán automáticamente 12 transacciones con confianza ≥ 90%.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar por confianza' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
