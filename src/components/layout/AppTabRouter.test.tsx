/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppTabRouter } from './AppTabRouter';

describe('AppTabRouter', () => {
  it('renderiza children con key estable por tab', () => {
    render(
      <AppTabRouter activeTab="transactions" dashboardMode="operativo">
        <p>contenido-transacciones</p>
      </AppTabRouter>
    );
    expect(screen.getByText('contenido-transacciones')).toBeTruthy();
  });

  it('overview key incluye dashboardMode', () => {
    render(
      <AppTabRouter activeTab="overview" dashboardMode="ejecutivo">
        <p>modo-ejecutivo</p>
      </AppTabRouter>
    );
    expect(screen.getByText('modo-ejecutivo')).toBeTruthy();
  });
});
