# Implementation Plan — Entregable 11.1 · Fase UI (Badge + KPI + Upload Panel)

**Proyecto:** ContAI Fase 4  
**Fecha:** 2026-08-25  
**Estado:** **✅ CERRADO UI — E11.1 MVP completo** (suite 187 passed, tsc limpio)  
**Pre-requisito:** E11.1 F0 ✅ en `main` (`ad6f80e`)  
**Aprobación:** `APROBADO: Ejecutar Entregable 11.1 - Fase UI` (+ refinamientos O(1), xlsx=`normalizeHeaderKey`, KPI solo periodo)

---

## Refinamientos auditor (aplicados)

1. Enrich: `riskIndex.rfcs.has(normalizeRfc(...))` — O(1), cero `.includes`/`.some` sobre arrays de RFC.
2. XLSX → `parseFiscalRiskXlsxBuffer` → `parseFiscalRiskRows` (misma `normalizeHeaderKey`).
3. `fiscalRiskProviders` solo sobre `periodTransactions` (`transactionsInPeriod`).

---

## Archivos entregados

| Ruta | Rol |
|------|-----|
| `src/hooks/useFiscalRiskList.ts` (+ test) | Upload phases + gate |
| `src/components/FiscalRiskListPanel.tsx` (+ test) | UI carga |
| `FiscalSection` / `TransactionsSection` / `OperationalDashboard*` / `App.tsx` | Slot, badge, KPI, index |

---

## DoD UI

- [x] Panel solo `canManageOrg` (oculto contador/viewer)
- [x] Estados uploading / processing / success / error
- [x] Badge + tooltip `FISCAL_RISK_COPY`
- [x] Flag en memoria O(1); cero writes a TX
- [x] KPI RFCs únicos en periodo
- [x] Suite + tsc (187 passed | 6 skipped; tsc limpio)
- [x] Gobernanza: E11.1 MVP cerrado tras UI; E10.x parked

---

## Deploy post-merge

```bash
firebase deploy --only firestore:rules,firestore:indexes --project contai-15259
```
