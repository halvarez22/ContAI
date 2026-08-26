# Fase 1 MVP — Cierre y code freeze

**Fecha de cierre:** 2026-08-22  
**Commit de hito:** `30297ce` (`feat: implement batch CFDI import… E4.2`)  
**Rama congelada:** `main` (alineada con `origin/main`)

Este documento marca el **cierre formal de Fase 1**. Cambios en el núcleo MVP (auth, import CFDI/Excel, Groq classify/insights, tax preview, firestore batch) requieren justificación y plan APO; preferir ramas de hotfix etiquetadas.

---

## 1. Criterios de aceptación Fase 1 (verificados)

| Área | Criterio | Evidencia |
|------|----------|-----------|
| Capas | components / hooks / services sin God-calls a Groq/Firebase desde UI nueva | E1–E4 |
| Groq | JSON forzado, sin fallback local/Gemini en classify | E2 + rules |
| Fiscal | IVA 16/8/0 + ISR previo tipado y testeado | E3 + vitest |
| Import Excel | `writeBatch` | firestoreService |
| Import CFDI N | chunk ≤400, Groq K=1, errores por fileName, preview 1 archivo | E4.2 |
| UX import | idle → uploading → processing_ai → success/error | useImportFlow |
| Audit | `AI_CLASSIFICATION_GROQ` por doc clasificado | App triggerAgent |
| Calidad | `npm run lint` + `npm test` verdes | 26 tests al cierre |

---

## 2. Checklist deploy Vercel

Antes de dar por “producción estable” el freeze:

1. [ ] Proyecto Vercel vinculado al repo `halvarez22/ContAI`, branch `main`.
2. [ ] Build command: `npm run build` · Output: `dist` (default Vite).
3. [ ] Env **Production** (y Preview si aplica):
   - [ ] `VITE_FIREBASE_API_KEY`
   - [ ] `VITE_FIREBASE_AUTH_DOMAIN`
   - [ ] `VITE_FIREBASE_PROJECT_ID`
   - [ ] `VITE_FIREBASE_STORAGE_BUCKET`
   - [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - [ ] `VITE_FIREBASE_APP_ID`
   - [ ] `VITE_FIREBASE_DATABASE_ID` (si usas DB no-(default))
   - [ ] `GROQ_API_KEY` ← **obligatoria para IA** (inyectada en build por `vite.config.ts`)
   - [ ] `GROQ_MODEL` (opcional)
   - [ ] `VITE_APP_URL` (opcional)
4. [ ] Redeploy tras guardar variables (Vite embebe env en build time).
5. [ ] Smoke post-deploy:
   - [ ] Login Google
   - [ ] Import 1 CFDI (preview → registrar)
   - [ ] Import ≥2 CFDI (progreso + resumen)
   - [ ] Clasificación / mensaje claro si falta `GROQ_API_KEY`
   - [ ] Tab Fiscal muestra previo
6. [ ] Firestore rules / Auth providers revisados en consola Firebase (fuera de este repo).

---

## 3. Política de code freeze

**Permitido sin romper freeze (con PR pequeño):**

- Hotfix de seguridad o datos corruptos en prod.
- Docs / README / manual.
- Tests que no cambien comportamiento.

**Requiere plan APO + aprobación explícita:**

- Cualquier feature nueva (empezando por **E5 Conciliación**).
- Refactors grandes de `App.tsx`.
- Cambios de schema Firestore no compatibles hacia atrás.
- Orquestadores multi-LLM o paneles admin.

**Tag sugerido (opcional, local/remoto):**

```bash
git tag -a v1.0.0-fase1 -m "Fase 1 MVP freeze (E1-E4.2)"
git push origin v1.0.0-fase1
```

---

## 4. Deuda consciente (no bloquea cierre)

| Ítem | Notas |
|------|--------|
| `App.tsx` ~3.5k+ líneas | God Object residual; extracciones incrementales |
| Conciliación CSV | Parse + hints locales; sin persistencia de matches ni agente Conciliador cableado |
| Descarga SAT | Fuera de alcance |
| `suggestBankMatches` tipado `ledger: any[]` | Corregir en E5 |
| Audit de cálculos fiscales | No en `audit_logs` (previo informativo) |
| UX Excel | No unificada a la misma máquina de estados CFDI |

---

## 5. Transición a Fase 2

Siguiente entregable propuesto: **E5.1 — Conciliación bancaria (servicio + tipado + confirmación de matches)**.  
Plan vivo: [`../implementation_plan.md`](../implementation_plan.md).

**No se escribe código de Fase 2** hasta:

`APROBADO: Ejecutar Entregable 5.1` (+ respuestas §8 del plan).
