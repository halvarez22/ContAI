import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { DashboardMode } from '../../types/dashboardMode';
import type { MigratedNavTabId } from '../../types/appSections';

export type AppTabRouterProps = {
  activeTab: MigratedNavTabId;
  dashboardMode: DashboardMode;
  children: ReactNode;
};

function motionKey(activeTab: MigratedNavTabId, dashboardMode: DashboardMode): string {
  return activeTab === 'overview' ? `overview-${dashboardMode}` : activeTab;
}

function motionAxis(activeTab: MigratedNavTabId): 'y' | 'x' {
  if (activeTab === 'overview' || activeTab === 'fiscal') return 'y';
  return 'x';
}

function sectionClassName(activeTab: MigratedNavTabId): string {
  if (activeTab === 'reconciliation') return 'space-y-6 max-w-6xl';
  if (activeTab === 'fiscal') return 'space-y-6 max-w-4xl';
  if (activeTab === 'overview') return 'space-y-8';
  return 'space-y-6';
}

/**
 * Envoltorio de transición para tabs migradas (E7.3).
 * `key` estable por activeTab — requisito AnimatePresence.
 */
export function AppTabRouter({ activeTab, dashboardMode, children }: AppTabRouterProps) {
  const key = motionKey(activeTab, dashboardMode);
  const axis = motionAxis(activeTab);
  const offset = activeTab === 'fiscal' ? 12 : 20;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, [axis]: offset }}
        animate={{ opacity: 1, [axis]: 0 }}
        exit={{ opacity: 0, [axis]: axis === 'y' ? -offset / 2 : -offset }}
        className={sectionClassName(activeTab)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
