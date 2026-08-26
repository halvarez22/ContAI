# Implementation Plan — Entregable 10.x · Exportación de Pólizas Contables (MVP)

**Proyecto:** ContAI Fase 4  
**Fecha:** 2026-08-25  
**Estado:** **✅ CERRADO — E10.x MVP completo** (suite 199 passed, tsc limpio)  
**Aprobación:** `APROBADO: Ejecutar Entregable 10.x - Exportación Pólizas MVP` + refinamientos balance / `toFixed(2)` / botón disabled+title

---

## Refinamientos auditor (aplicados)

1. `computePolizaTotals` + rechazo `{ ok: false, reason: 'Desequilibrio en la póliza' }` antes del TXT.
2. `formatPolizaAmount` → `roundMoney(n).toFixed(2)`.
3. Botón disabled + `title` = `POLIZA_EXPORT_DISABLED_HINT` si `eligibleCount === 0`.

---

## Archivos

| Ruta | Rol |
|------|-----|
| `src/types/polizaExport.ts` | Contratos + constantes |
| `src/services/polizaExportService.ts` (+ test) | Filter, partidas, sanitize, balance, TXT |
| `src/hooks/usePolizaExport.ts` (+ test) | Blob download + audit |
| `TransactionsSection` / `App.tsx` | Botón + wire periodo |

---

## DoD

- [x] Service elegibilidad + partida doble Bancos + sanitize + balance
- [x] TXT `;` UTF-8 sin BOM, montos 2 decimales
- [x] Hook download + feedback
- [x] Botón disabled + tooltip si 0 elegibles
- [x] Suite + tsc (199 passed | 6 skipped; tsc limpio)
- [x] Gobernanza: ciclo Import→Reconcile→Risk→Export cerrado; XML ERP parked
