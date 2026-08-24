# Implementation Plan — Entregable 7.3 (Migración de Secciones bajo el Dashboard)

**Proyecto:** ContAI Fase 3  
**Fecha:** 2026-08-24  
**Estado:** IMPLEMENTADO (E7.3) — aprobado §8.1–8.6(A) 2026-08-24  
**Precondiciones:** E7.2 (`87b7a0c`) en `main`  
**Objetivo:** Centralizar tabs prioritarias en `AppTabRouter` + Section Views; reducir God Object `App.tsx`.  
**Commit objetivo:** `feat: migrate dashboard sections to AppTabRouter (E7.3)`

---

## Resultado de implementación

### Archivos creados
- `src/types/appSections.ts` + `appSections.test.ts`
- `src/components/layout/AppTabRouter.tsx` + test
- `src/components/sections/PeriodSelectorCard.tsx` + test
- `src/components/sections/OverviewSection.tsx`
- `src/components/sections/TransactionsSection.tsx` + test (DataTable)
- `src/components/sections/ReconciliationSection.tsx` + test
- `src/components/sections/SatDownloadSection.tsx` + test
- `src/components/sections/FiscalSection.tsx` + test

### Archivos modificados
- `src/App.tsx` — 5 tabs migradas a `AppTabRouter`; `isNavTabId` en navegación; tabs secundarias inline
- `docs/DESIGN_SYSTEM.md`

### Guardrails auditor
1. ✅ `key` estable en `AppTabRouter` (`overview-${dashboardMode}` | `activeTab`)
2. ✅ `isNavTabId` / `isMigratedNavTabId` type guards
3. ✅ `PeriodSelectorCard` puramente controlado

### Verificación
- `tsc --noEmit` OK
- **101/101 tests** (88 previos + 13 nuevos E7.3)
- Cero cambios en `useBankReconciliation`, `useSatDownload`, servicios de negocio

---

## Anexo — Roadmap Fase 3

| ID | Entregable | Estado |
|----|------------|--------|
| E0.1 | Design System | ✅ |
| E0.2 | Shell / toggle | ✅ |
| E7.1 | Vista ejecutiva | ✅ |
| E7.2 | Vista operativa | ✅ |
| **E7.3** | Migración secciones | ✅ IMPLEMENTADO |
| E7.3.1 | Tabs secundarias (analysis, inventory, …) | pendiente |
