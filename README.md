# ContAI — Contabilidad digital con IA (México)

SaaS de contabilidad para PyMEs: ingresos/egresos, fiscal (IVA/ISR informativo), importación CFDI/Excel, clasificación con Groq y panel operativo sobre Firebase.

**Estado Fase 1 MVP:** cerrada y congelada en `main` (hito E4.2: `30297ce`).

---

## Stack

| Capa | Tecnología |
|------|------------|
| UI | React 19 + Vite + TypeScript + Tailwind |
| Auth / DB | Firebase Auth + Firestore |
| IA | Groq (JSON forzado + briefing); Gemini opcional/residual |
| Deploy | Vercel (`vercel.json` SPA) |

## Arquitectura (capas)

```
components/  → UI + estado local (sin Groq/Firebase SDK)
hooks/       → orquestación de UX (ej. useImportFlow)
services/    → negocio puro
  groqAIService.ts       — único contacto Groq
  firestoreService.ts    — único acceso escritura Firestore
  taxCalculatorService.ts — previos IVA/ISR (puro)
  cfdiBatchImportService.ts — batch CFDI (parse, writeBatch, Groq K=1)
```

Contratos tipados en `src/types/` (`transaction`, `cfdi`, `cfdiBatch`, `audit`, …). **Prohibido `any`** en código nuevo.

## Flujo principal Fase 1

1. **Auth** Google → org hardcodeada `org_main` (multi-tenant fuera de alcance).
2. **Import Excel** → `writeBatch` vía `firestoreService.commitExcelBatches`.
3. **Import CFDI**
   - 1 archivo → preview + registrar (sin regresión).
   - N archivos → `runCfdiBatchImport`: parse → filtro periodos cerrados → `writeBatch` (chunks ≤400) → Groq secuencial → patches por `documentId`.
4. **Clasificación** → `groqAIService` + audit `AI_CLASSIFICATION_GROQ`.
5. **Fiscal** → `taxCalculatorService.buildTaxPreview` (informativo; no sustituye SAT).
6. **Insights** → briefing/Q&A del mes vía Groq.

Estados UX de import CFDI: `idle` → `uploading` → `processing_ai` → `success` | `error` (error por `fileName`).

## Entregables cerrados

| ID | Contenido | Commit de referencia |
|----|-----------|----------------------|
| E1 | Capas, tipos, taxRates, firestoreService | (consolidados en) |
| E2 | Groq + audit + insights | `d61b731` |
| E3 | taxCalculator + TaxPreview + tests | `d61b731` |
| E4.1 | Extracción ImportModals / useImportFlow | `d61b731` |
| E4.2 | Batch CFDI + writeBatch + UX | `30297ce` |

Manual de usuario: [`MANUAL_USUARIO.md`](./MANUAL_USUARIO.md).  
Cierre / freeze: [`docs/FASE1_CIERRE.md`](./docs/FASE1_CIERRE.md).

---

## Desarrollo local

**Requisitos:** Node.js 20+ recomendado.

```bash
npm install
cp .env.example .env.local   # completar valores
npm run dev                  # http://localhost:3000
```

### Scripts

| Comando | Uso |
|---------|-----|
| `npm run dev` | Servidor Vite |
| `npm run build` | Build producción |
| `npm run lint` | `tsc --noEmit` |
| `npm test` | Vitest (app) |
| `npm run test:functions` | Vitest Cloud Functions (E6.2) |
| `npm run sync:sat-contracts` | Copia contratos SAT → `functions/src/contracts` |
| `npm run test:e2e` | Playwright |

---

## Variables de entorno

Ver [`.env.example`](./.env.example). Resumen:

| Variable | Obligatoria | Notas |
|----------|-------------|--------|
| `VITE_FIREBASE_*` | Sí (prod) | Proyecto Firebase / Auth / Firestore |
| `GROQ_API_KEY` | Sí (IA) | Inyectada en build vía `vite.config.ts` (`process.env.GROQ_API_KEY`) |
| `GROQ_MODEL` | No | Default en `src/config/aiModels.ts` |
| `GEMINI_API_KEY` | No | Residual / futuro; no es fallback de clasificación en Fase 1 |
| `VITE_APP_URL` | No | URL pública de la app |
| `VITE_SAT_PROVIDER` | No | `mock` (default) o `sat_ws` (E6.2 callables) |
| `VITE_FIREBASE_FUNCTIONS_REGION` | No | Default `us-central1` |
| `SAT_FIEL_MASTER_KEY` | Sí (Functions prod) | Secret Manager — **nunca** en Vite |

**Importante (Vercel):** configurar `GROQ_API_KEY` (y Firebase `VITE_*`) en *Project → Settings → Environment Variables* para Production/Preview. Tras cambiar env, **redeploy**.

Checklist completo: [`docs/FASE1_CIERRE.md`](./docs/FASE1_CIERRE.md).

---

## Seguridad / compliance (Fase 1)

- PII no esencial se sanitiza en `groqAIService` antes de enviar a Groq.
- Multi-CFDI usa `writeBatch` (no N `addDoc` sueltos).
- Cada clasificación exitosa deja rastro en `audit_logs` (schema compatible: `usuario_id`, `accion`, … + opcionales `provider` / `modelUsed`).

---

## Fuera de Fase 1 / Fase 2 en curso

- **E5 Conciliación bancaria** — E5.1–E5.3 en `main` (heurística, IA edge cases, UI dedicada).
- **E6.1 Descarga SAT (fundación)** — UI + provider **mock** + wire a `runCfdiBatchImport`. **No** habla al SAT ni maneja FIEL/CSD en el browser.
- **E6.2 Backend SAT** — Cloud Functions: vault FIEL, jobs, MockWs, callables.
- **E6.2.1 SOAP real** — `@nodecfdi/sat-ws-descarga-masiva` + `advanceSatDownload` (poll A2); `SAT_WS_MODE=real`. Retenciones / KMS = E6.3.
- Multi-tenant real; NER PII avanzado; seguir reduciendo God Object residual de `App.tsx`.

---

## Backend E6.2 / E6.2.1 (Cloud Functions)

**Requisitos:** Node.js 20, Firebase CLI, proyecto con Auth + Firestore + Storage.

```bash
# Contratos compartidos (fuente: packages/sat-contracts)
npm run sync:sat-contracts

cd functions && npm install
npm run lint && npm test
# Deploy (prod): configurar secret antes
firebase functions:secrets:set SAT_FIEL_MASTER_KEY
# SOAP real (staging): SAT_WS_MODE=real + FIEL vía uploadSatCredential
firebase deploy --only functions,firestore:rules,storage
```

| Pieza | Notas |
|-------|--------|
| Región | `us-central1` (`VITE_FIREBASE_FUNCTIONS_REGION`) |
| Memoria | `startSatDownload` / `advanceSatDownload` **512MiB** |
| `SAT_WS_MODE` | `mock` (default) \| `real` (Nodecfdi → SAT) |
| Flujo async | `start` solicita; frontend poll llama `advanceSatDownload` (A2) |
| Rate limit | Máx 10 jobs/hora por `org_main` |
| Provider UI | `VITE_SAT_PROVIDER=mock` \| `sat_ws` |
| Staging FIEL | [`docs/SAT_STAGING.md`](./docs/SAT_STAGING.md) |

La FIEL **nunca** viaja al browser: solo `uploadSatCredential` → cifrado envelope → Firestore Admin. Buffers de llave se zeroizan tras uso.

---

## Licencia / contacto

Repositorio: [github.com/halvarez22/ContAI](https://github.com/halvarez22/ContAI).
