# Implementation Plan — H3 · Tipos / Dead Code (Endurecimiento)

**Proyecto:** ContAI Fase 4 → Sprint Endurecimiento  
**Fecha cierre:** 2026-08-26  
**Estado:** **CERRADO — H3 ejecutado**  
**Pre-requisito:** H2 ✅ `57066d9`  
**Evidencia:** `TSC_EXIT:0` · **211** tests passed | 6 skipped  

**Siguiente:** H4 (Strict incremental) — plan corto pendiente de aprobación.

---

## DoD H3 (cumplido)

- [x] Listeners + App tipados (`TransactionListenerDoc`, `ProductDoc`, `InventoryMovementDoc`, `RecurringTransactionDoc`, `AuditListenerDoc`, `MonthlyReportSummary`)
- [x] `monthlyAnalysis` / `isrProvisional` / `ivaMonth` tipados sin cambiar fórmulas
- [x] 0 usos `updateUserSettings`, `@google/genai`, `react-markdown`, `express` en `src/`
- [x] `GEMINI_*` fuera de `vite.config.ts`, `.env.example`, README, `docs/FASE1_CIERRE.md`
- [x] Dead re-exports bank eliminados de `monthlyAnalysis`
- [x] Deps muertas podadas del root `package.json` + lock
- [x] Suite + tsc limpios; H1/H2 intactos

---

## Archivos principales

| Acción | Ruta |
|--------|------|
| Crear | `src/types/orgListeners.ts` |
| Modificar | `useOrgCollectionListeners.ts`, `App.tsx`, `monthlyAnalysis.ts`, `isrProvisional.ts`, `ivaMonth.ts`, `utils.ts`, `taxCalculatorService.ts` |
| Modificar | `firestoreService.ts` (−`updateUserSettings`), `aiModels.ts`, `vite.config.ts`, `.env.example`, README, docs |
| Modificar | `package.json` + lock (−genai, markdown, express, dotenv, @types/express) |
