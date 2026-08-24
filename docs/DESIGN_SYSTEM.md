# Design System ContAI (E0.1)

Fundación visual fintech (estilo Mercury/Ramp) para ContAI Fase 3. **No** rediseña shell ni dashboard; eso es E0.2 / E7.x.

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

## Accesibilidad (WCAG AA — foco E0.1)

**Automático:** smoke `vitest-axe` en `Button` y `Alert` (`src/components/ui/*.test.tsx`).

**Checklist manual (Gallery):**

- [ ] Focus visible en Button / Input (anillo `focus`)
- [ ] Contraste texto `ink` sobre `surface` (claro y oscuro)
- [ ] `Alert` error/warning → `role="alert"`; info/success → `role="status"`
- [ ] DataTable: `<th scope="col">`
- [ ] Montos legibles con `font-mono` + `tabular-nums`

## API futura (no en E0.1)

`Sidebar` / `TopBar` de producto → **E0.2**.

## Roadmap

E0.1 (este doc) → E0.2 shell → E7.1 ejecutiva → E7.2 operativa → E7.3 migración secciones.
