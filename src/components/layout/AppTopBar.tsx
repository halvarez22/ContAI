import type { ReactNode } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { ContAILogo } from '../brand/ContAILogo';
import { Button } from '../ui/Button';
import { ViewModeToggle } from './ViewModeToggle';
import type { DashboardMode } from '../../types/dashboardMode';

export type AppTopBarProps = {
  title: string;
  empresaNombre: string;
  empresaRfc: string;
  orgSwitcher?: ReactNode;
  mode: DashboardMode;
  onModeChange: (mode: DashboardMode) => void;
  isDarkMode: boolean;
  onToggleDark: () => void;
  userDisplayName: string | null | undefined;
  userPhotoURL: string | null | undefined;
  sidebarCollapsed: boolean;
  onOpenMobileNav: () => void;
  onToggleCollapsed: () => void;
};

export function AppTopBar({
  title,
  empresaNombre,
  empresaRfc,
  orgSwitcher,
  mode,
  onModeChange,
  isDarkMode,
  onToggleDark,
  userDisplayName,
  userPhotoURL,
  sidebarCollapsed,
  onOpenMobileNav,
  onToggleCollapsed,
}: AppTopBarProps) {
  const avatarSrc =
    userPhotoURL ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(userDisplayName || 'U')}`;

  return (
    <header className="min-h-16 bg-surface border-b border-border flex items-center justify-between gap-2 px-4 lg:px-8 py-2 sticky top-0 z-10">
      <div className="flex items-center gap-2 lg:gap-4 min-w-0 flex-shrink">
        <Button
          type="button"
          variant="ghost"
          className="lg:hidden p-2"
          onClick={onOpenMobileNav}
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <ContAILogo
          variant="full"
          size="sm"
          className="lg:hidden shrink-0"
          imgClassName="max-w-[120px]"
        />
        <Button
          type="button"
          variant="ghost"
          className="hidden lg:flex p-2"
          onClick={onToggleCollapsed}
          aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </Button>
        <h2 className="text-sm lg:text-lg font-semibold text-ink truncate max-w-[150px] sm:max-w-none">
          {title}
        </h2>
      </div>

      {orgSwitcher ? (
        <div className="flex-1 min-w-0 flex justify-center px-2">{orgSwitcher}</div>
      ) : (empresaNombre || empresaRfc) ? (
        <div className="flex-1 min-w-0 hidden md:flex flex-col items-center justify-center px-2 text-center">
          {empresaNombre ? (
            <p className="text-xs font-semibold text-ink truncate max-w-md lg:max-w-lg">
              {empresaNombre}
            </p>
          ) : null}
          {empresaRfc ? (
            <p className="text-[10px] text-ink-muted font-mono mt-0.5">
              RFC {empresaRfc}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
        <ViewModeToggle mode={mode} onModeChange={onModeChange} />
        <Button
          type="button"
          variant="ghost"
          className="p-2"
          onClick={onToggleDark}
          aria-label={isDarkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>
        <div className="text-right hidden md:block">
          <p className="text-sm font-medium text-ink truncate max-w-[100px]">
            {userDisplayName}
          </p>
          <p className="text-[10px] text-ink-muted">Admin</p>
        </div>
        <img
          src={avatarSrc}
          className="w-8 h-8 lg:w-10 lg:h-10 rounded-full border border-border"
          alt="Avatar"
          referrerPolicy="no-referrer"
        />
      </div>
    </header>
  );
}
