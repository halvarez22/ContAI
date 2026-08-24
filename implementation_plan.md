# Implementation Plan — Entregable 7.2 (Vista Operativa del Dashboard)

**Proyecto:** ContAI Fase 3  
**Fecha:** 2026-08-24  
**Estado:** IMPLEMENTADO (E7.2) — aprobado §8.1–8.6(A) 2026-08-24  
**Precondiciones:** E0.1–E0.2 + E7.1 (`79d6e45`) en `main` — shell, toggle, `ExecutiveDashboardView`  
**Objetivo:** Cuando `dashboardMode === 'operativo'` y `activeTab === 'overview'`, reemplazar el JSX operativo inline actual por **`OperationalDashboardView`**: lista de tareas del día (pendientes / revisión / sin clasificar / riesgos) + alertas + acciones rápidas, consumiendo solo datos **persistidos ya en memoria** y componentes E0.1.  
**Fuera de alcance E7.2:** Vista ejecutiva (ya E7.1), E7.3 migración de otras tabs, levantar estado de sesión CSV de Conciliación a App, listar jobs SAT vía nuevos listeners Firestore, Groq on-demand nuevo, cambiar `navItems`, Storybook, Cloud Functions.

---

## 0. Opinión profesional

E7.1 demostró el patrón correcto: **service puro + vista props-in + bifurcación en overview**. E7.2 debe hacer lo mismo con el brazo `operativo`.

**Hallazgo crítico del grafo real (no inventar datos):**

| Fuente pedida por lineamientos | ¿Disponible en overview hoy? |
|--------------------------------|------------------------------|
| TX sin clasificar / `pendiente` / `revisión` | **Sí** — en `transactions` / `transactionsInPeriod` |
| `isConflict: true` (conciliación) | **No en overview** — solo vive en sesión de `useBankReconciliation` (tab Conciliación, CSV cargado) |
| Jobs SAT pendientes | **No listados en App** — solo callables `get/advance` por `jobId`; no hay `listJobs` en cliente |

Por tanto E7.2 debe usar **proxies persistidos** para conciliación/SAT (conteos + CTAs de navegación), no acoplar la vista al estado efímero del panel bancario ni inventar un listado de jobs. Ver §8.1–8.2.

---

## 1. Principio APO

```
E7.1  Vista ejecutiva     ✅
E7.2  Vista operativa     ← este plan
E7.3  Migración secciones
```

**Prohibido:** reescribir Conciliación/SAT; montar `useBankReconciliation` en overview; auto-Groq.

---

## 2. Diagnóstico (grafo de impacto)

### 2.1 Hoy (`operativo`)

```
overview + operativo → JSX inline:
  StatCards indigo ad hoc (ingresos/egresos/pendientes/alertas)
  TaxPreviewCard compact
  “Actividad IA” + “Operación en campo”
```

### 2.2 Flujo objetivo

```
App.tsx
  period selector (compartido, ya E7.1)
  dashboardMode === 'operativo'
    → useMemo(operationalDashboardService.buildOperationalSnapshot(...))
    → <OperationalDashboardView tasks/alerts/counts + callbacks />
  dashboardMode === 'ejecutivo'
    → ExecutiveDashboardView (sin cambios)
```

### 2.3 Efectos secundarios

| Módulo | Impacto |
|--------|---------|
| `App.tsx` | Sustituir bloque `<>…</>` operativo por `<OperationalDashboardView />`; callbacks `setActiveTab`, import, captura |
| Nuevos `types` / `service` / `view` | Ver §3 |
| E7.1 / shell / services fiscales | **Cero** |
| `useBankReconciliation` / `SatDownloadPanel` | **No montar** en overview |

---

## 3. Archivos — lista cerrada

### 3.1 Crear

| Ruta | Responsabilidad |
|------|-----------------|
| `src/types/operationalDashboard.ts` | `OperationalTask`, `OperationalAlert`, `OperationalSnapshot`, kinds tipados (sin `any`) |
| `src/services/operationalDashboardService.ts` | Agregación pura O(n) de tareas/contadores/alertas |
| `src/services/operationalDashboardService.test.ts` | Unit tests (filtros, vacío, límites) |
| `src/components/OperationalDashboardView.tsx` | UI: PageHeader, StatCard, DataTable, Alert, Button |
| `src/components/OperationalDashboardView.test.tsx` | Smoke render + empty + axe leve |

### 3.2 Modificar

| Ruta | Cambio |
|------|--------|
| `src/App.tsx` | `operativo` → `OperationalDashboardView` + `useMemo` snapshot; quitar JSX operativo inline |
| `docs/DESIGN_SYSTEM.md` | Nota consumo operativo |
| `implementation_plan.md` | Este doc → IMPLEMENTADO al cerrar |
| `README.md` | Línea opcional |

### 3.3 Prohibido

- Cambiar `ExecutiveDashboardView` / `executiveDashboardService`  
- Modificar lógica de tabs Conciliación/SAT/Import  
- Nuevos primitivos `ui/`  

---

## 4. Contratos y tareas (lista cerrada de kinds)

```ts
export type OperationalTaskKind =
  | 'revision'        // status === 'revisión'
  | 'pending'         // status === 'pendiente'
  | 'unclassified'    // !account_name (trim vacío)
  | 'high_risk';      // severity high|critical vía computeRiskRankings (reuso)

export type OperationalTask = {
  id: string;
  kind: OperationalTaskKind;
  title: string;
  subtitle: string;
  amount?: number;
  severity?: 'info' | 'warning' | 'danger';
};

export type OperationalCounts = {
  revision: number;
  pending: number;
  unclassified: number;
  highRisk: number;
  totalTasks: number;
};

export type OperationalSnapshot = {
  periodoLabel: string;
  counts: OperationalCounts;
  tasks: OperationalTask[];     // top N (default 15)
  alerts: Array<{ variant: 'info'|'warning'|'error'; title: string; body: string }>;
  isEmpty: boolean;             // period sin TX o sin tareas
};
```

### 4.1 Reglas de inclusión (periodo seleccionado)

1. Una TX puede generar **una** tarea (prioridad: `revision` > `high_risk` > `pending` > `unclassified`).  
2. Single pass O(n) sobre `transactionsInPeriod` (+ ranking ya memorizado o calculado dentro del service con el mismo threshold).  
3. Cap `MAX_TASKS = 15`; contadores reflejan totales reales (no solo top N).

### 4.2 Conciliación y SAT (sin sesión / sin listJobs)

| Necesidad auditor | Enfoque E7.2 (recomendado §8) |
|-------------------|-------------------------------|
| Conflictos bancarios | **No** `isConflict` de sesión. CTA “Ir a Conciliación” + StatCard opcional `% sin bank_reconciled` del periodo (dato persistido, coherente con E7.1). |
| Jobs SAT pendientes | **No** listener nuevo. CTA “Descarga SAT” → `onNavigate('sat_download')`. |

---

## 5. UI (`OperationalDashboardView`) — E0.1 only

| Bloque | Componentes |
|--------|-------------|
| Header | `PageHeader` título “Vista operativa” + Badge |
| Contadores | `StatCard` ×3–4: Revisión, Pendientes, Sin clasificar, (opcional) Alto riesgo |
| Alertas del día | `Alert` por cada item en `alerts` (ej. “N en revisión”, periodo vacío) |
| Tareas | `DataTable` columnas: Tipo, Concepto, Monto, Acción |
| Acciones rápidas | `Button`: Capturar TX, Importar CFDI/Excel, Conciliación, Descarga SAT, (opcional) Transacciones |

Callbacks (App orquesta; vista sin Firebase/Groq):

```ts
onNavigateTab: (id: string) => void
onOpenManualTx: () => void
onOpenCfdiImport: () => void
onOpenExcelImport: () => void
onSelectTask?: (taskId: string) => void  // opcional: abrir detalle / ir a transactions
```

**TaxPreviewCard / bloque “Actividad IA”:** se **retiran** del overview operativo (pasan a ser ruido frente a tareas). Fiscal detallado sigue en tab Fiscal; briefing en modo ejecutivo. Ver §8.3.

---

## 6. Rendimiento

- `buildOperationalSnapshot` síncrono, una pasada (+ sort estable por severity).  
- `useMemo` en App deps: `[transactionsInPeriod, periodYear, periodMonth, taxPreview.periodoLabel, HIGH_AMOUNT_REVIEW_THRESHOLD]` (o `riskRankings` si se reutiliza el memo existente).  
- DataTable ≤ 15 filas — sin virtualización.

---

## 7. Pruebas

| Tipo | Alcance |
|------|---------|
| Unit | Prioridad de kinds, vacío, cap 15, contadores vs lista |
| Smoke UI | Render, empty Alert, click CTA (vi.fn), axe |
| Suite | lint + tests ≥ 81 + nuevos |

---

## 8. Preguntas críticas

### 8.1 ¿Conflictos de conciliación (`isConflict`)?

- **(A) No usar sesión CSV; CTA Conciliación + métrica persistida `bank_reconciled`.** **Recomendado (anti-acoplamiento).**  
- **(B)** Levantar `useBankReconciliation` a `App` solo para leer conflictos (acopla overview a CSV; frágil si no hay archivo).  
- **(C)** Omitir cualquier señal de conciliación en E7.2.

### 8.2 ¿Jobs SAT pendientes?

- **(A) Solo CTA navegación a `sat_download`.** **Recomendado.**  
- **(B)** Nuevo listado Firestore de `sat_download_jobs` en App (nuevo grafo → re-plan).  
- **(C)** Mostrar fase del último run si se eleva `useSatDownload` a App (pesado).

### 8.3 ¿Conservar TaxPreviewCard compact en operativo?

- **(A) No** — foco en tareas; IVA queda en ejecutivo/Fiscal. **Recomendado.**  
- **(B) Sí**, debajo de la tabla.  
- **(C)** Solo un StatCard “IVA neto” sin card completa.

### 8.4 ¿Acción al click de una fila de tarea?

- **(A) `onNavigateTab('transactions')` + filtro futuro diferido (E7.3).** **Recomendado simple.**  
- **(B)** Abrir modal de detalle si `selectedTransaction` se setea por id.  
- **(C)** Sin acción en fila (solo CTAs globales).

### 8.5 ¿Incluir `high_risk` vía `computeRiskRankings`?

- **(A) Sí** — reutiliza lib existente, valor operativo claro. **Recomendado.**  
- **(B) No** — solo status/account_name.  
- **(C)** Solo montos > threshold hardcode (duplica lógica).

### 8.6 ¿Selector de periodo?

- **(A) Mantener compartido arriba de la bifurcación (como E7.1).** **Recomendado / ya fijo.**  
- **(B)** Mover dentro de la vista operativa.

---

## 9. Criterios de aceptación (DoD)

- [ ] `dashboardMode === 'operativo'` + overview → `OperationalDashboardView`; ejecutivo intacto.  
- [ ] JSX operativo indigo ad hoc eliminado de `App.tsx`.  
- [ ] Service puro + `useMemo`; DataTable/StatCard/Alert/Button/PageHeader E0.1.  
- [ ] Tareas desde TX del periodo (revision/pending/unclassified[/high_risk]); empty state claro.  
- [ ] CTAs: captura, import, conciliación, SAT (navegación); sin Groq al montar.  
- [ ] Sin montar hook de conciliación ni listJobs SAT en overview (salvo §8 B).  
- [ ] Tests service + smoke; lint/tsc; suite verde.  
- [ ] Commit + push tras verificación (`feat: add operational dashboard with daily task queue (E7.2)`).

---

## 10. Orden de ejecución (tras APROBADO)

1. Tipos + `operationalDashboardService` + tests.  
2. `OperationalDashboardView` + smoke.  
3. Cablear App (reemplazo bloque operativo + callbacks).  
4. Docs; lint/suite; **parar** (no E7.3).

---

## 11. Aprobación requerida

Responder con:

- `APROBADO: Ejecutar Entregable 7.2` + letras **§8.1–8.6**  
- o `APROBADO CON CAMBIOS: …`  
- o `RECHAZADO: …`

**Sin esa frase, no se escribe código de E7.2.**

---

## Anexo — Roadmap Fase 3

| ID | Entregable | Estado |
|----|------------|--------|
| E0.1 | Design System | ✅ `cb840e0` |
| E0.2 | Shell / toggle | ✅ `0f0e76b` |
| E7.1 | Vista ejecutiva | ✅ `79d6e45` |
| **E7.2** | Vista operativa | ✅ IMPLEMENTADO |
| E7.3 | Migración secciones | pendiente |
