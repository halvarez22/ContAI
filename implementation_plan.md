# Implementation Plan — Entregable 5.1 (Conciliación bancaria — núcleo)

**Proyecto:** ContAI Fase 2  
**Fecha:** 2026-08-22  
**Estado:** **IMPLEMENTADO** (aprobación Qwen: §8.1A / 8.2A / 8.3A / 8.4A + refinamientos isConflict / merge / tipado)  
**Precondiciones:** Fase 1 freeze (`30297ce`); docs en `README.md` + `docs/FASE1_CIERRE.md`  
**Objetivo:** Convertir el prototipo de CSV bancario en flujo tipado, testeable y con confirmación de matches.  
**Fuera de alcance E5.1:** Descarga SAT, Open Banking, Groq Conciliador (E5.2), colección `bank_movements`.

---

## Criterios de aceptación (cerrados)

| Criterio | Estado |
|----------|--------|
| `types/bankReconciliation.ts` sin `any` + `isConflict` | OK |
| `transaction.ts` campos opcionales bank_* | OK |
| `bankReconciliationService` parse + heurística 2%/4d + conflictos | OK |
| Tests parse / scoring / sin match / conflicto | OK |
| `commitTransactionUpdatesBatch` con `{ merge: true }` | OK (reutilizado) |
| App confirma sin lógica de negocio | OK (`confirmNonConflictMatches`) |
| Audit `BANK_MATCH_CONFIRMED` | OK |
| Cero regresión CFDI/Excel (no tocados) | OK |

## Anexo — Cierre Fase 1

Documentación lista (puede ir en el mismo commit que E5.1 si el usuario lo solicita).
