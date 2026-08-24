/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { useState } from 'react';
import { AppShell } from './AppShell';
import { getNavItems } from './navItems';
import { DASHBOARD_MODE_STORAGE_KEY } from '../../types/dashboardMode';
import type { DashboardMode } from '../../types/dashboardMode';

function ShellHarness({
  initialMode = 'operativo' as DashboardMode,
  includeDevNav = true,
}) {
  const [mode, setMode] = useState<DashboardMode>(initialMode);
  const [tab, setTab] = useState('overview');
  return (
    <AppShell
      navItems={getNavItems(includeDevNav)}
      activeTab={tab}
      title="Panel General"
      onNavigate={setTab}
      sidebarCollapsed={false}
      onToggleCollapsed={() => undefined}
      mobileOpen={false}
      onMobileOpen={() => undefined}
      onMobileClose={() => undefined}
      empresaNombre="Demo SA"
      empresaRfc="DEM010101AAA"
      onLogout={() => undefined}
      mode={mode}
      onModeChange={setMode}
      isDarkMode={false}
      onToggleDark={() => undefined}
      userDisplayName="Auditor"
      userPhotoURL={null}
    >
      <p>contenido-tab</p>
    </AppShell>
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renderiza children y navegación', () => {
    render(<ShellHarness />);
    expect(screen.getByText('contenido-tab')).toBeTruthy();
    expect(screen.getByLabelText('Navegación principal')).toBeTruthy();
    expect(screen.getAllByText('Panel General').length).toBeGreaterThanOrEqual(1);
  });

  it('toggle Operativo/Ejecutivo cambia aria-pressed', () => {
    render(<ShellHarness />);
    const group = screen.getByRole('group', { name: 'Modo de dashboard' });
    const ejecutivo = within(group).getByRole('button', { name: 'Ejecutivo' });
    fireEvent.click(ejecutivo);
    expect(ejecutivo.getAttribute('aria-pressed')).toBe('true');
    expect(
      within(group).getByRole('button', { name: 'Operativo' }).getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('incluye Design System en nav cuando isDev', () => {
    render(<ShellHarness includeDevNav />);
    const nav = screen.getByLabelText('Navegación principal');
    expect(within(nav).getByText('Design System')).toBeTruthy();
  });

  it('no incluye Design System cuando getNavItems(false)', () => {
    const items = getNavItems(false);
    expect(items.some((i) => i.id === 'design_system')).toBe(false);
  });

  it('smoke axe sin violaciones graves en shell', async () => {
    const { container } = render(<ShellHarness />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('dashboardMode storage key', () => {
  it('constante estable para persistencia', () => {
    expect(DASHBOARD_MODE_STORAGE_KEY).toBe('contai.dashboardMode');
  });
});
