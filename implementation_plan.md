# Implementation Plan — Entregable 8.2 (Invitaciones y Gestión de Equipos)

**Proyecto:** ContAI Fase 4  
**Fecha:** 2026-08-24  
**Estado:** IMPLEMENTADO (pendiente dictamen de evidencia / commit)  
**Commit objetivo:** `feat: add organization invitations and team member management (E8.2)`

## Resultado

### Creados
- `src/types/organizationInvite.ts` (+ tests)
- `src/services/organizationInviteService.ts`
- `src/hooks/useOrgMembers.ts`
- `src/components/org/OrgMembersPanel.tsx` (+ test)
- `src/components/org/AcceptInviteScreen.tsx` (+ test)
- `functions/src/org/membership.ts` — assertOrgMember / assertCanManageOrg compartidos
- `functions/src/org/inviteCrypto.ts`, `invitePolicy.ts`, `inviteEmailTemplate.ts`
- `functions/src/org/inviteCallables.ts` (+ unit tests crypto/policy)

### Modificados
- `firestore.rules` — invitations deny client write; member role change matrix
- `firestore.indexes.json` — invitations + members por org
- `functions/src/index.ts` — export callables invite
- `functions/src/sat/callables.ts` — usa membership compartido
- `functions/package.json` — `resend`
- `App.tsx` — `/invite?token=` + Equipo en settings
- `useActiveOrganization` — `adoptOrganization`
- `docs/DESIGN_SYSTEM.md`

### Guardrails + observaciones auditor
1. ✅ Alcance estricto
2. ✅ Token ≥128 bits, hash at rest, TTL 72h, server-side, rate limit
3. ✅ Matriz roles sin auto-escalamiento
4. ✅ Un pending por email+org (rotación)
5. ✅ Transparencia AcceptInviteScreen
6. ✅ Resend vía `defineSecret('RESEND_API_KEY')`
7. ✅ Normalización email en create **y** accept (`auth.token.email`)
8. ✅ Query vacía → `HttpsError('invalid-argument', 'Invitación no válida o expirada')`
9. ✅ `replaceState` limpia query tras aceptar

### Deploy operativo (fuera del código)
```bash
firebase functions:secrets:set RESEND_API_KEY
# Opcional: APP_ORIGIN, INVITE_FROM_EMAIL en params de Functions
firebase deploy --only firestore:rules,firestore:indexes,functions
```

---

## Gobernanza roadmap (congelada)

| ID | Estado |
|----|--------|
| E8.1 | ✅ |
| **E8.2** | ✅ IMPLEMENTADO (este entregable) |
| **E9.1** | **siguiente** — Conciliación Split 1↔N |
| E10.x | Export pólizas |
| E11.1 | Auditoría 69-B |
