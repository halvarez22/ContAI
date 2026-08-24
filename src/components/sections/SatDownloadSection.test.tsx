/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SatDownloadSection } from './SatDownloadSection';

vi.mock('../SatDownloadPanel', () => ({
  SatDownloadPanel: () => <div data-testid="sat-panel">SAT</div>,
}));

describe('SatDownloadSection', () => {
  it('renderiza panel SAT', () => {
    render(
      <SatDownloadSection
        userId="u1"
        organizationId="org1"
        defaultRfc="XAXX010101000"
        periodosCerrados={[]}
        highAmountReviewThreshold={50000}
        classify={vi.fn()}
      />
    );
    expect(screen.getByText(/Descarga SAT/i)).toBeTruthy();
    expect(screen.getByTestId('sat-panel')).toBeTruthy();
  });
});
