/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { PeriodSelectorCard } from './PeriodSelectorCard';

describe('PeriodSelectorCard', () => {
  it('emite onPeriodChange controlado', () => {
    const onPeriodChange = vi.fn();
    render(
      <PeriodSelectorCard
        periodYear={2026}
        periodMonth={7}
        onPeriodChange={onPeriodChange}
        onSelectCurrentMonth={vi.fn()}
        yearAnchor={2026}
      />
    );
    fireEvent.change(screen.getByLabelText(/Año/i), { target: { value: '2025' } });
    expect(onPeriodChange).toHaveBeenCalledWith(2025, 7);
  });

  it('mes actual callback', () => {
    const onCurrent = vi.fn();
    render(
      <PeriodSelectorCard
        periodYear={2026}
        periodMonth={0}
        onPeriodChange={vi.fn()}
        onSelectCurrentMonth={onCurrent}
        yearAnchor={2026}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Mes actual/i }));
    expect(onCurrent).toHaveBeenCalled();
  });

  it('smoke axe', async () => {
    const { container } = render(
      <PeriodSelectorCard
        periodYear={2026}
        periodMonth={0}
        onPeriodChange={vi.fn()}
        onSelectCurrentMonth={vi.fn()}
        yearAnchor={2026}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
