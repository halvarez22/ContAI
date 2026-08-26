# Implementation Plan — H4 · Strict Incremental + Prune Deps (CERRADO)

**Proyecto:** ContAI Fase 4 → Sprint Endurecimiento  
**Fecha cierre:** 2026-08-26  
**Estado:** **CERRADO — H4 ejecutado; Sprint Endurecimiento 100% completo**  
**Pre-requisito:** H3 ✅ `a69959e`  
**Evidencia:** `LINT_EXIT:0` · suite ≥ 211 passed  

**Parked post-piloto:** `"strict": true` global (strictFunctionTypes, etc.).

---

## DoD H4 (cumplido)

- [x] `strictNullChecks` + `noImplicitAny` en root `tsconfig.json` (sin `strict: true`)
- [x] Fixes nullish con narrowing / `??` / early return (cero `!` en esos fixes)
- [x] `xmllint-wasm/index-browser.mjs` declaration file con ruta exacta
- [x] Mocks tipados; `@types/react-dom` añadido (requerido por `react-dom/client`)
- [x] `date-fns` y `autoprefixer` eliminados del root (0 usos en código/config)
- [x] Casts `as unknown as` de `buildExecutiveSnapshot` eliminados; `ExecutiveTxInput` ampliado por covarianza
- [x] Suite + tsc limpios

## Gobernanza

| Entregable | Commit |
|------------|--------|
| H1 | `35e42b3` |
| H2 | `57066d9` |
| H3 | `a69959e` |
| H4 | *(este commit)* |
