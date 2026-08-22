# Implementation Plan — Entregable 6.2 (Backend seguro SAT + FIEL + flujo Descarga Masiva)

**Proyecto:** ContAI Fase 2  
**Fecha:** 2026-08-22  
**Estado:** **IMPLEMENTADO** (aprobación auditor: 8.1A / 8.2A / 8.3A / 8.4A / 8.5A-B + ajustes tipos/memoria/backoff)  
**Precondiciones:** E6.1 en `main` (`4e0e7e1`)  
**Alcance cerrado:** Orquestación + vault + MockWs + callables + RealSatDownloadProvider.  
**Fuera / siguiente:** SOAP real = **E6.2.1**; Cloud KMS = **E6.3** (hoy Secret Manager + AES-GCM).

---

## Decisiones confirmadas (§8)

| # | Decisión |
|---|----------|
| 8.1 | E6.2 = orquestación + vault + MockWs; SOAP = E6.2.1 |
| 8.2 | Poll oculto en `download()` con backoff 2s→30s |
| 8.3 | Storage privado + signed URL / packages en doc |
| 8.4 | Max 10 jobs/hora por org |
| 8.5 | AES-GCM + `SAT_FIEL_MASTER_KEY` (Secret Manager); KMS = deuda E6.3 |

---

## Archivos entregados

### Contratos (fuente única)
- `packages/sat-contracts/src/index.ts`
- `scripts/sync-sat-contracts.mjs` → `functions/src/contracts/`
- `src/types/satDownload.ts` (re-export)

### Backend `functions/`
- `src/sat/fielVault.ts` — AES-256-GCM; sin log de PEM
- `src/sat/jobService.ts` — máquina de estados
- `src/sat/satWsClient.ts` — interface + MockWs
- `src/sat/zipUnpack.ts` — ZIP → packages
- `src/sat/callables.ts` — upload / start (512MiB) / get
- `src/index.ts`
- Rules: `firestore.rules`, `storage.rules`; `firebase.json`

### Frontend
- `src/services/satFunctionsClient.ts`
- `src/services/providers/realSatDownloadProvider.ts` (backoff)
- `src/services/satProviderFactory.ts` (`VITE_SAT_PROVIDER`)
- `src/firebase.ts` — export `functions`
- Panel/hook: disclaimer mock vs sat_ws

### Docs / scripts
- README sección Backend E6.2; `.env.example` actualizado
- Root: `sync:sat-contracts`, `test:functions`, `lint:functions`

---

## Criterios de aceptación

- [x] `functions/` Node 20 + TS; rules niegan `sat_credentials` al cliente
- [x] `fielVault` AES-GCM + Secret Manager bridge; sin log de clave privada
- [x] `jobService` estados queued → … → ready/failed
- [x] `MockSatWsClient` determinista + tests CI
- [x] Unpack / `startSatDownload` ≥512MiB
- [x] Tipos compartidos (`packages/sat-contracts` + sync)
- [x] `RealSatDownloadProvider` backoff + signed URL
- [x] Rate limit en `startSatDownload`
- [x] Tests backend + frontend; mock E6.1 por defecto
- [x] README secrets / región / deuda KMS / E6.2.1

---

## Anexo — Hitos

| Hito | Commit |
|------|--------|
| E6.1 Fundación mock | `4e0e7e1` |
| E6.2 Backend + MockWs | (pendiente commit tras verificación) |
