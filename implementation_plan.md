# Implementation Plan — Entregable 5.4 (Confirmación / resolución manual fila por fila)

**Proyecto:** ContAI Fase 2  
**Fecha:** 2026-08-24  
**Estado:** **IMPLEMENTADO** (8.1A / 8.2A / 8.3A / 8.4A / 8.5A + búsqueda in-memory + invalidación overrides)  
**Precondiciones:** E5.3 `aeef01e`

---

## Decisiones confirmadas

| # | Decisión |
|---|----------|
| 8.1 | Panel bajo la tabla |
| 8.2 | Aplicar → Confirmar |
| 8.3 | `sessionConfirmed` (UI) + `bank_reconciled` (Firestore) |
| 8.4 | score 100 + `suggestionSource: 'manual'` |
| 8.5 | conflict + no_match + ai_error |

---

## Entregables

- Tipos `BankManualOverride` / `BankManualCandidate` / source `manual`
- `listManualCandidates` (solo ledger en memoria)
- `applyManualOverrides` + `confirmSingleMatch` (audit `source: 'manual'`)
- Hook: overrides + sessionConfirmed; rematch reaplica overrides
- `BankManualMatchPanel` + filas clicables
- Tests service/view

---

## Criterios

- [x] Tipos y source manual
- [x] Búsqueda in-memory
- [x] apply + markConflicts
- [x] confirmSingle + audit source
- [x] Hook overrides / sessionConfirmed
- [x] UI dos pasos
- [x] Cero Groq/SAT/CFDI
- [x] Tests + lint

---

## Anexo

| Hito | Commit |
|------|--------|
| E5.3 UI | `aeef01e` |
| E5.4 Manual | *(pendiente commit)* |
