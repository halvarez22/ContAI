# Implementation Plan — Entregable 9.1 (Conciliación Split 1↔N)

**Proyecto:** ContAI Fase 4  
**Fecha:** 2026-08-25  
**Estado:** IMPLEMENTADO (pendiente dictamen evidencia / commit autorizado en dictamen)  
**Commit objetivo:** `feat: add bank reconciliation split allocations 1-to-N (E9.1)`

## Resultado

### Creados
- `src/types/bankAllocation.ts` (+ tests) — roundMoney local, suma, remaining, status
- `src/services/bankAllocationService.ts` — validate + writeBatch movements/allocations + TX patches

### Modificados
- `bankReconciliationService.ts` — allocations, `suggestSplitForUnmatched`, `markConflicts` por remaining
- `useBankReconciliation` + `BankManualMatchPanel` — multi-select + montos
- `transaction` / dashboards KPI — `bank_reconcile_status` full
- `firestore.rules` + `firestore.indexes.json` — bank_movements / bank_allocations
- Compat 1↔1 + Groq sin cambio de contrato

### Refinamientos auditor
1. ✅ Toda aritmética vía `roundMoney` (2 decimales)
2. ✅ Validación de remaining previa al writeBatch

---

## Gobernanza roadmap

| ID | Estado |
|----|--------|
| E8.1 / E8.2 | ✅ |
| **E9.1** | ✅ IMPLEMENTADO |
| **E9.2** | **siguiente** — Globales SAT + Anticipos |
| E10.x | Export pólizas |
| E11.1 | Auditoría 69-B |
