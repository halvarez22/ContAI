/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getChartOfAccountsSeed } from '../../config/chartOfAccounts';
import { Anexo24CatalogoCard } from './Anexo24CatalogoCard';

describe('Anexo24CatalogoCard', () => {
  it('muestra el aviso de la cuenta inactiva junto a la descarga', () => {
    const chart = getChartOfAccountsSeed().map((account) =>
      account.code === '105.01' ? { ...account, activa: false } : account
    );
    render(
      <Anexo24CatalogoCard
        chart={chart}
        organizationId="org-1"
        organizationRfc="AAA010101AAA"
        year={2026}
        monthIndex={0}
        canWrite
      />
    );
    expect(screen.getByText(/La cuenta está inactiva y no entra al catálogo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descargar catálogo XML' })).toBeEnabled();
  });
});
