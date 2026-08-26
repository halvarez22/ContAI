/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): ReactElement {
  throw new Error('boom-render');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza fallback y registra stack en consola', () => {
    render(
      <ErrorBoundary label="test">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Algo salió mal/i)).toBeTruthy();
    expect(screen.getByText(/boom-render/i)).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
    const logged = vi.mocked(console.error).mock.calls.some((c) =>
      String(c[0]).includes('ErrorBoundary caught:')
    );
    expect(logged).toBe(true);
  });

  it('Reintentar limpia el error si el hijo ya no falla', () => {
    let shouldThrow = true;
    function MaybeBoom(): ReactElement {
      if (shouldThrow) throw new Error('temp');
      return <p>recuperado</p>;
    }

    render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Algo salió mal/i)).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    expect(screen.getByText('recuperado')).toBeTruthy();
  });
});
