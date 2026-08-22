# Staging manual — Descarga Masiva SAT (E6.2.1)

**CI nunca llama al SAT.** Este documento es solo para pruebas humanas en staging con FIEL real.

## Requisitos

1. Cloud Functions desplegadas (`firebase deploy --only functions,firestore:rules,storage`).
2. Secret `SAT_FIEL_MASTER_KEY` (32 bytes base64) en Secret Manager / env de Functions.
3. `SAT_WS_MODE=real` en el entorno de Functions.
4. Frontend: `VITE_SAT_PROVIDER=sat_ws`.
5. FIEL (.cer + .key + password) subida vía callable `uploadSatCredential` (nunca en el repo ni en Vite).

## Flujo de prueba

1. Iniciar sesión en la app (Auth).
2. Subir FIEL con `uploadSatCredential` (cerBase64, keyBase64, password).
3. En panel Descarga SAT: RFC de la FIEL, rango de fechas **pequeño** (1–3 días).
4. Observar job: `queued` → `soliciting` → `verifying` (poll + `advanceSatDownload`) → `downloading` → `ready` o `failed`.
5. Si `ready`, los XML deben alimentar `runCfdiBatchImport` como en E6.1.

## Casos esperados

| Caso | Resultado |
|------|-----------|
| Rango sin CFDIs | `failed` + `SAT_EMPTY` |
| FIEL incorrecta / vencida | `SAT_AUTH` / `failed-precondition` |
| Paquete parcial SAT | `ready` + `warning` (no failed) |
| Cola lenta SAT | job permanece en `verifying`; el poll sigue avanzando |

## Seguridad

- No subir CER/KEY al git.
- No loguear PEM, password ni token.
- Tras la prueba, rotar o borrar credenciales de staging si aplica.

## Dependencias

- `@nodecfdi/sat-ws-descarga-masiva@2.0.0` (versión fija).
- `npm audit` en `functions/`: vulnerabilidades residuales moderate de `firebase-admin`/`uuid` (transitivas); sin críticas en Nodecfdi al momento del pin.
