/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrgPickerScreen } from './OrgPickerScreen';
import type { OrganizationSummary } from '../../types/organization';

const summaries: OrganizationSummary[] = [
  {
    organization: {
      id: 'o1',
      nombre: 'Cliente Alpha',
      rfc: 'ALP010101AAA',
      activa: true,
      plan: 'free',
      cuentas_contables: [],
      periodos_cerrados: [],
      creado_por: 'u1',
    },
    membership: {
      id: 'u1_o1',
      organization_id: 'o1',
      user_id: 'u1',
      role: 'owner',
      activo: true,
    },
  },
];

describe('OrgPickerScreen', () => {
  it('renderiza empresas y dispara onSelect', async () => {
    const onSelect = vi.fn().mockResolvedValue(undefined);
    render(
      <OrgPickerScreen summaries={summaries} onSelect={onSelect} />
    );
    expect(screen.getByText(/Selecciona una empresa/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));
    expect(onSelect).toHaveBeenCalledWith('o1');
  });
});
