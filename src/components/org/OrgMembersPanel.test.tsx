/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrgMembersPanel } from './OrgMembersPanel';

vi.mock('../../hooks/useOrgMembers', () => ({
  useOrgMembers: () => ({
    members: [
      {
        id: 'u1_org1',
        organization_id: 'org1',
        user_id: 'u1',
        role: 'owner',
        activo: true,
        email: 'owner@test.com',
        nombre: 'Owner',
      },
    ],
    invites: [] as import('../../types/organizationInvite').OrganizationInvitation[],
    loading: false,
    error: null as string | null,
    busy: false,
    lastInviteUrl: null as string | null,
    refresh: vi.fn(),
    invite: vi.fn(),
    resend: vi.fn(),
    revokeInvite: vi.fn(),
    changeRole: vi.fn(),
    revokeMember: vi.fn(),
    clearLastInviteUrl: vi.fn(),
  }),
}));

describe('OrgMembersPanel', () => {
  it('renderiza sección Equipo para owner', () => {
    render(<OrgMembersPanel organizationId="org1" actorRole="owner" />);
    expect(screen.getByText('Equipo')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Invitar/i })).toBeTruthy();
  });

  it('no renderiza para contador', () => {
    const { container } = render(
      <OrgMembersPanel organizationId="org1" actorRole="contador" />
    );
    expect(container.firstChild).toBeNull();
  });
});
