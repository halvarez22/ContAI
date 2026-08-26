# Implementation Plan — Entregable 9.2 · Fase F4 (UI PaymentApplicationPanel + hook)

**Proyecto:** ContAI Fase 4  
**Fecha:** 2026-08-25  
**Estado:** ✅ **IMPLEMENTADO** — pendiente commit / evidencia auditor  
**Pre-requisito:** F0–F3 ✅ (`c7e2265`)  
**Siguiente:** **F5 — Groq `proposePaymentApplications`**

---

## Criterios de aceptación F4

- [x] `PaymentApplicationPanel` patrón E9.1 (checkboxes, montos, barras restante).
- [x] `usePaymentApplications` — Map inmutable, `canConfirm` en vivo, delega a F3.
- [x] Confirmar disabled si Σ ±2% inválida, overflow, ≤0, >8, cerrado, `confirming`.
- [x] Periodos cerrados: gris + badge «Factura en periodo cerrado».
- [x] Loading / anti–doble clic (`Confirmando…`).
- [x] Errores F3 → `Alert` (info/error) E0.1.
- [x] Tests hook (≥4) + smoke + axe panel; FiscalSection slot.
- [x] Gobernanza: siguiente = **F5 (Groq proposePaymentApplications)**.

## Archivos entregados

| Archivo | Rol |
|---------|-----|
| `src/hooks/usePaymentApplications.ts` | Orquestación + helpers |
| `src/hooks/usePaymentApplications.test.ts` | Unit hook |
| `src/components/PaymentApplicationPanel.tsx` | UI presentacional |
| `src/components/PaymentApplicationPanel.test.tsx` | Smoke + axe |
| `src/components/PaymentApplicationsCard.tsx` | Selector origen + panel |
| `FiscalSection` / `App` / `appSections` | Cableado periodo + ledger |

## Evidencia local (post-implementación)

- `tsc --noEmit` limpio
- Suite: **158 passed** | 6 skipped (rules sin emulador) | 37 files passed

## Gobernanza roadmap

| Fase | Estado |
|------|--------|
| E9.2 F0–F3 | ✅ |
| **E9.2 F4** | ✅ implementado (local) |
| **E9.2 F5** | **SIGUIENTE** — Groq proposePaymentApplications + audit AI |
| E10.x / E11.1 | Parked |
