# Design System ContAI (E0.1)

Fundación visual fintech (estilo Mercury/Ramp) para ContAI Fase 3. E0.1 = tokens/`ui/`; E0.2 = Shell (Sidebar + TopBar + ViewMode).

## Tokens

| Capa | Archivo |
|------|---------|
| Fuente de verdad | `src/styles/tokens.css` (`:root` + `.dark`) |
| Bridge Tailwind v4 | `src/index.css` → `@theme` → utilidades (`bg-brand`, `text-ink`, …) |
| Charts (JS) | `src/styles/tokens.ts` → `chartColors` |

Paleta semántica: `brand`, `success`, `warning`, `danger`, `info`, `surface*`, `ink*`, `border`, `focus`. Tipografía: **Inter** (UI) + **JetBrains Mono** (montos/RFC).

Dark mode: clase `dark` en `<html>` (toggle existente en la app).

## Componentes (`src/components/ui/`)

**Refactor (API estable):** `Button`, `Card`, `Badge`.

**Nuevos (E0.1):** `Input`, `Alert`, `StatCard`, `PageHeader`, `DataTable`, `Chart` (Recharts), `Skeleton`.

Iconos: **Lucide** (ya en el producto). Charts: **Recharts** vía wrapper `Chart`. No shadcn en E0.1.

## Gallery DEV

- `src/components/DesignSystemGallery.tsx`
- Ítem sidebar `Design System` solo si `import.meta.env.DEV`
- No Storybook, sin rutas nuevas de producto

## Superficies migradas en E0.1

1. `TaxPreviewCard.tsx`
2. Bloque login pre-auth en `App.tsx`

## Equipo (E8.2)

Panel **Equipo** en Configuración (`OrgMembersPanel`): invitaciones por email, roles y revocación. Aceptación vía `/invite?token=…` (`AcceptInviteScreen`) sin React Router.

## Conciliación Split (E9.1)

Tab Conciliación: match 1↔1 y split 1→N con montos por factura; badges «Listo (split N)»; panel manual multi-select con restante de movimiento/factura.

## Accesibilidad (WCAG AA — foco E0.1)

**Automático:** smoke `vitest-axe` en `Button` y `Alert` (`src/components/ui/*.test.tsx`).

**Checklist manual (Gallery):**

- [ ] Focus visible en Button / Input (anillo `focus`)
- [ ] Contraste texto `ink` sobre `surface` (claro y oscuro)
- [ ] `Alert` error/warning → `role="alert"`; info/success → `role="status"`
- [ ] DataTable: `<th scope="col">`
- [ ] Montos legibles con `font-mono` + `tabular-nums`

## API de producto — Shell (E0.2)

| Pieza | Ruta |
|-------|------|
| Shell | `src/components/layout/AppShell.tsx` (`children: ReactNode` estricto) |
| Sidebar | `src/components/layout/AppSidebar.tsx` |
| TopBar | `src/components/layout/AppTopBar.tsx` |
| Toggle | `src/components/layout/ViewModeToggle.tsx` |
| Nav config | `src/components/layout/navItems.ts` |
| Modo | `useDashboardMode` → `localStorage` (`contai.dashboardMode`) |
| Tema | `useTheme` → clase `dark` en `<html>` |

**Modo Operativo/Ejecutivo:** E7.1 consume `'ejecutivo'` en `overview` vía `ExecutiveDashboardView`; `'operativo'` mantiene el panel actual (E7.2 lo extraerá).

**Checklist a11y shell:**

- [ ] `aria-pressed` en toggle de modo
- [ ] `aria-current="page"` en ítem nav activo
- [ ] Focus visible en botones ghost del TopBar
- [ ] Overlay móvil cierra con click (aria-hidden)

## Consumo en producto

| Entregable | Uso |
|------------|-----|
| E7.1 Vista ejecutiva | `ExecutiveDashboardView` |
| E7.2 Vista operativa | `OperationalDashboardView` |
| E7.3 Secciones | `AppTabRouter` + `*Section` en `src/components/sections/` |
| E8.1 Multi-org | `OrgSwitcher`, `organizationService`, listeners por `organization_id` |

## Multi-organización (E8.1)

| Pieza | Ruta |
|-------|------|
| Tipos | `src/types/organization.ts` |
| Service | `src/services/organizationService.ts` |
| Hook | `src/hooks/useActiveOrganization.ts` |
| UI | `src/components/org/OrgSwitcher.tsx`, `OrgPickerScreen.tsx` |
| Rules | `firestore.rules` — membership `{uid}_{orgId}` |
| Indexes | `firestore.indexes.json` |

## Roadmap

E0.1 ✅ → E0.2 ✅ → E7.1–E7.3 ✅ → **E8.1 ✅** → E8.2 invitaciones / E9.1 / E10.1.

| Pieza | Ruta |
|-------|------|
| Router | `src/components/layout/AppTabRouter.tsx` |
| Periodo compartido | `src/components/sections/PeriodSelectorCard.tsx` |
| Overview | `OverviewSection` |
| Transacciones | `TransactionsSection` (`DataTable` E0.1) |
| Conciliación | `ReconciliationSection` → `BankReconciliationPanel` |
| SAT | `SatDownloadSection` → `SatDownloadPanel` |
| Fiscal | `FiscalSection` |
| Type guards | `src/types/appSections.ts` (`NavTabId`, `isNavTabId`) |

**Importación:** `ImportModals` permanece en `App.tsx`; CTAs vía callbacks (sin tab nueva).

## Roadmap

E0.1 ✅ → E0.2 ✅ → E7.1 ✅ → E7.2 ✅ → E7.3 ✅ (secciones prioritarias).
