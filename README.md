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
| `npm test` | Vitest (26+ tests Fase 1) |
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

**Importante (Vercel):** configurar `GROQ_API_KEY` (y Firebase `VITE_*`) en *Project → Settings → Environment Variables* para Production/Preview. Tras cambiar env, **redeploy**.

Checklist completo: [`docs/FASE1_CIERRE.md`](./docs/FASE1_CIERRE.md).

---

## Seguridad / compliance (Fase 1)

- PII no esencial se sanitiza en `groqAIService` antes de enviar a Groq.
- Multi-CFDI usa `writeBatch` (no N `addDoc` sueltos).
- Cada clasificación exitosa deja rastro en `audit_logs` (schema compatible: `usuario_id`, `accion`, … + opcionales `provider` / `modelUsed`).

---

## Fuera de Fase 1 (siguiente)

- **E5 — Conciliación bancaria** (cruce CSV banco ↔ transacciones) — ver `implementation_plan.md`.
- Descarga automática SAT.
- Multi-tenant real; NER PII avanzado; partir God Object residual de `App.tsx`.

---

## Licencia / contacto

Repositorio: [github.com/halvarez22/ContAI](https://github.com/halvarez22/ContAI).
