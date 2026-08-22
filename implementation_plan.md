# Implementation Plan — Entregable 4.2 (Batch CFDI + UX de progreso)

**Proyecto:** ContAI Fase 1 MVP  
**Fecha:** 2026-08-22  
**Estado:** **IMPLEMENTADO** (aprobación Qwen 2026-08-22: §8.1A / 8.2A / 8.3A / 8.4A)  
**Precondiciones:** E1–E4.1 en `main` (`d61b731` pushed)  
**Objetivo:** Subir N CFDIs XML de una vez, persistir con `writeBatch`, clasificar con Groq, y mostrar máquina de estados de importación.  
**Fuera de alcance:** Conciliación bancaria (E5), descarga SAT, batch Excel (ya tiene `writeBatch`), partir más pantallas de App, NER PII avanzado.

---

## 1. Diagnóstico técnico actual (post-E4.1)

| Pieza | Estado |
|-------|--------|
| CFDI 1 archivo | `useImportFlow`: parse XSD → preview → `createTransaction` → `classify` → `setTransaction` |
| Excel multi | Ya usa `commitExcelBatches` / `writeBatch` |
| Firestore | `firestoreService` tiene `writeBatch` en Excel; **CFDI aún es 1 `addDoc` + 1 `setDoc` por archivo** |
| UX import CFDI | Flags booleanos (`cfdiImporting`, `cfdiXsdValidating`); **no** hay `idle→uploading→processing_ai→success/error` |
| Groq | `classify` inyectado; JSON + PII sanitize en `groqAIService` |
| UI | `ImportModals` — input CFDI `multiple` **no** habilitado |

**Violación abierta de regla groq-saas:** importación múltiple CFDI sin `writeBatch` + UX de estados incompleta.

---

## 2. Objetivo E4.2

1. Selección **múltiple** de `.xml` en el modal CFDI.
2. Pipeline batch tipado: parse/validar → filtrar periodos cerrados → **persistencia en `writeBatch`** → clasificación Groq (controlada) → actualizar resultados.
3. Máquina de estados UI: `idle` → `uploading` → `processing_ai` → `success` | `error` (error con **nombre de archivo** / índice).
4. Flujo de **1 archivo** permanece equivalente (mismo resultado; idealmente reusa el pipeline batch con `files.length === 1`).
5. Economía: chunks Firestore ≤400 ops; Groq con **concurrencia limitada** (no N llamadas en paralelo sin tope).

---

## 3. Diseño propuesto (grafo)

```
Usuario selecciona N XML
  → estado: uploading
  → por cada archivo: leer texto, XSD, parseCfdiXml
       · fallos → registrar error por fileName (no abortar todo el lote, salvo §8)
  → estado: processing_ai
  → firestoreService.commitCfdiBatch(drafts[])  // writeBatch, status pendiente
  → para cada doc (secuencial o pool ≤ K):
       classify(CLASIFICADOR, payload sanitizado vía groqAIService)
       setTransaction / batchUpdate clasificación
       audit AI_CLASSIFICATION_GROQ
  → estado: success (resumen: ok / omitidos / fallidos) | error (si lote vacío o fallo crítico)
```

**Importante:** Las tasas IVA siguen saliendo del XML/`taxRates`, no de Groq. Groq solo clasifica cuenta.

---

## 4. Archivos a crear / modificar

### Crear
| Ruta | Responsabilidad |
|------|-----------------|
| `src/types/cfdiBatch.ts` | `CfdiBatchItem`, `CfdiImportPhase`, resultados por archivo |
| `src/services/cfdiBatchImportService.ts` | Lógica pura/orquestación: parse lista, armar drafts, `writeBatch` vía firestoreService, opcional apply classifications |
| `src/services/cfdiBatchImportService.test.ts` | Tests: chunking, filtrado periodo cerrado, agregación de errores por fileName (sin red Groq real) |

### Modificar
| Ruta | Cambio |
|------|--------|
| `src/services/firestoreService.ts` | `commitCfdiTransactionBatch(drafts)` con `writeBatch` (+ chunks 400) |
| `src/hooks/useImportFlow.ts` | Estado `phase` + progreso; `handleCfdiFiles(FileList)`; mantener path 1 archivo |
| `src/components/ImportModals.tsx` | `multiple` en input CFDI; barra/texto de progreso; lista de errores por archivo |
| `src/App.tsx` | Solo si hace falta pasar props nuevas (mínimo) |

### No tocar
`groqAIService` (salvo usar API existente), `taxCalculatorService`, Excel flow (salvo compartir helpers de chunk si aplica).

---

## 5. Contrato de estados UX

```typescript
type CfdiImportPhase =
  | 'idle'
  | 'uploading'      // leyendo + validando XML/XSD
  | 'processing_ai'  // batch write + clasificación Groq
  | 'success'
  | 'error';

interface CfdiBatchFileResult {
  fileName: string;
  ok: boolean;
  documentId?: string;
  error?: string; // ej. "XSD inválido", "periodo cerrado", "Groq HTTP 429"
}
```

UI mínima (sin rediseño): texto “Validando 3/40…”, “Clasificando 12/40…”, lista de fallos con `fileName`.

---

## 6. Persistencia `writeBatch`

- Nuevo método en `firestoreService` (naming canónico, no inventar otro service de Firebase).
- Payload inicial por CFDI: mismos campos que `importCfdiAsTransaction` hoy (`status: 'pendiente'`, fiscal del XML, etc.).
- Tras Groq: actualizar `account_name`, `status`, `confidence_score`, etc.  
  - **Opción recomendada:** updates individuales o segundo `writeBatch` de patches (más simple y auditable por doc).  
  - Evitar un solo batch gigante que mezcle creates + AI si falla a mitad.

Límite Firestore: 500 ops/batch → usar `CHUNK = 400` (como Excel).

---

## 7. Economía Groq / rate limit

| Estrategia | Detalle |
|------------|---------|
| Concurrencia | Pool de **1–3** clasificaciones en paralelo (default **1** = secuencial; más seguro) |
| Backoff | Si HTTP 429, esperar y reintentar **1 vez**; si falla, marcar archivo en `error` y continuar lote |
| Tokens | Reusar `sanitizeClassificationContext` + JSON forzado (ya en E2) |
| Audit | Una entrada `AI_CLASSIFICATION_GROQ` **por documento** clasificado OK |

---

## 8. Preguntas críticas

### 8.1 Política de fallos parciales
- **(A)** Continuar el lote: OK parcial + lista de errores por archivo (recomendado).  
- **(B)** Abortar todo el lote ante el primer error de parseo.

### 8.2 Concurrencia Groq
- **(A)** Secuencial (K=1) (recomendado para MVP).  
- **(B)** Pool K=3.

### 8.3 ¿El preview de 1 CFDI se mantiene?
- **(A)** Sí: 1 archivo → preview + botón “Registrar” (comportamiento actual); N archivos → pipeline batch automático sin preview individual (recomendado).  
- **(B)** Siempre batch automático también con 1 archivo (cambia UX de 1 archivo).

### 8.4 ¿Dónde vive la orquestación batch?
- **(A)** `cfdiBatchImportService` + hook solo estado/UI (recomendado — capas).  
- **(B)** Todo en `useImportFlow` (más acoplado).

**Recomendación Cursor:** **A / A / A / A**.

---

## 9. Estrategia de pruebas

| Test | Qué |
|------|-----|
| Unit | Armar drafts desde fixtures XML mínimos; periodo cerrado omitido |
| Unit | `writeBatch` chunking (mock Firestore o función pura de partición) |
| Unit | Agregación de `CfdiBatchFileResult` |
| Regresión | Suite actual 22+ verde |
| Manual smoke | 1 XML (preview igual); 3–5 XML batch; 1 XML inválido en el medio → error nombrado |

---

## 10. Orden de ejecución (tras aprobación)

1. Tipos `cfdiBatch` + `commitCfdiTransactionBatch` en firestoreService.  
2. `cfdiBatchImportService` + tests.  
3. Extender `useImportFlow` (phase + multi).  
4. Actualizar `ImportModals` (multiple + progreso).  
5. Smoke 1 archivo + N archivos.  
6. `npm test` + `npm run lint`.  
7. Parar.

---

## 11. Checklist de reglas

### ✅ Cumplidas / avanzadas en E4.2

| Regla | Cómo |
|-------|------|
| APO / plan incremental | Este entregable acotado |
| `writeBatch` multi-CFDI | firestoreService |
| UX idle→…→success/error | phase + error por archivo |
| Capas hooks/services/UI | service orquesta; modal presenta |
| Groq JSON + PII | sin cambiar contrato E2 |
| Cero regresión 1 archivo | §8.3 A |
| Audit por clasificación | por documentId |

### ⏳ Siguen abiertas (E5+)

| Deuda | Motivo |
|-------|--------|
| Conciliación bancaria | E5 |
| God Object residual App | Solo Import ya extraído |
| Audit de previos fiscales | No es parte de batch |
| Descarga SAT | Fuera Fase 1 |
| NER nombres | YAGNI |

---

## 12. Aprobación y cierre

- **Aprobado y ejecutado** con §8.1(A) fallos parciales, §8.2(A) Groq K=1, §8.3(A) preview 1 archivo, §8.4(A) orquestación en `cfdiBatchImportService`.
- Criterios E4.2: tipos sin `any`, service + tests chunking/periodos, `commitCfdiTransactionBatch`, máquina de estados en hook, `multiple` + progreso/errores en UI, cero regresión 1 archivo, audit vía `classify` → `AI_CLASSIFICATION_GROQ`.
