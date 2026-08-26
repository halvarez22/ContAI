# Implementation Plan — H2 · Lazy Loading / Suspense

**Estado:** **✅ CERRADO H2** (211 passed, tsc limpio; chunks lazy verificados en `vite build`)

## Evidencia bundle (`npm run build`)

| Chunk | ~kB | Nota |
|-------|-----|------|
| `index-*.js` | ~1039 | Shell inicial (sin SheetJS) |
| `xlsx-*.js` | ~420 | Separado — solo al parse Excel 69-B / path dinámico |
| `FiscalSection-*.js`, `OverviewSection-*.js`, `ImportModals-*.js`, `DesignSystemGallery-*.js`, `ExecutiveDashboardView-*.js`, `TransactionsSection-*.js`, … | lazy | Carga bajo demanda |

## DoD

- [x] `fiscalRiskService` sin xlsx estático; `fiscalRiskXlsx` async dynamic import
- [x] Lazy: DesignSystem, ImportModals, 5 sections, ExecutiveDashboard
- [x] `SectionSuspenseFallback` CSS puro
- [x] Hook catch error procesador Excel
- [x] Suite + tsc + evidencia `vite build` chunks
- [x] H3/H4 parked

