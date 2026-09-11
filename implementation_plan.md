# Implementation Plan — E14.0 · Demo Seed (mes contable verificable)

**Estado:** APROBADO CONDICIONALMENTE por auditor (Qwen) — plan **enmendado** con 4 correcciones + respuestas §11.  
**Pendiente:** Visto Bueno Final (APO) tras esta enmienda → luego código.  
**Fecha:** 2026-09-11 (rev. 2 — post-dictamen Qwen)  
**Excepción APO:** única ocasión autorizada para inyectar datos de demostración.  
**Prerequisito:** E13.1 + E13.2 cerrados.

---

## 0. Enmiendas obligatorias (dictamen Qwen) — INCORPORADAS

| # | Hallazgo | Corrección en este plan |
|---|----------|-------------------------|
| 1 | Purge solo por `source` es frágil | Purge compuesto: `organization_id` + `source == 'demo_seed'` + `demo_period_key == 'YYYY-MM'`; cada carga genera `demo_batch_id` UUID; docs llevan ambos campos |
| 2 | `source?: string` laxo | Unión tipada `TransactionIngestSource` (literal) |
| 3 | TX #7 “sin cuenta” desperdicia killer feature IA | Sustituir por egreso **pre-sugerido por IA** (metadata estática, sin llamar Groq): `account_source: 'ai'`, `confidence_score`, `status: 'revisión'` |
| 4 | Kill-switch opcional | **`VITE_ENABLE_DEMO_SEED=true` obligatorio**; sin flag → CTA y lógica inertes / no render |

**§9 respuestas del auditor (congeladas):**  
5.1=B Panel · 5.2=A org activa · 5.3=A owner/admin · 5.4=A prefijar+CSV · 5.5=A periodo UI · 5.6=A + flag env **obligatorio**.

---

## 1. Diagnóstico técnico actual

### Qué existe
| Área | Estado | Ruta canónica |
|------|--------|---------------|
| Persistencia TX | `transactions` + `writeBatch` vía `firestoreService` | `src/services/firestoreService.ts` |
| Tipo TX | `TransactionDoc` (+ nómina E13.1) | `src/types/transaction.ts` |
| Org activa | Multi-tenant | `useActiveOrganization.ts` |
| Conciliación CSV | `fecha,monto,descripción` | `bankReconciliationService.ts` |
| Póliza elegible | `account_name` + bank full/reconciled | `polizaExportService.ts` |
| KPIs / Tax | Cliente | `operationalDashboardService.ts`, `taxCalculatorService.ts` |
| Metadata IA ya en schema | `account_name`, `account_source: 'ai'`, `confidence_score`, `agente_ia_decision`, `status: 'revisión'` | `transaction.ts`, `cfdiBatchImportService.ts` |
| Índice purge demo | **No existe** `(organization_id, source, demo_period_key)` en `transactions` | `firestore.indexes.json` |
| Seed de producto | No existe | — |

### Problema
Piloto con org vacía → módulos en 0; no puede corroborar cálculos ni el ciclo contable.

### Qué NO resuelve
Descarga SAT productiva, Contalink, catálogo UI, seed sin flag en prod.

---

## 2. Grafo de impacto

```
[env VITE_ENABLE_DEMO_SEED=true] ──si false──► CTA oculto / service no-op
        ↓ true
[UI Panel: "Cargar mes demo"] (solo owner/admin)
        ↓ confirmación
[useDemoSeed] idle→loading→success|error
        ↓
[demoSeedService]
   1. buildDemoSeedBundle(periodKey)           // determinista + demo_batch_id
   2. purgeDemoSeed(orgId, periodKey)          // query compuesta estricta
   3. commit batches vía firestoreService
   4. buildDemoBankCsv(bundle) → download
        ↓
[Firestore] transactions { source, demo_period_key, demo_batch_id, ... }
        ↓
listeners → Panel / Transacciones / Fiscal / Póliza
```

**No tocar:** Groq runtime, Descarga SAT, Inventario, rules de create (salvo validación de campos nuevos si rules lo exigen — ver STOP).

---

## 3. Diseño del dataset (determinista)

**Periodo:** `periodKey` del UI (`YYYY-MM`).  
**Campos de gobernanza en CADA TX demo:**
```ts
source: 'demo_seed'
demo_period_key: 'YYYY-MM'   // = periodKey UI
demo_batch_id: '<uuid-v4>'   // mismo UUID para todo el batch de esa carga
```

**Volumen (~18 TX):**

| # | Tipo | Rol | Cuenta / IA | Conciliado |
|---|------|-----|-------------|------------|
| 1–3 | ingreso | Ventas IVA 16% | Ingresos por Ventas | 2 sí / 1 no |
| 4–6 | egreso | Gastos IVA acred. 16% | Gastos Operativos | 2 sí / 1 no |
| **7** | egreso | **Showcase IA** | `account_name: 'Gastos Operativos'`, `account_source: 'ai'`, `confidence_score: 0.92`, `status: 'revisión'`, `agente_ia_decision: 'approve_with_account'` | no |
| 8 | egreso | Cola revisión humana | cuenta + status revisión (sin IA o baja confianza) | no |
| 9–10 | egreso | Nómina 4 líneas | Gastos de Nómina + metadatos E13 | sí |
| 11 | egreso | Nómina sin IMSS (3 líneas) | idem | sí |
| 12–14 | mix | partial / none bank | con cuenta | partial/none |
| 15–16 | egreso | IVA 0% / exento | catálogo | sí |
| 17–18 | ingreso | Diversidad proveedor | Ingresos | sí |

> **Cambio vs rev.1:** se elimina el “gasto sin cuenta” como caso principal; el wow es **sugerencia IA lista para aprobar** (TX #7). Opcional: 1 TX adicional sin `account_name` solo si hace falta poblar KPI “Sin clasificar” — máximo 1, no el foco.

**Anclas numéricas (verificación piloto):**

| Caso | Monto / Neto | Bruto | ISR | IMSS | Esperado |
|------|--------------|-------|-----|------|----------|
| Nómina A | 8,500 | 10,000 | 1,200 | 300 | Póliza 4 líneas; Σ=10,000 |
| Nómina B | 9,700 | (neto+ISR) | 1,200 | 0 | Póliza 3 líneas |
| Venta 16% | 11,600 | 10,000+1,600 | — | — | IVA trasladado 1,600 |
| Compra 16% acred. | 5,800 | 5,000+800 | — | — | IVA acreditable 800 |
| IA #7 | monto redondo (ej. 2,320) | — | — | — | UI muestra confianza 92% + cuenta sugerida |

**CSV gemelo:** generado desde el bundle (fechas/montos de TX conciliables + 1 fila split 1↔N).

---

## 4. Purge — contrato de seguridad (Hallazgo 1)

```
query transactions where
  organization_id == :activeOrgId
  AND source == 'demo_seed'
  AND demo_period_key == :periodKey
→ delete en batches ≤400
```

**Garantías:**
- Nunca borrar por `source` solo.
- Nunca borrar TX sin `demo_period_key` coincidente.
- TX reales (sin `source: 'demo_seed'`) **intocables**.
- Tests: fixture con TX real misma org/periodo **no** se elimina.
- `demo_batch_id` se escribe en todas las TX del seed; útil para auditoría/debug; el purge operativo usa la tríada org+source+period (idempotencia por periodo).

**Índice Firestore (obligatorio en este entregable):** agregar a `firestore.indexes.json`:

```json
{
  "collectionGroup": "transactions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "organization_id", "order": "ASCENDING" },
    { "fieldPath": "source", "order": "ASCENDING" },
    { "fieldPath": "demo_period_key", "order": "ASCENDING" }
  ]
}
```

Desplegar índice antes o junto al merge a `main` (documentar en DoD / manual: `firebase deploy --only firestore:indexes` si CI no lo hace).

**Fallback si el índice aún no está habilitado:** error claro al usuario (“índice demo en provisión”); **prohibido** escanear toda la org en cliente para borrar.

---

## 5. Tipificación (Hallazgo 2)

En `src/types/transaction.ts` (o `src/types/demoSeed.ts` reexportado):

```ts
export type TransactionIngestSource =
  | 'demo_seed'
  | 'sat_download'
  | 'manual'
  | 'csv_import'
  | 'cfdi_import'
  | 'excel_import';

// en TransactionDoc:
source?: TransactionIngestSource;
demo_period_key?: string; // 'YYYY-MM'
demo_batch_id?: string;
```

Constante canónica: `DEMO_SEED_SOURCE = 'demo_seed' as const` en `src/config/demoSeed.ts`.

---

## 6. Showcase IA sin costo de API (Hallazgo 3 + respuesta §11.2)

- **No** invocar `groqAIService` en el seed.
- Inyectar metadata **estática** alineada al schema real ya usado en import CFDI:
  - `account_name: 'Gastos Operativos'`
  - `account_source: 'ai'`
  - `confidence_score: 0.92`
  - `status: 'revisión'` (o el valor que la UI ya trata como “requiere aprobación”)
  - `agente_ia_decision` / reason corta fija (“Sugerencia demo: gasto operativo recurrente”)
- El piloto ve confianza + cuenta sugerida → puede Aprobar; eso demuestra el diferencial vs Contalink **sin** tokens Groq ni no-determinismo.

---

## 7. Kill-switch (Hallazgo 4)

| Capa | Comportamiento si `VITE_ENABLE_DEMO_SEED` ≠ `'true'` |
|------|------------------------------------------------------|
| UI Panel | No renderiza el botón |
| `useDemoSeed` | `enabled: false`; `runSeed` no-op / error controlado |
| `demoSeedService.commitDemoSeed` | Guard clause: throw/`ok:false` “Demo seed deshabilitado” |
| Producción Vercel | Flag **ausente** por defecto → inerte; solo se activa en proyecto piloto / preview con env explícito |

Documentar en `.env.example`: `VITE_ENABLE_DEMO_SEED=false`.

---

## 8. Archivos a crear

| Ruta | Responsabilidad |
|------|-----------------|
| `src/config/demoSeed.ts` | Constantes, anclas, `DEMO_SEED_SOURCE`, copy UI |
| `src/types/demoSeed.ts` | Bundle, Result, estados |
| `src/services/demoSeedService.ts` | build / purge (query tríada) / commit / CSV |
| `src/services/demoSeedService.test.ts` | ≥8 tests (ver §10) |
| `src/hooks/useDemoSeed.ts` | Orquestación UI + gate flag + roles |
| `docs/DEMO_SEED_VERIFICACION.md` | Hoja de verificación numérica |

---

## 9. Archivos a modificar

| Ruta | Cambio |
|------|--------|
| `src/types/transaction.ts` | `TransactionIngestSource` + `source` / `demo_period_key` / `demo_batch_id` |
| `src/services/firestoreService.ts` | `queryDemoSeedTransactions(orgId, periodKey)` + `deleteTransactionDocs(ids)` (batches); sin SDK fuera de este service |
| `firestore.indexes.json` | Índice compuesto §4 |
| `src/components/sections/OverviewSection.tsx` (o Panel operativo) | CTA + banner si hay demo en periodo |
| `src/App.tsx` | Wire hook, periodo, org, rol, flag |
| `.env.example` | `VITE_ENABLE_DEMO_SEED=false` |
| `docs/MANUAL_USUARIO.md` | Cómo activar flag (admin), cargar demo, verificar |
| `implementation_plan.md` | Este documento |

---

## 10. Estrategia de pruebas (≥8)

1. Bundle: conteos y anclas numéricas.  
2. Toda TX lleva `source`, `demo_period_key`, `demo_batch_id`.  
3. TX #7: `account_source==='ai'` y `confidence_score===0.92`.  
4. `isPolizaEligible` count esperado > 0; póliza balancea.  
5. Nómina A → 4 líneas; Nómina B → 3 líneas.  
6. **Purge safety:** set mixto (demo + real) → solo se seleccionan docs con tríada; real intacto.  
7. Guard `VITE_ENABLE_DEMO_SEED` off → commit rechazado.  
8. CSV parseable por `parseBankCsv`.  
9. (Opcional) Tax Preview anclas IVA ±0.01.

Regresión: suite global verde; `tsc --noEmit`.

---

## 11. Respuestas a solicitud de información (auditor)

### 11.1 Índices Firestore
**Respuesta:** Hoy **no** existe un índice compuesto `(organization_id, source, demo_period_key)` en `transactions`. Los listeners cargan por `organization_id` solo; el único índice de `transactions` relevante es `(organization_id, cfdi_uuid)`.

**Acción en plan:** E14.0 **incluye** agregar ese índice en `firestore.indexes.json` y listarlo en DoD. Sin índice, el purge compuesto fallará en runtime con link de consola Firebase — no se usará full-scan cliente.

### 11.2 Integración con IA
**Respuesta:** **Basta (y se exige) inyectar metadata estática** (`account_source: 'ai'`, `confidence_score`, etc.) **sin** invocar Groq. Motivos: determinismo, cero costo API, evidencias reproducibles, alineado a Memoria de contabilidad autónoma **demostrable** en UI sin acoplar el seed a latencia/red.

---

## 12. Criterios de aceptación (DoD)

- [ ] Flag `VITE_ENABLE_DEMO_SEED=true` requerido; sin él no hay CTA ni escritura.
- [ ] CTA en Panel General; solo owner/admin.
- [ ] ≥15 TX en org activa con `source/demo_period_key/demo_batch_id`.
- [ ] Purge por tríada; test de no-borrado de TX reales.
- [ ] Índice compuesto documentado y en `firestore.indexes.json`.
- [ ] TX showcase IA con confianza visible (sin llamada Groq).
- [ ] Panel KPIs ≠ 0; Tax Preview acorde a hoja; póliza balanceada; nómina 4 y 3 líneas.
- [ ] CSV gemelo descargable / `parseBankCsv` OK.
- [ ] Manual + `DEMO_SEED_VERIFICACION.md`.
- [ ] ≥8 tests nuevos; suite global OK; `tsc` limpio.
- [ ] Sin commit hasta dictamen final.

---

## 13. Orden de ejecución (tras Visto Bueno Final)

1. Types + config + índice.  
2. `firestoreService` query/delete + `demoSeedService` + tests.  
3. Hook + UI Panel + banner + `.env.example`.  
4. Docs verificación + manual.  
5. Evidencia: vitest, tsc, diff --stat, snippet purge tríada + guard flag.  
6. Commit tentativo: `feat(E14.0): deterministic demo month seed with safe purge and AI showcase`

---

## 14. Fuera de alcance

- E14.1 SAT productivo  
- E14.2 Empty states educativos ampliados  
- E13.3 Catálogo pasivos UI  
- Llamadas Groq dentro del seed  

---

**Confirmación del autor al auditor:**  
1) Preguntas §11 respondidas.  
2) Plan actualizado con las 4 correcciones (purge tríada + `demo_batch_id`, unión tipada, showcase IA estático, kill-switch obligatorio + índice).  
3) **Cero código** hasta **Visto Bueno Final (APO)**.
