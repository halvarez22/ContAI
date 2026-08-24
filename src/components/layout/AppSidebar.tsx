import { LogOut, ShieldCheck, X } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import type { NavItem } from './navItems';

export type AppSidebarProps = {
  items: NavItem[];
  activeTab: string;
  onNavigate: (id: string) => void;
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  empresaNombre: string;
  empresaRfc: string;
  onLogout: () => void;
};

function showLabels(collapsed: boolean): boolean {
  if (typeof window === 'undefined') return !collapsed;
  return !collapsed || window.innerWidth < 1024;
}

export function AppSidebar({
  items,
  activeTab,
  onNavigate,
  collapsed,
  mobileOpen,
  onMobileClose,
  empresaNombre,
  empresaRfc,
  onLogout,
}: AppSidebarProps) {
  const labelsVisible = showLabels(collapsed);

  return (
    <motion.aside
      initial={false}
      animate={{
        width: collapsed ? 80 : 280,
        x:
          typeof window !== 'undefined' && window.innerWidth < 1024
            ? mobileOpen
              ? 0
              : -280
            : 0,
      }}
      className={cn(
        'bg-surface border-r border-border flex flex-col fixed lg:sticky top-0 h-screen z-50 lg:z-20 transition-all duration-300',
        collapsed && 'lg:w-20'
      )}
    >
      <div className="p-6 flex items-center justify-between lg:justify-start gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-brand-foreground" />
          </div>
          {labelsVisible ? (
            <span className="font-bold text-xl text-ink">ContAI</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="lg:hidden p-2 text-ink-muted hover:bg-surface-muted rounded-lg"
          aria-label="Cerrar menú"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {labelsVisible && (empresaNombre || empresaRfc) ? (
        <div className="px-4 pb-2 -mt-2">
          <div className="rounded-lg border border-border bg-surface-muted px-3 py-2">
            {empresaNombre ? (
              <p className="text-xs font-semibold text-ink leading-tight line-clamp-2">
                {empresaNombre}
              </p>
            ) : null}
            {empresaRfc ? (
              <p className="text-[10px] font-mono text-ink-muted mt-1">
                RFC {empresaRfc}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav className="flex-1 px-4 space-y-2 mt-4" aria-label="Navegación principal">
        {items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                active
                  ? 'bg-brand-muted text-brand'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {labelsVisible ? (
                <span className="font-medium">{item.label}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink-muted hover:bg-danger-muted hover:text-danger transition-colors"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {labelsVisible ? <span className="font-medium">Cerrar Sesión</span> : null}
        </button>
      </div>
    </motion.aside>
  );
}
