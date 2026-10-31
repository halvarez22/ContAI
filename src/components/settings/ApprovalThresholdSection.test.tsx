/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApprovalThresholdSection } from './ApprovalThresholdSection';

describe('ApprovalThresholdSection', () => {
  it('el contador ve el umbral y no el editor', () => {
    const onSave = vi.fn();
    render(
      <ApprovalThresholdSection threshold={0.9} canManage={false} saving={false} onSave={onSave} />
    );

    expect(screen.getByText(/El umbral de esta organización es 90%/)).toBeTruthy();
    expect(screen.getByText('Solo el dueño o un administrador puede cambiarlo.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar umbral' })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('el administrador ve el campo del umbral', () => {
    render(
      <ApprovalThresholdSection
        threshold={0.9}
        canManage
        saving={false}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Umbral de confianza')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar umbral' })).toBeDisabled();
  });
});