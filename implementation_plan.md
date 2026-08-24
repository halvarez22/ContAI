# Implementation Plan — Entregable 0.1 (Sistema de Diseño ContAI)

**Proyecto:** ContAI Fase 3 (fundación visual)  
**Fecha:** 2026-08-24  
**Estado:** IMPLEMENTADO (E0.1) — aprobado por dictamen auditor 2026-08-24  
**Precondiciones:** Fase 2 operativa en `main` (E5.4 `405e063`, E6.2.1 `cad23d7`)  
**Objetivo:** Establecer un **sistema de diseño fintech** (tokens + componentes base documentados) estilo Mercury/Ramp, sobre el cual se construirán E0.2 (shell) y E7.x (dashboard), **sin** rediseñar la navegación ni el dashboard en este entregable.  
**Fuera de alcance E0.1:** Nueva sidebar/shell (E0.2), vistas Ejecutiva/Operativa (E7.1–E7.2), migración de tabs (E7.3), Storybook, refactor masivo de `App.tsx`, cambio de librería de iconos, multi-tenant.

---

## 0. Opinión profesional del agente (contexto estratégico)

**Coincido con el diagnóstico del auditor:** las cuatro decisiones (dashboard como producto, doble vista, Mercury/Ramp, design system primero) **elevan el alcance a Fase 3**, no a un solo E7.1. Intentar “el dashboard” sin tokens/componentes reproduciría la deuda visual que ya tenemos (`indigo-*` ad hoc, tipografía por defecto del sistema, `ui/` mínimo).

**Sobre el ritmo propuesto (E0.1 → E0.2 → E7.1 → E7.2 → E7.3):** es el orden correcto. E0.1 debe ser **deliberadamente estrecho**: cimientos, no producto completo. Si E0.1 intenta también la shell, se convierte en megaplan (violación APO).

**Hallazgos del código actual (grafo real):**

| Pieza | Estado hoy |
|-------|------------|
| Tailwind | v4 vía `@import "tailwindcss"` en `src/index.css` (casi vacío) |
| `src/components/ui/` | Solo `Button`, `Card`, `Badge` (hardcode `indigo`/`gray`) |
| Iconos | `lucide-react` ya en uso en toda la app |
| Charts | **Ninguna** dependencia (`recharts`/`nivo`/`tremor` ausentes) |
| Fuentes | Sin Inter/JetBrains; `index.html` sin font-face |
| Dark mode | Ya usado masivamente (`dark:` en paneles); sin tokens semánticos |
| Nav | Tabs en `App.tsx` (“Panel General”, Análisis, Conciliación, …) — **no tocar en E0.1** |

**Riesgo a gestionar:** migrar *todas* las pantallas a tokens en E0.1 es scope creep. E0.1 = **definir tokens + enriquecer `ui/` + documentar + aplicar en 1–2 superficies demo** (p. ej. `TaxPreviewCard` o un `DesignSystemGallery` interno). La migración masiva de `App.tsx` queda para E0.2/E7.3.

---

## 1. Principio APO (anti-megaplan)

```
E0.1  tokens + ui primitives + Chart wrapper stub + docs
E0.2  shell / nav (consume tokens)
E7.1  vista ejecutiva (consume StatCard + Chart)
E7.2  vista operativa
E7.3  consolidación de secciones
```

**Prohibido en E0.1:** mover tabs, inventar rutas nuevas como producto, reescribir Conciliación/SAT.

---

## 2. Arquitectura de tokens

### 2.1 Dónde viven — **CSS variables + `@theme` en CSS (Tailwind 4)**

| Capa | Archivo | Rol |
|------|---------|-----|
| Fuente de verdad | `src/styles/tokens.css` | `:root` / `.dark` → `--color-brand`, `--color-surface`, `--font-sans`, `--font-mono`, `--radius-*`, … |
| Bridge Tailwind 4 | `src/index.css` | `@import "./styles/tokens.css";` + bloque `@theme { … }` mapeando a utilidades (`bg-brand`, `text-ink`, `font-mono`, …) |
| Tipado charts (opcional) | `src/styles/tokens.ts` | Solo claves/colores que Recharts necesite en JS |

**No** se introduce un `tailwind.config.ts` clásico como fuente de verdad (Tailwind 4 en este repo ya opera desde CSS). Si hace falta un archivo de config mínimo para Vite, no duplica la paleta.

### 2.2 Paleta propuesta (Mercury/Ramp × ContAI fiscal)

| Token | Uso | Notas |
|-------|-----|--------|
| `--color-brand` | CTA primario | Azul profundo (no indigo genérico saturado) |
| `--color-brand-muted` | fondos suaves | |
| `--color-success` | conciliado / OK | Verde esmeralda |
| `--color-warning` | revisión / conflicto | Ámbar |
| `--color-danger` | error / rechazo | Rojo contenido |
| `--color-ink` / `--color-ink-muted` | texto | Grises elegantes |
| `--color-surface` / `--color-surface-elevated` / `--color-border` | cards / divisores | |
| `--font-sans` | UI | Inter |
| `--font-mono` | montos, RFC, UUID | JetBrains Mono |
| `--radius-*`, `--shadow-*`, `--space-*` | ritmo | |

Carga de fuentes: `@fontsource/inter` + `@fontsource/jetbrains-mono` (o link Google Fonts en `index.html` — preferir **fontsource** para builds offline/Vercel predecibles).

### 2.3 Dark mode en E0.1

**Recomendación §8:** soportar **claro + oscuro desde E0.1 a nivel de tokens** (ya hay `dark:` en la app). No construir toggle nuevo de producto si ya existe en shell; solo definir `.dark { … }` en tokens. Si no hay toggle global claro, documentar que la clase `dark` en `<html>` sigue el mecanismo actual.

---

## 3. Componentes base (`src/components/ui/`) — LISTA CERRADA

### 3.1 Refactor (API de props **sin cambios**)

| Archivo | Cambio interno |
|---------|----------------|
| `Button.tsx` | Variants → tokens; props públicas idénticas |
| `Card.tsx` | Surface/border → tokens; props públicas idénticas |
| `Badge.tsx` | Variants → tokens; props públicas idénticas |

### 3.2 Crear (exactamente estos 7; **no** “y más”)

| Archivo | Props tipadas (mínimo) |
|---------|------------------------|
| `Input.tsx` | `label?`, `error?`, `hint?` + attrs nativos |
| `Alert.tsx` | `variant: 'info'\|'success'\|'warning'\|'error'`, `title?`, `children` |
| `StatCard.tsx` | `label`, `value`, `delta?`, `tone?`, `hint?` |
| `PageHeader.tsx` | `title`, `description?`, `actions?: ReactNode` |
| `DataTable.tsx` | genérico tipado `columns` / `rows` (MVP, sin virtualización) |
| `Chart.tsx` | wrapper Recharts: `type: 'line'\|'bar'`, `data`, `xKey`, `series[]` |
| `Skeleton.tsx` | `className?` |

### 3.3 Gallery (definición cerrada)

**No Storybook. No React Router** (el repo no tiene router).

- Archivo: `src/components/DesignSystemGallery.tsx`
- Activación: ítem de sidebar **solo si** `import.meta.env.DEV`, `id: 'design_system'`, label `Design System`
- Render: cuando `activeTab === 'design_system'` en `App.tsx` (diff mínimo: 1 ítem nav + 1 bloque condicional)
- Contenido: todos los componentes de §3.1–3.2 con variantes
- En **producción** (`vite build`): el ítem no existe; cero impacto usuarios

### 3.4 Pantallas demo a migrar (exactamente 2)

| # | Superficie | Qué se migra |
|---|------------|--------------|
| 1 | `src/components/TaxPreviewCard.tsx` | Cards/Badges/StatCard + tokens (fiscal compact/detailed) |
| 2 | Bloque **login pre-auth** en `App.tsx` (card “Iniciar sesión” / Google) | `Card` + `Button` + tipografía tokens; **sin** tocar post-login ni tabs |

**Prohibido migrar en E0.1:** Conciliación, SAT, Import CFDI, shell completa, settings completo, overview KPI inventados.

### 3.5 Layout stubs

`Sidebar` / `TopBar` **no se crean como componentes de producto en E0.1** (E0.2). Solo se documentan como API futura en `docs/DESIGN_SYSTEM.md`.

---

## 4. Integración con el stack actual

| Tecnología | Decisión |
|------------|----------|
| Tailwind v4 | Tokens → `@theme`; utilidades semánticas |
| shadcn/ui | **No adoptar en E0.1** (ver §8.3): ya hay `ui/` propio; shadcn implica Radix + CLI + convenciones que diluyen APO |
| Lucide | **Mantener** (ya en package.json) |
| `cn()` en `lib/utils` | Seguir usándolo |
| Capas ContAI | `ui/` = presentación pura; **prohibido** Firestore/Groq en componentes ui |

---

## 5. Accesibilidad (WCAG 2.1 AA)

Obligatorio en E0.1 para componentes nuevos/evolucionados:

- Contraste tokens (texto ink sobre surface ≥ 4.5:1; UI components ≥ 3:1).
- `focus-visible` ring con token `--color-focus` (no quitar outline).
- `Button`/`Input`: estados `disabled` anunciables; labels asociados (`htmlFor`).
- `Alert`: `role="alert"` o `status` según variante.
- `DataTable`: `<th scope>`, teclado en filas interactivas si aplica.
- Prueba puntual con **axe-core** en gallery (devDependency) — 1 smoke test, no suite completa AA en CI aún.

---

## 6. Documentación

**Recomendación:** `docs/DESIGN_SYSTEM.md` (auditor) + sección por componente (props, variantes, do/don’t).

- **No Storybook en E0.1** (peso de tooling alto; YAGNI hasta que haya equipo de diseño).  
- Gallery DEV opcional como “living docs”.  
- README: enlace a `docs/DESIGN_SYSTEM.md`.

---

## 7. Estrategia de pruebas (concreta)

| Tipo | Herramienta | Alcance E0.1 |
|------|-------------|--------------|
| Unit / smoke | Vitest + `@testing-library/react` | `Button`, `Alert`, `StatCard` (roles, variants) |
| a11y | `vitest-axe` (o `jest-axe` vía vitest) | 1–2 tests: `Alert` + `Button` sin violaciones critical |
| Manual | Gallery DEV | Checklist contraste focus en `docs/DESIGN_SYSTEM.md` |
| Regresión | `npm test` + `npm run lint` | Suite Fase 2 intacta; cero functions/SAT/Groq business |

**No** Storybook, **no** Percy, **no** e2e Playwright obligatorio en E0.1.

---

## 8. Preguntas críticas

### 8.1 ¿Librería de gráficas?

- **(A) Recharts** — ligera, idiomatic React, suficiente para line/bar E7.1. **Recomendado.**  
- **(B) Nivo** — más potente, más peso.  
- **(C) Tremor** — bonito pero acopla diseño ajeno al nuestro.  
- **(D) Posponer Chart a E7.1** — E0.1 solo deja interfaz `Chart` stub.  

**Recomendación:** **(A)** instalar Recharts en E0.1 con wrapper vacío usable, para no rediseñar API en E7.1.

### 8.2 ¿Iconos?

- **(A) Seguir con Lucide** — **recomendado** (cero migración).  
- **(B) Heroicons** — costo sin beneficio.

### 8.3 ¿shadcn/ui como base?

- **(A) No; evolucionar `src/components/ui/` propio** — **recomendado**.  
- **(B) Adoptar shadcn selectivo** (solo Dialog/Dropdown futuros).  
- **(C) Migración total a shadcn** — rechazado (megaplan).

### 8.4 ¿Dark mode?

- **(A) Tokens claro+oscuro desde E0.1** — **recomendado**.  
- **(B) Solo claro en E0.1**.

### 8.5 ¿Alcance de adopción visual en E0.1? → **FIJO**

- Gallery DEV (`design_system` tab) + exactamente **`TaxPreviewCard.tsx`** + **bloque login pre-auth en `App.tsx`**.
- Cero Conciliación / SAT / settings completo / shell.

---

## 8bis. Migración de `Button` / `Card` / `Badge` (contrato)

| Regla | Detalle |
|-------|---------|
| API pública | **100% compatible**: mismas props (`variant`, `className`, `children`, …) |
| Cambio | Solo classNames internos → tokens / utilidades semánticas |
| Regresión | Consumidores actuales (`BankReconciliationPanel`, `SatDownloadPanel`, etc.) **no requieren cambios** |
| Breaking | **Prohibido** renombrar variants (`primary`/`secondary`/`ghost`/`danger` se mantienen) |

### 8.6 ¿Inter + JetBrains Mono?

- **(A) Sí, como pide el brief Mercury/Ramp ContAI** — **recomendado para producto app**.  
- **(B) Otra pareja (Geist / IBM Plex)**.  
*Nota:* reglas de marketing “evitar Inter” aplican a landings brand-led; ContAI app fintech prioriza legibilidad operativa.

---

## 9. Archivos a crear / modificar (exactos)

### Crear

| Ruta | Responsabilidad |
|------|-----------------|
| `src/styles/tokens.css` | Variables semánticas light/dark |
| `src/styles/tokens.ts` | (opcional) export de claves para charts |
| `src/components/ui/Input.tsx` | Input tipado |
| `src/components/ui/Alert.tsx` | Alert tipado |
| `src/components/ui/StatCard.tsx` | KPI card |
| `src/components/ui/PageHeader.tsx` | Header de página |
| `src/components/ui/DataTable.tsx` | Tabla genérica mínima |
| `src/components/ui/Chart.tsx` | Wrapper Recharts |
| `src/components/ui/Skeleton.tsx` | Placeholder |
| `src/components/DesignSystemGallery.tsx` | Gallery DEV (opcional según §8.5) |
| `docs/DESIGN_SYSTEM.md` | Documentación |
| Tests `src/components/ui/*.test.tsx` | Smoke de 2–3 componentes |

### Modificar

| Ruta | Cambio |
|------|--------|
| `src/index.css` | Import tokens + `@theme` |
| `index.html` | `lang="es"`; preconnect fonts si no fontsource |
| `package.json` | deps: `@fontsource/inter`, `@fontsource/jetbrains-mono`, `recharts` (si §8.1A) |
| `src/components/ui/Button.tsx` / `Card.tsx` / `Badge.tsx` | Tokens |
| `README.md` | Link design system |
| `implementation_plan.md` | Este documento |
| 1 componente producto (si §8.5A) | p. ej. `TaxPreviewCard.tsx` |

### No modificar

- `functions/`, SAT, Groq service, conciliación business logic  
- Estructura de tabs / `App.tsx` nav (salvo mount gallery DEV mínimo)

---

## 10. Criterios de aceptación

- [ ] `tokens.css` con paleta brand/success/warning + fonts sans/mono + dark.  
- [ ] `Button`/`Card`/`Badge` consumen tokens (sin `indigo-600` hardcode en variants base).  
- [ ] Nuevos: `Input`, `Alert`, `StatCard`, `PageHeader`, `DataTable`, `Chart` (o stub), `Skeleton`.  
- [ ] `docs/DESIGN_SYSTEM.md` con uso y a11y.  
- [ ] Lucide sin cambio de librería; Recharts solo vía `Chart.tsx`.  
- [ ] Suite existente verde; tests smoke de ui.  
- [ ] Cero cambio de flujos Conciliación/SAT/Import.  
- [ ] README enlaza el design system.

---

## 11. Orden de ejecución (tras APROBADO)

1. Tokens + fonts + `@theme`.  
2. Refactor `Button`/`Card`/`Badge`.  
3. Nuevos ui + `Chart` wrapper.  
4. Docs + gallery DEV.  
5. Migración acotada §8.5.  
6. Lint/test; **parar** (no E0.2).

---

## 12. Aprobación requerida

Responder con:

- `APROBADO: Ejecutar Entregable 0.1` + letras **§8.1–8.6**  
- o `APROBADO CON CAMBIOS: …`  
- o `RECHAZADO: …`

**Sin esa frase, no se escribe código de E0.1.**

---

## Anexo — Roadmap Fase 3 (referencia)

| ID | Entregable |
|----|------------|
| **E0.1** | Sistema de diseño (este plan) |
| E0.2 | Nueva shell / nav |
| E7.1 | Vista ejecutiva |
| E7.2 | Vista operativa |
| E7.3 | Migración secciones bajo dashboard |
