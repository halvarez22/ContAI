import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppSidebar } from './AppSidebar';
import { AppTopBar } from './AppTopBar';
import type { NavItem } from './navItems';
import type { DashboardMode } from '../../types/dashboardMode';

export type AppShellProps = {
  children: ReactNode;
  navItems: NavItem[];
  activeTab: string;
  title: string;
  onNavigate: (id: string) => void;
  sidebarCollapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
  empresaNombre: string;
  empresaRfc: string;
  onLogout: () => void;
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  isDarkMode: boolean;
  onToggleDark: () => void;
  userDisplayName: string | null | undefined;
  userPhotoURL: string | null | undefined;
};

/**
 * Contenedor visual post-auth (Sidebar + TopBar + área de contenido).
 * Sin lógica de negocio ContAI.
 */
export function AppShell({
  children,
  navItems,
  activeTab,
  title,
  onNavigate,
  sidebarCollapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileOpen,
  onMobileClose,
  empresaNombre,
  empresaRfc,
  onLogout,
  mode,
  onModeChange,
  isDarkMode,
  onToggleDark,
  userDisplayName,
  userPhotoURL,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-surface-elevated flex text-ink overflow-x-hidden">
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onMobileClose}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <AppSidebar
        items={navItems}
        activeTab={activeTab}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={onMobileClose}
        empresaNombre={empresaNombre}
        empresaRfc={empresaRfc}
        onLogout={onLogout}
      />

      <main className="flex-1 flex flex-col min-w-0 w-full">
        <AppTopBar
          title={title}
          empresaNombre={empresaNombre}
          empresaRfc={empresaRfc}
          mode={mode}
          onModeChange={onModeChange}
          isDarkMode={isDarkMode}
          onToggleDark={onToggleDark}
          userDisplayName={userDisplayName}
          userPhotoURL={userPhotoURL}
          sidebarCollapsed={sidebarCollapsed}
          onOpenMobileNav={onMobileOpen}
          onToggleCollapsed={onToggleCollapsed}
        />

        {(empresaNombre || empresaRfc) && (
          <div className="md:hidden px-4 py-2 bg-brand-muted border-b border-border text-center">
            {empresaNombre ? (
              <p className="text-xs font-semibold text-ink truncate">{empresaNombre}</p>
            ) : null}
            {empresaRfc ? (
              <p className="text-[10px] font-mono text-brand mt-0.5">RFC {empresaRfc}</p>
            ) : null}
          </div>
        )}

        <div className="p-4 lg:p-8 overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
