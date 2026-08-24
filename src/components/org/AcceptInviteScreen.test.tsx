/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AcceptInviteScreen } from './AcceptInviteScreen';

vi.mock('../../services/organizationInviteService', () => ({
  previewOrgInvite: vi.fn(async () => ({
    organizationId: 'org1',
    orgNombre: 'Acme SA',
    orgRfc: 'ACM010101AAA',
    role: 'contador',
    invitedByNombre: 'Halvarez',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    emailNormalized: 'c@test.com',
  })),
  acceptOrgInvite: vi.fn(),
}));

describe('AcceptInviteScreen', () => {
  it('muestra transparencia fiscal cuando hay preview', async () => {
    render(
      <AcceptInviteScreen
        token="tok"
        isAuthenticated
        userEmail="c@test.com"
        onLogin={() => undefined}
        onAccepted={() => undefined}
      />
    );
    expect(await screen.findByText('Acme SA')).toBeTruthy();
    expect(screen.getByText('ACM010101AAA')).toBeTruthy();
    expect(screen.getByText('contador')).toBeTruthy();
    expect(screen.getByText('Halvarez')).toBeTruthy();
  });

  it('pide login si no hay sesión', () => {
    render(
      <AcceptInviteScreen
        token="tok"
        isAuthenticated={false}
        onLogin={() => undefined}
        onAccepted={() => undefined}
      />
    );
    expect(
      screen.getByRole('button', { name: /Iniciar sesión con Google/i })
    ).toBeTruthy();
  });
});
