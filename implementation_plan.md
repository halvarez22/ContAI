# Implementation Plan — Entregable 4.1 (Híbrido corto: fachada + Import)

**Proyecto:** ContAI Fase 1 MVP  
**Fecha:** 2026-08-22  
**Estado:** APROBADO e implementado (2026-08-22) — §8.1 A · §8.2 A · §8.3 A · §8.4 A  
**Precondiciones:** E1–E3 APROBADOS  
**Enfoque:** Reducir deuda de arquitectura **sin** megaplan UI y **sin** nueva funcionalidad de negocio.  
**Fuera de alcance (E4.2+):** Conciliación bancaria, `writeBatch` multi-CFDI, descarga SAT, partir todo `App.tsx` a &lt;500 líneas, audit de cálculos fiscales, persistencia `tax_deductible`.

---

## 1. Diagnóstico técnico actual

### 1.1 Fachada `geminiService`

| Hecho | Evidencia |
|-------|-----------|
| Único consumidor de la fachada | `App.tsx` L57: `import { executeAgent, AGENT_TYPES } from './services/geminiService'` |
| Contenido real | Reexport a `groqAIService` / `types/agentDecision` (10 líneas) |
| Insights / tests | Ya importan `groqAIService` directamente |
| Riesgo de borrarla | Bajo si se actualiza **un** import en App + smoke clasificación |

### 1.2 Flujo Import (vive dentro de `App.tsx`)

**Estado local (aprox. L157–165):**  
`isCfdiImportOpen`, `cfdiPreview`, `cfdiImportError`, `cfdiImporting`, `cfdiXsdMode`, `cfdiXsdValidating`, `isExcelImportOpen`, `excelImportMessage`, `excelImporting`.

**Handlers (aprox. L497–672):**  
`handleCfdiFile` → XSD + `parseCfdiXml`  
`runExcelImport` → parse xlsx + `commitExcelImport`  
`importCfdiAsTransaction` → `createTransaction` / `setTransaction` + `triggerAgent(CLASIFICADOR)`.

**UI modales (aprox. L3487–3650):**  
Modal CFDI XML + modal Excel; botones de apertura en Transactions / Fiscal.

**Dependencias externas al flujo:** `user`, `periodosCerrados`, `triggerAgent`, `HIGH_AMOUNT_REVIEW_THRESHOLD`, services/libs ya existentes.

### 1.3 Qué NO se hace en E4.1

- No se introduce máquina de estados `idle → uploading → processing_ai` completa (regla UX import: **documentada como abierta** si el flujo actual no la tiene; solo se preserva comportamiento).
- No `writeBatch` multi-archivo CFDI.
- No extraer Dashboard / Fiscal / Transacciones enteras.
- No commit git (solo si el usuario lo pide aparte).

---

## 2. Objetivo E4.1

1. **Eliminar** `src/services/geminiService.ts` y que App use `groqAIService` (+ tipos desde `types/agentDecision` si hace falta).
2. Extraer la lógica de importación a **`src/hooks/useImportFlow.ts`** (estado + handlers).
3. Extraer la UI de los modales a **`src/components/ImportModals.tsx`** (o `ImportPanel` — naming único abajo).
4. `App.tsx` solo orquesta: pasa `userId`, periodos cerrados, `triggerAgent` / clasificar, y renderiza el componente de import.
5. **Cero cambio de comportamiento** observable (mismos errores, mismos mensajes, misma secuencia create+classify CFDI).

**Éxito:** `geminiService.ts` no existe; `rg geminiService` vacío en `src/`; import CFDI/Excel funciona igual; `npm test` + `npm run lint` OK; checklist §8 actualizado.

---

## 3. Naming canónico (Responsabilidad única)

| Ruta | Responsabilidad |
|------|-----------------|
| `src/hooks/useImportFlow.ts` | Estado de modales CFDI/Excel + handlers (`handleCfdiFile`, `runExcelImport`, `importCfdiAsTransaction`, reset/close). **Sin JSX.** |
| `src/components/ImportModals.tsx` | UI de los dos modales (CFDI + Excel). Solo props + callbacks. |
| `src/services/groqAIService.ts` | Sin cambio de contrato; App importa `executeAgent`, `AGENT_TYPES` desde aquí. |
| ~~`src/services/geminiService.ts`~~ | **Eliminar** tras actualizar imports. |

**No crear** en E4.1: `ImportScreen.tsx` a pantalla completa (los imports son modales embebidos; forzar “screen” sería inventar navegación). Si en E4.2 se quiere ruta `/import`, se planifica aparte.

---

## 4. Grafo de impacto

```
ANTES:
  App → geminiService (fachada) → groqAIService
  App [estado+handlers+JSX modales Import]

DESPUÉS:
  App → groqAIService (+ types/agentDecision)
  App → useImportFlow({ userId, periodosCerrados, classifyFn, ... })
       → firestoreService / excelImportService / cfdi libs (igual que hoy)
  App → <ImportModals {...flow} />
```

**Archivos tocados:** `App.tsx`, nuevo hook, nuevo componente UI, borrado `geminiService.ts`.  
**No tocados:** `groqAIService` lógica, `taxCalculatorService`, `firestoreService` API, parsers, insights.

---

## 5. Archivos a crear / modificar / eliminar

### Crear
| Archivo | Rol |
|---------|-----|
| `src/hooks/useImportFlow.ts` | Estado + handlers import CFDI/Excel |
| `src/components/ImportModals.tsx` | Modales presentacionales |

### Modificar
| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Import desde `groqAIService`; cablear hook + `ImportModals`; quitar handlers/estado/JSX de import duplicados |

### Eliminar
| Archivo | Motivo |
|---------|--------|
| `src/services/geminiService.ts` | Fachada legacy E2 |

---

## 6. Contrato del hook (borrador)

```typescript
type UseImportFlowParams = {
  userId: string | undefined;
  periodosCerrados: string[];
  /** Clasificación post-CFDI / misma firma que triggerAgent hoy */
  classify: (type: string, data: object) => Promise<AgentDecision | undefined>;
  highAmountReviewThreshold: number;
};

// Devuelve: flags open/importing, preview, errors, handlers open/close, handleCfdiFile, runExcelImport, importCfdiAsTransaction
```

`ImportModals` recibe solo lo necesario para render (estado + handlers). **Sin** Firebase directo en el componente.

---

## 7. Estrategia de pruebas

| Qué | Cómo |
|-----|------|
| Regresión suite | `npm test` (22+ tests existentes verdes) |
| Lint | `npm run lint` |
| Smoke manual | Login → Import Excel plantilla → Import 1 CFDI XML → ver TX + clasificación Groq (si hay key) |
| Estático | `rg geminiService src` → 0 matches |
| Opcional E4.1 | Test unitario mínimo del hook **solo si** se extrae lógica pura testeable sin DOM; no bloquear E4.1 si el hook es thin wrapper |

No se exige E2E Playwright nuevo en E4.1 (YAGNI); si ya hay e2e, no romperlos.

---

## 8. Preguntas críticas

### 8.1 ¿Eliminar `geminiService.ts` del todo o dejar stub deprecado un entregable?
- **(A)** Eliminar archivo (recomendado — naming limpio).  
- **(B)** Dejar archivo con `/** @deprecated */` reexport 1 sprint.

### 8.2 ¿Nombre del componente UI?
- **(A)** `ImportModals.tsx` (recomendado — refleja que son modales).  
- **(B)** `ImportPanel.tsx`.

### 8.3 ¿`classify` se inyecta desde App (`triggerAgent`) o el hook importa `executeAgent`?
- **(A)** Inyectar desde App (recomendado — hook no acopla a audit/UI alert).  
- **(B)** Hook llama `executeAgent` + `logAuditEntry` internamente.

### 8.4 ¿Incluir en E4.1 estados UX `idle/uploading/processing_ai`?
- **(A)** No — solo mover código (recomendado; cero regresión UX).  
- **(B)** Sí — mini máquina de estados (sub-alcance; riesgo de scope creep).

**Recomendación Cursor:** **A / A / A / A**.

---

## 9. Orden de ejecución (tras `APROBADO: Ejecutar E4.1`)

1. Cambiar import App → `groqAIService`; verificar lint.  
2. Extraer `useImportFlow` (mover handlers 1:1).  
3. Extraer `ImportModals`; cablear en App.  
4. Borrar `geminiService.ts`; `rg` limpio.  
5. `npm test` + `npm run lint` + smoke import.  
6. Parar. Plan E4.2 (negocio) aparte.

---

## 10. Checklist de reglas

### ✅ Cumplidas / avanzadas en E4.1

| Regla | Cómo |
|-------|------|
| APO / plan incremental | Este doc; un entregable pequeño |
| Naming canónico | `groqAIService` sin fachada engañosa |
| Capas UI / hooks / services | Modales en components; estado en hooks; sin Firebase en JSX del modal |
| Cero regresión de comportamiento | Mover, no reinventar |
| Coexistencia IA | App habla directo a Groq |

### ⏳ Siguen abiertas (E4.2+)

| Deuda | Motivo |
|-------|--------|
| God Object residual (`App.tsx` aún grande) | Solo se saca Import |
| UX import idle→processing_ai | §8.4 A |
| `writeBatch` multi-CFDI | E4.2 |
| Audit de previos fiscales | E4.2+ |
| `any` en `triggerAgent` | Opcional tipar en E4.1 solo si es mecánico; no bloquear |
| Commit de E1–E3 untracked | Pedido explícito del usuario |

---

## 11. Aprobación para **ejecutar** (código)

El “aprobado” de dirección ya autorizó **planear** E4.1.  
Para escribir código, responde:

- `APROBADO: Ejecutar Entregable 4.1` (+ letras §8.1–8.4)  
- `APROBADO CON CAMBIOS: …`  
- `RECHAZADO: …`

**Sin esa frase de ejecución, no se implementa.**
