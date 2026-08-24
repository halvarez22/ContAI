import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Receipt,
  Activity,
  Upload,
  Download,
  Percent,
  Package,
  Repeat,
  History,
  Settings,
  Palette,
} from 'lucide-react';

export type NavItem = {
  id: string;
  label: string;
  /** Título más largo opcional para TopBar */
  title?: string;
  icon: LucideIcon;
};

const BASE_NAV_ITEMS: NavItem[] = [
  { id: 'overview', icon: LayoutDashboard, label: 'Panel General' },
  { id: 'transactions', icon: Receipt, label: 'Transacciones' },
  { id: 'analysis', icon: Activity, label: 'Análisis' },
  { id: 'reconciliation', icon: Upload, label: 'Conciliación' },
  {
    id: 'sat_download',
    icon: Download,
    label: 'Descarga SAT',
    title: 'Descarga SAT (Beta)',
  },
  {
    id: 'fiscal',
    icon: Percent,
    label: 'Fiscal',
    title: 'Administración fiscal',
  },
  { id: 'inventory', icon: Package, label: 'Inventario' },
  {
    id: 'recurring',
    icon: Repeat,
    label: 'Recurrentes',
    title: 'Transacciones Recurrentes',
  },
  { id: 'audit', icon: History, label: 'Bitácora' },
  { id: 'settings', icon: Settings, label: 'Configuración' },
];

const DEV_NAV_ITEM: NavItem = {
  id: 'design_system',
  icon: Palette,
  label: 'Design System',
};

/** Tabs de producto + Design System solo en DEV. */
export function getNavItems(isDev: boolean = import.meta.env.DEV): NavItem[] {
  return isDev ? [...BASE_NAV_ITEMS, DEV_NAV_ITEM] : BASE_NAV_ITEMS;
}

export function getNavTitle(tabId: string, items: NavItem[] = getNavItems()): string {
  const item = items.find((i) => i.id === tabId);
  return item?.title ?? item?.label ?? tabId;
}
