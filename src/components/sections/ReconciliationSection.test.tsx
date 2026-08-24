/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReconciliationSection } from './ReconciliationSection';

vi.mock('../BankReconciliationPanel', () => ({
  BankReconciliationPanel: () => <div data-testid="bank-panel">Conciliación</div>,
}));

describe('ReconciliationSection', () => {
  it('renderiza panel bancario', () => {
    render(<ReconciliationSection ledger={[]} periodLabel="Agosto 2026" />);
    expect(screen.getByText(/Conciliación bancaria/i)).toBeTruthy();
    expect(screen.getByTestId('bank-panel')).toBeTruthy();
  });
});
