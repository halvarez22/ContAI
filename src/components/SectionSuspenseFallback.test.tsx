/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionSuspenseFallback } from './SectionSuspenseFallback';

describe('SectionSuspenseFallback', () => {
  it('renderiza status ligero sin dependencias DS', () => {
    render(<SectionSuspenseFallback label="Cargando módulo…" />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/Cargando módulo/i)).toBeTruthy();
  });
});
