/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrgSwitcher } from './OrgSwitcher';
import type { OrganizationSummary } from '../../types/organization';

const summaries: OrganizationSummary[] = [
  {
    organization: {
      id: 'o1',
      nombre: 'Empresa Uno',
      rfc: 'AAA010101AAA',
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
  {
    organization: {
      id: 'o2',
      nombre: 'Empresa Dos',
      rfc: 'BBB010101BBB',
      activa: true,
      plan: 'free',
      cuentas_contables: [],
      periodos_cerrados: [],
      creado_por: 'u1',
    },
    membership: {
      id: 'u1_o2',
      organization_id: 'o2',
      user_id: 'u1',
      role: 'owner',
      activo: true,
    },
  },
];

describe('OrgSwitcher', () => {
  it('muestra select cuando hay N orgs y emite onSelect', () => {
    const onSelect = vi.fn();
    render(
      <OrgSwitcher
        summaries={summaries}
        activeOrganizationId="o1"
        onSelect={onSelect}
      />
    );
    const select = screen.getByLabelText(/Organización activa/i);
    fireEvent.change(select, { target: { value: 'o2' } });
    expect(onSelect).toHaveBeenCalledWith('o2');
  });

  it('una sola org muestra nombre sin select', () => {
    render(
      <OrgSwitcher
        summaries={[summaries[0]]}
        activeOrganizationId="o1"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Empresa Uno')).toBeTruthy();
    expect(screen.queryByLabelText(/Organización activa/i)).toBeNull();
  });
});
