# Implementation Plan — Entregable 8.1 (Multi-Empresa / Multi-RFC)

**Proyecto:** ContAI Fase 4  
**Fecha:** 2026-08-24  
**Estado:** IMPLEMENTADO (E8.1) — aprobado §8.1–8.8(A) 2026-08-24  
**Commit objetivo:** `feat: add multi-organization isolation with org switcher (E8.1)`

## Resultado

### Creados
- `src/types/organization.ts` (+ tests)
- `src/services/organizationService.ts` — ensurePersonalOrg (transacción idempotente), backfill chunks, createOrg
- `src/hooks/useActiveOrganization.ts`
- `src/components/org/OrgSwitcher.tsx` (+ test)
- `src/components/org/OrgPickerScreen.tsx` (+ test)
- `firestore.indexes.json`

### Modificados
- `firestore.rules` — membership via `organization_members/{uid}_{orgId}`
- `firestoreService.ts` — organizationId obligatorio; sin `orgMain()`
- `App.tsx` — listeners por `organization_id`; settings/periodos en org; OrgSwitcher; reset al switch
- Import CFDI/Excel/SAT — organizationId activo
- `functions/src/sat/callables.ts` — `assertOrgMember` + org del request/job

### Guardrails
1. ✅ `ensurePersonalOrg` transacción sobre `personal_{uid}` + member `uid_orgId`
2. ✅ Backfill chunks 400; `org_migrated_at` solo al vaciar
3. ✅ Rules `get(.../organization_members/$(uid + '_' + orgId))`

---

## Roadmap

| ID | Estado |
|----|--------|
| Fase 3 | ✅ |
| **E8.1** | ✅ IMPLEMENTADO |
| E8.2 Invitaciones | pendiente |
| E9.1 / E10.1 | pendiente |
