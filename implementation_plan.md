# Implementation Plan — Entregable 0.2 (Shell / Navegación)

**Proyecto:** ContAI Fase 3  
**Fecha:** 2026-08-24  
**Estado:** IMPLEMENTADO (E0.2) — aprobado §8.1–8.6(A) 2026-08-24  
**Precondiciones:** E0.1 APPROVED en `main` (`cb840e0`) — tokens, `ui/`, Gallery DEV, a11y smoke  
**Objetivo:** Reestructurar el **contenedor visual** post-auth (Sidebar + TopBar + área de contenido) para consumir tokens E0.1, con toggle **Operativo / Ejecutivo** en TopBar (estado de contexto para E7.1–E7.2), **sin** cambiar la lógica ni el comportamiento de las tabs existentes.  
**Fuera de alcance E0.2:** Vistas Ejecutiva/Operativa reales (E7.1–E7.2), migración masiva de estilos *dentro* de cada tab (E7.3), React Router, Storybook, Conciliación/SAT/Import/Fiscal business, Cloud Functions, multi-tenant, nuevos primitivos `ui/` no listados.

---

## 0. Opinión profesional (contexto)

E0.1 dejó tokens y primitivos; el chrome de `App.tsx` (~líneas 1100–1286) sigue con `indigo-*` / `gray-*` ad hoc. E0.2 debe **extraer y tokenizar solo el layout**, no reescribir 3k+ líneas de pantallas.

El toggle Operativo/Ejecutivo es **infraestructura de contexto**, no el dashboard nuevo: en E0.2 el switch es visible, accesible y persistente; **no** sustituye el contenido de `overview` (eso es E7.x).

---

## 1. Principio APO (anti-megaplan)

```
E0.1  tokens + ui/          ✅ cerrado
E0.2  shell (Sidebar+TopBar+toggle)   ← este plan
E7.1  vista ejecutiva (consume mode + StatCard/Chart)
E7.2  vista operativa
E7.3  migración secciones bajo shell
```

**Prohibido en E0.2:** inventar rutas de producto, rediseñar Conciliación/SAT, reescribir KPIs del Panel General, agregar shadcn.

---

## 2. Diagnóstico técnico actual (grafo de impacto)

### 2.1 Flujo UI actual (post-auth)

```
App.tsx
  ├─ state: activeTab, isSidebarOpen, isMobileMenuOpen, isDarkMode, user, empresa*
  ├─ chrome inline:
  │    ├─ overlay móvil
  │    ├─ <aside> nav (tabs hardcode + DEV design_system)
  │    └─ <header> título tab + dark toggle + avatar
  └─ <main> → bloques {activeTab === '…'} (overview…settings)  ← NO tocar lógica
```

### 2.2 Qué viola / deuda

| Pieza | Problema |
|-------|----------|
| Sidebar / header | Hardcodes `indigo-*`, `gray-*`, `bg-white dark:bg-gray-900` |
| Nav items | Array inline en `App.tsx`; duplicación título tab en header |
| Dark mode | OK funcional (`localStorage` + clase `dark`); UI del toggle no tokenizada |
| View mode | **No existe** — requerido para preparar E7.1/E7.2 |

### 2.3 Efectos secundarios (módulos afectados)

| Módulo | Impacto E0.2 |
|--------|----------------|
| `App.tsx` | Sustituir chrome por `<AppShell />`; conservar estado de negocio y `activeTab` |
| Nuevos `layout/*` | Solo presentación; **cero** Firebase/Groq |
| `docs/DESIGN_SYSTEM.md` | Documentar Shell + ViewMode |
| Tabs / paneles | **Sin cambio de comportamiento**; IDs de tab idénticos |
| Gallery DEV | Sigue bajo `import.meta.env.DEV` (doble guarda) |
| Login pre-auth | Fuera de shell (ya tokenizado en E0.1) — no reabrir |

---

## 3. Alcance cerrado — LISTA DE ARCHIVOS

### 3.1 Crear (exactamente estos)

| Ruta | Responsabilidad única |
|------|------------------------|
| `src/types/dashboardMode.ts` | Tipo `DashboardMode = 'operativo' \| 'ejecutivo'` + clave storage |
| `src/hooks/useDashboardMode.ts` | Estado + persistencia `localStorage` (default `'operativo'`) |
| `src/components/layout/navItems.ts` | Lista tipada de tabs (mismo `id`/`label`/`icon` actuales + DEV item) |
| `src/components/layout/AppSidebar.tsx` | Brand, empresa, nav, logout; tokens; collapse/móvil vía props |
| `src/components/layout/AppTopBar.tsx` | Título, empresa (desktop), toggle Operativo/Ejecutivo, dark, avatar |
| `src/components/layout/AppShell.tsx` | Compone overlay + Sidebar + TopBar + `children` (área contenido) |
| `src/components/layout/ViewModeToggle.tsx` | Control accesible Operativo/Ejecutivo (usa `Button`/`Badge` de `ui/`) |
| `src/components/layout/AppShell.test.tsx` | Smoke: render shell + axe leve / assert toggle + DEV nav ausente sin DEV |

**No crear:** `Sidebar.tsx` genérico en `ui/` (el plan E0.1 reservó API de producto en layout, no otro primitivo).

### 3.2 Modificar (exactamente estos)

| Ruta | Cambio |
|------|--------|
| `src/App.tsx` | Montar `AppShell` con props; eliminar JSX inline de aside/header/overlay; **conservar** todos los bloques `activeTab === …` |
| `docs/DESIGN_SYSTEM.md` | Sección Shell E0.2 + ViewMode + checklist a11y TopBar |
| `implementation_plan.md` | Este documento (estado al cerrar → IMPLEMENTADO) |
| `README.md` | Una línea: link Shell / nota E0.2 (opcional mínima) |

### 3.3 Prohibido modificar en E0.2

- `src/components/Bank*`, `SatDownloadPanel`, `ImportModals`, `TaxPreviewCard` (salvo regresión accidental)
- `src/services/**`, `src/hooks/useImportFlow*`, `functions/**`
- Contenido interno de tabs (overview KPIs, tablas, modales)
- `src/styles/tokens.css` (salvo bug crítico descubierto → **parar** y re-plan)

---

## 4. Contratos de componentes (TypeScript first)

### 4.1 `DashboardMode`

```ts
export type DashboardMode = 'operativo' | 'ejecutivo';
export const DASHBOARD_MODE_STORAGE_KEY = 'contai.dashboardMode';
```

### 4.2 `navItems.ts`

- Misma lista actual de IDs:  
  `overview | transactions | analysis | reconciliation | sat_download | fiscal | inventory | recurring | audit | settings`  
  + `design_system` **solo** si `import.meta.env.DEV`.
- Export: `getNavItems(): NavItem[]` (o constante + filtro DEV).

### 4.3 `AppSidebar` (props)

| Prop | Tipo | Notas |
|------|------|-------|
| `items` | `NavItem[]` | |
| `activeTab` | `string` | |
| `onNavigate` | `(id: string) => void` | cierra móvil |
| `collapsed` | `boolean` | desktop rail |
| `mobileOpen` | `boolean` | |
| `onMobileClose` | `() => void` | |
| `empresaNombre` / `empresaRfc` | `string` | |
| `onLogout` | `() => void` | |

Tokens: `bg-surface`, `border-border`, item activo `bg-brand-muted text-brand`, etc. Lucide icons sin cambio de librería.

### 4.4 `AppTopBar` (props)

| Prop | Tipo | Notas |
|------|------|-------|
| `title` | `string` | derivado de `activeTab` vía mapa labels |
| `empresaNombre` / `empresaRfc` | `string` | |
| `mode` / `onModeChange` | `DashboardMode` | toggle |
| `isDarkMode` / `onToggleDark` | | |
| `userDisplayName` / `userPhotoURL` | | |
| `onOpenMobileNav` / `onToggleCollapsed` | | |

### 4.5 `AppShell`

Recibe props de Sidebar+TopBar + `children`.  
Root: `bg-surface-elevated text-ink` (reemplaza `bg-gray-50 dark:bg-gray-950`).

Banner móvil empresa (hoy `indigo-50`) → tokens (`bg-brand-muted`).

### 4.6 Toggle Operativo/Ejecutivo — comportamiento E0.2 (FIJO salvo §8)

| Comportamiento | E0.2 |
|----------------|------|
| Visible en TopBar | Sí |
| Persistencia `localStorage` | Sí |
| Default | `'operativo'` |
| Cambia contenido de tabs | **No** (solo estado + UI) |
| Consume en overview | Diferido a E7.1/E7.2 |
| Exponer a `App` | `const { mode, setMode } = useDashboardMode()` disponible para E7 |

Opcional UX (recomendado): `Badge` sutil “Modo: Operativo” junto al toggle — sin cards de marketing.

---

## 5. Migración no destructiva (contrato)

1. **IDs de tab** idénticos → cero rotura de estado/`useEffect` ligados a `activeTab`.  
2. **Handlers** (`handleLogout`, dark mode, etc.) permanecen en `App` o se pasan por props — sin mover Firebase a layout.  
3. **Contenido** de cada tab: copy-paste estructural cero; solo deja de vivir *debajo* del chrome extraído.  
4. **Gallery DEV**: doble guarda se mantiene al construir `navItems` y al renderizar el bloque `design_system`.  
5. **Motion**: conservar `motion`/`AnimatePresence` del overlay y animación de ancho del aside (comportamiento UX actual).

---

## 6. Consumo exclusivo de `ui/` (E0.1)

Shell/layout **debe** usar donde aplique:

- `Button` (ghost/icon actions, logout secondary/danger si cabe)
- `Badge` (modo / DEV)
- `Card` solo si un bloque del chrome lo requiere (preferir no cardificar el TopBar)
- `PageHeader` **no** obligatorio en cada tab en E0.2 (evitar migrar pantallas); documentar uso futuro

**Prohibido:** añadir `indigo-*` nuevos en layout; shadcn; tipografía distinta a tokens.

---

## 7. Accesibilidad y pruebas

| Tipo | Alcance E0.2 |
|------|----------------|
| Unit / smoke | `AppShell.test.tsx`: toggle cambia `mode`; nav DEV no en prod mock; axe smoke del TopBar+toggle |
| Manual | Collapse desktop, drawer móvil, focus-visible en nav y toggle, contraste dark |
| Suite | `npm run lint` + `npm test` verdes (baseline 65+ nuevos) |
| Docs | Checklist en `DESIGN_SYSTEM.md` |

---

## 8. Preguntas críticas (resolver antes de APROBADO)

### 8.1 ¿El toggle cambia algo visual en overview en E0.2?

- **(A) Solo estado + control en TopBar** — contenido overview idéntico. **Recomendado (anti-scope-creep).**  
- **(B)** Mostrar un `Alert` informativo en overview según modo (“Vista ejecutiva llegará en E7.1”).  
- **(C)** Empezar a bifurcar overview ya (→ se convierte en E7 anticipado; **rechazado** por APO).

### 8.2 Persistencia del modo

- **(A) `localStorage`** — **recomendado.**  
- **(B)** Solo React state (se pierde al refresh).  
- **(C)** Firestore perfil usuario (overkill Fase 3 temprana).

### 8.3 ¿Extraer `AppShell` o solo Sidebar/TopBar?

- **(A) AppShell + Sidebar + TopBar** — **recomendado** (un punto de montaje en `App`).  
- **(B)** Solo dos componentes; chrome root queda en `App`.

### 8.4 ¿Mover dark mode a un hook `useTheme`?

- **(A) Sí, `useTheme.ts` junto a `useDashboardMode`** — limpia `App`. **Recomendado.**  
- **(B)** Dejar dark mode en `App` (menos archivos).

### 8.5 Animaciones Motion en sidebar

- **(A) Conservar comportamiento actual** — **recomendado.**  
- **(B)** Simplificar a CSS-only (riesgo de regresión UX móvil).

### 8.6 ¿Incluir `PageHeader` en cada tab en E0.2?

- **(A) No** — solo shell; títulos siguen en TopBar. **Recomendado.**  
- **(B)** Sí en overview solamente.  
- **(C)** Sí en todas las tabs (scope creep → E7.3).

---

## 9. Criterios de aceptación (DoD)

- [ ] Chrome post-auth vive en `layout/*`; tokens (`bg-surface`, `text-ink`, `bg-brand-muted`, …); cero `indigo-*` / `bg-gray-50` en Sidebar/TopBar/AppShell.  
- [ ] Todas las tabs existentes navegan y renderizan igual (smoke manual o checklist).  
- [ ] Toggle Operativo/Ejecutivo en TopBar; persistencia según §8.2; **no** cambia contenido de tabs (si §8.1A).  
- [ ] Gallery DEV: doble guarda intacta.  
- [ ] `AppShell.test.tsx` + suite verde; `tsc --noEmit` limpio.  
- [ ] `docs/DESIGN_SYSTEM.md` actualizado.  
- [ ] Commit + push solo tras verificación (mensaje tipo `feat: extract tokenized AppShell with operativo/ejecutivo toggle (E0.2)`).

---

## 10. Orden de ejecución (tras APROBADO)

1. Tipos + `useDashboardMode` (+ `useTheme` si §8.4A).  
2. `navItems.ts` + `ViewModeToggle` + `AppSidebar` + `AppTopBar` + `AppShell`.  
3. Cablear `App.tsx` (sustituir chrome; pasar `children` = bloques tab actuales).  
4. Tests + docs.  
5. Lint/suite; **parar** (no E7.1).

---

## 11. Aprobación requerida

Responder con:

- `APROBADO: Ejecutar Entregable 0.2` + letras **§8.1–8.6**  
- o `APROBADO CON CAMBIOS: …`  
- o `RECHAZADO: …`

**Sin esa frase, no se escribe código de E0.2.**

---

## Anexo — Roadmap Fase 3

| ID | Entregable | Estado |
|----|------------|--------|
| E0.1 | Design System | ✅ `cb840e0` |
| **E0.2** | Shell / nav + toggle (este plan) | ✅ IMPLEMENTADO |
| E7.1 | Vista ejecutiva | pendiente |
| E7.2 | Vista operativa | pendiente |
| E7.3 | Migración secciones | pendiente |
