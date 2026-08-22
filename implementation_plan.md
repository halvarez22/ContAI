# Implementation Plan — Entregable 6.2.1 (Cliente SOAP Real del SAT)

**Proyecto:** ContAI Fase 2  
**Fecha:** 2026-08-22  
**Estado:** **IMPLEMENTADO** (aprobación: 8.1A2 / 8.2A / 8.3A / 8.4A / 8.5A / 8.6A + zeroize / pin / partial warning)  
**Precondiciones:** E6.2 `f4d997b`  
**Fuera / siguiente:** Retenciones y Cloud KMS = E6.3; UI dedicada upload FIEL opcional.

---

## Decisiones confirmadas

| # | Decisión |
|---|----------|
| 8.1 | Advance desde poll frontend (`advanceSatDownload`) |
| 8.2 | Vacío → `SAT_EMPTY` |
| 8.3 | Re-auth/retry red 1× |
| 8.4 | `ambos` = dos solicitudes + merge |
| 8.5 | Timeouts + verify gap ≥2s (omitido en mock CI) |
| 8.6 | Solo CFDI |

---

## Entregables

- `@nodecfdi/sat-ws-descarga-masiva@2.0.0` (+ peers `cfdi-core`, `luxon`) versión fija
- `realSatWsClient.ts`, `satWsFactory.ts`, `satErrorMap.ts`, `credentialLoader.ts`
- `jobService`: `solicitarSatDownloadJob` + `advanceSatDownloadJob`
- Callables: `advanceSatDownload`; `start` solo solicita
- Frontend: poll llama `advanceSatDownloadJob`
- Zeroize buffers post-uso; `warning` en job si paquete parcial
- Tests CI con engine fake (sin red SAT); `docs/SAT_STAGING.md`

---

## Criterios de aceptación

- [x] Nodecfdi pin + audit (sin críticas en dep directa; moderate transitivas firebase-admin)
- [x] RealSatWsClient + timeouts/retries
- [x] satErrorMap + tests
- [x] job async solicitar → advance → download
- [x] zeroize vault
- [x] Tests sin red SAT
- [x] Frontend advance en poll
- [x] README + SAT_STAGING.md

---

## Anexo — Hitos

| Hito | Commit |
|------|--------|
| E6.2 Backend + MockWs | `f4d997b` |
| E6.2.1 SOAP real | *(pendiente commit)* |
