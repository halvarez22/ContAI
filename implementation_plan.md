# Implementation Plan — Entregable 7.1 (Vista Ejecutiva del Dashboard)

**Proyecto:** ContAI Fase 3  
**Fecha:** 2026-08-24  
**Estado:** IMPLEMENTADO (E7.1) — aprobado §8.1–8.6(A) 2026-08-24  
**Precondiciones:** E0.1 (`cb840e0`) + E0.2 (`0f0e76b`) en `main` — tokens, `ui/`, AppShell, `useDashboardMode`  
**Objetivo:** Cuando `dashboardMode === 'ejecutivo'` y la tab activa es `overview`, renderizar una **vista ejecutiva** de KPIs macro (IVA, flujo neto, conciliación persistida, tendencia) usando únicamente componentes E0.1, alimentada por agregaciones **deterministas** sobre datos ya cargados + briefing Groq **bajo demanda** (insights existentes).  
**Fuera de alcance E7.1:** Vista operativa (E7.2), migración masiva de tabs (E7.3), nueva ruta/nav item, auto-fetch Groq al montar, reescribir Conciliación/SAT/Import, cambiar `navItems` de producto, Storybook, Cloud Functions.

---

## 0. Opinión profesional

E0.2 dejó el toggle como **estado puro**. E7.1 es el primer consumidor real de `'ejecutivo'`. Debe ser **estrecho**: un componente de presentación + un builder de métricas puro. El overview actual (KPIs indigo ad hoc + “Operación en campo”) permanece como vista **operativa** implícita cuando `mode === 'operativo'` — su extracción formal es E7.2.

**Anti-patrón a evitar:** meter agregaciones y JSX en `App.tsx` (God Object). `App` solo bifurca y pasa props ya memorizados.

---

## 1. Principio APO

```
E0.1  Design System     ✅
E0.2  Shell + toggle    ✅
E7.1  Vista ejecutiva   ← este plan
E7.2  Vista operativa   (extrae el overview actual)
E7.3  Migración secciones
```

---

## 2. Diagnóstico técnico (grafo de impacto)

### 2.1 Flujo actual

```
App.tsx
  useDashboardMode() → dashboardMode  (TopBar only hoy)
  activeTab === 'overview' → JSX operativo inline (stats indigo, TaxPreviewCard, IA reciente, capturar TX)
  taxPreview = useMemo(buildTaxPreview(...))
  transactionsInPeriod / monthlyIncome / monthlyExpenses
  periodContextPack → generateExecutiveBriefing (hoy desde análisis / modal, no overview ejecutivo)
```

### 2.2 Fuentes de datos disponibles (sin nuevos backends)

| Fuente | API existente | Uso E7.1 |
|--------|---------------|----------|
| Fiscal IVA/ISR | `taxCalculatorService.buildTaxPreview` | KPI IVA neto; hint ISR |
| Periodo | `filterTransactionsByMonth` / YTD | Flujo neto; serie chart |
| Conciliación | campo persistido `bank_reconciled` en TX (vía `bankReconciliationService` patches) | % conciliado bancario del periodo |
| Briefing | `insightsService.generateExecutiveBriefing(periodContextPack)` | Botón “Generar briefing” (no al montar) |
| UI | `StatCard`, `Chart`, `PageHeader`, `Alert`, `Card`, `Button`, `Badge` | Layout ejecutivo |

**No** usar el estado de sesión CSV de `useBankReconciliation` (vive solo en tab Conciliación) — no es fuente estable para el dashboard.

### 2.3 Efectos secundarios

| Módulo | Impacto |
|--------|---------|
| `App.tsx` | Bifurcar overview: `ejecutivo` → `<ExecutiveDashboardView />`; `operativo` → JSX actual **sin cambios** |
| Nuevos archivos | Ver §3 |
| `useDashboardMode` | Solo lectura; sin cambio de API |
| Services Groq/Firestore | Sin nuevos endpoints; briefing reusa `insightsService` |
| Tabs no-overview | **Cero** |

---

## 3. Alcance cerrado — archivos

### 3.1 Crear (exactamente)

| Ruta | Responsabilidad única |
|------|------------------------|
| `src/types/executiveDashboard.ts` | Contratos `ExecutiveKpis`, `ExecutiveTrendPoint` (sin `any`) |
| `src/services/executiveDashboardService.ts` | Agregaciones puras: KPIs + serie N meses; **sin** React/JSX |
| `src/services/executiveDashboardService.test.ts` | Unit tests de agregaciones |
| `src/components/ExecutiveDashboardView.tsx` | UI ejecutiva (props in → JSX); llama briefing vía callback prop |
| `src/components/ExecutiveDashboardView.test.tsx` | Smoke render + axe leve (jsdom) |

### 3.2 Modificar (exactamente)

| Ruta | Cambio |
|------|--------|
| `src/App.tsx` | En bloque `activeTab === 'overview'`: if `dashboardMode === 'ejecutivo'` render `ExecutiveDashboardView` con props; else overview actual intacto. Selector de periodo **compartido** arriba de ambas vistas (o prop `periodControls` — ver §8.3). |
| `docs/DESIGN_SYSTEM.md` | Nota: consumo StatCard/Chart/PageHeader en E7.1 |
| `implementation_plan.md` | Este doc → IMPLEMENTADO al cerrar |
| `README.md` | Una línea opcional E7.1 |

### 3.3 Prohibido tocar

- `BankReconciliationPanel`, SAT, Import, `TaxPreviewCard` API  
- `functions/**`, tokens.css (salvo bug → parar)  
- Extraer overview operativo a otro archivo (eso es **E7.2**)

---

## 4. Contratos y KPIs (lista cerrada = 4)

```ts
export type ExecutiveKpis = {
  periodoLabel: string;
  ivaSaldoNeto: number;
  flujoCajaNeto: number;           // ingresos - egresos del periodo
  pctBankReconciled: number;       // 0–100; TX con bank_reconciled === true / total periodo
  isrEstimadoYtd: number;          // informativo
  txCount: number;
  bankReconciledCount: number;
  warnings: string[];              // p.ej. sin TX, IVA sin desglose
};

export type ExecutiveTrendPoint = {
  mes: string;                     // ej. "Mar 2026"
  ingresos: number;
  egresos: number;
};
```

| KPI | Cálculo | Componente |
|-----|---------|------------|
| 1. IVA neto periodo | `taxPreview.iva.saldoNeto` | `StatCard` tone brand |
| 2. Flujo de caja neto | `ingresos - egresos` | `StatCard` success/danger |
| 3. % conciliado bancario | `bank_reconciled` persistido | `StatCard` |
| 4. ISR estimado YTD | `taxPreview.isr.isrEstimado` | `StatCard` |

**Chart:** últimos **6** meses (incluyendo periodo seleccionado) → `Chart type="line"` ingresos/egresos.

**Alert:** disclaimer fiscal (`taxPreview.disclaimer`) + si `lineasSinDesglose > 0` warning.

**PageHeader:** título “Vista ejecutiva” + descripción del periodo + actions (botón briefing).

**Briefing Groq:**  
- Botón “Generar borrador ejecutivo” → `onGenerateBriefing()` prop  
- `App` reutiliza handler/`generateExecutiveBriefing` + estado modal o panel inline en la vista  
- **Prohibido** llamar Groq en `useEffect` de montaje (economía tokens / E2)

---

## 5. Arquitectura de capas

```
App.tsx (orquesta)
  ├─ useMemo → executiveDashboardService.buildExecutiveSnapshot(...)
  └─ ExecutiveDashboardView (UI)
        ├─ PageHeader / StatCard×4 / Chart / Alert / Button
        └─ onGenerateBriefing → App → insightsService (existente)
```

```ts
// ❌ BAD — componente habla con Groq
await generateExecutiveBriefing(pack)

// ✅ GOOD — vista recibe callback; App/hook orquesta service
props.onGenerateBriefing()
```

`executiveDashboardService` **no** importa `groqAIService` ni Firebase.

### 5.1 Rendimiento

- `buildExecutiveSnapshot` / `buildTrendSeries` síncronos y O(n) sobre arrays ya filtrados.  
- En `App`: un `useMemo` dependiente de `[transactions, periodYear, periodMonth, taxPreview, …]`.  
- Chart: máx. 6 puntos × 2 series — trivial.  
- No bloquear UI con trabajo async salvo briefing explícito.

---

## 6. Bifurcación en `overview` (contrato UX)

| `dashboardMode` | Contenido `overview` |
|-----------------|----------------------|
| `'operativo'` | Overview actual (sin cambios de markup en E7.1) |
| `'ejecutivo'` | `ExecutiveDashboardView` |

- Toggle TopBar ya persiste; **no** crear tab nueva.  
- Periodo (año/mes): **compartido** — el ejecutivo debe respetar el mismo `periodYear`/`periodMonth` que el resto de la app.

---

## 7. Pruebas

| Tipo | Alcance |
|------|---------|
| Unit | `executiveDashboardService`: flujo neto, %, serie 6 meses, edge `txCount===0` |
| Smoke UI | `ExecutiveDashboardView` render con fixtures + axe smoke |
| Suite | `npm test` + `npm run lint` verdes (74 + nuevos) |
| Manual | Toggle Operativo↔Ejecutivo en overview; briefing on-demand; dark mode tokens |

---

## 8. Preguntas críticas (resolver antes de APROBADO)

### 8.1 ¿Dónde vive el selector de periodo en modo ejecutivo?

- **(A) Barra de periodo compartida encima de la bifurcación** (mismo Card selector para ambos modos). **Recomendado.**  
- **(B)** Selector duplicado dentro de `ExecutiveDashboardView`.  
- **(C)** Solo TopBar (sin selector mes) — rompería consistencia con métricas actuales.

### 8.2 ¿Briefing en modal existente o panel inline?

- **(A) Reutilizar modal de borrador ejecutivo ya en `App.tsx`.** **Recomendado** (cero UI nueva de modal).  
- **(B)** Panel colapsable dentro de `ExecutiveDashboardView`.  
- **(C)** Ambos.

### 8.3 ¿KPI de “% conciliación” con qué definición?

- **(A) `%` de TX del periodo con `bank_reconciled === true`.** **Recomendado** (dato persistido, estable).  
- **(B)** `%` con `status === 'conciliado'` (incluye import Excel no bancario — más laxo).  
- **(C)** Métricas de sesión CSV del panel (acopla E7.1 a Conciliación — **rechazado**).

### 8.4 ¿Series del Chart?

- **(A) 6 meses ingresos/egresos.** **Recomendado.**  
- **(B) Solo mes actual (barras por semana).**  
- **(C) IVA por mes (requiere N× buildTaxPreview — más costo CPU).**

### 8.5 ¿Mostrar TaxPreviewCard compact en ejecutivo?

- **(A) No** — KPIs + Alert disclaimer bastan; evita duplicar IVA. **Recomendado.**  
- **(B) Sí, debajo del chart.**

### 8.6 ¿Tests de `useTheme` en este entregable?

- **(A) No** — observación no bloqueante de E0.2 diferida. **Recomendado.**  
- **(B) Sí, smoke mínimo en E7.1 (scope creep menor).**

---

## 9. Criterios de aceptación (DoD)

- [ ] `dashboardMode === 'ejecutivo'` + `overview` → `ExecutiveDashboardView`; operativo → overview previo intacto.  
- [ ] 4 KPIs + Chart 6 meses + Alert disclaimer vía `ui/` E0.1.  
- [ ] Agregaciones en `executiveDashboardService` (puro); `useMemo` en App.  
- [ ] Briefing Groq solo on-demand; sin fetch al montar.  
- [ ] Cero `any` en tipos nuevos; capas components/services respetadas.  
- [ ] Tests service + smoke vista; lint/tsc; suite ≥74 + nuevos.  
- [ ] Commit + push tras verificación (`feat: add executive dashboard view with macro KPIs (E7.1)`).

---

## 10. Orden de ejecución (tras APROBADO)

1. Tipos + `executiveDashboardService` + tests unitarios.  
2. `ExecutiveDashboardView` + smoke.  
3. Bifurcar overview en `App.tsx` + cablear briefing.  
4. Docs; lint/suite; **parar** (no E7.2).

---

## 11. Aprobación requerida

Responder con:

- `APROBADO: Ejecutar Entregable 7.1` + letras **§8.1–8.6**  
- o `APROBADO CON CAMBIOS: …`  
- o `RECHAZADO: …`

**Sin esa frase, no se escribe código de E7.1.**

---

## Anexo — Roadmap Fase 3

| ID | Entregable | Estado |
|----|------------|--------|
| E0.1 | Design System | ✅ `cb840e0` |
| E0.2 | Shell / toggle | ✅ `0f0e76b` |
| **E7.1** | Vista ejecutiva | ✅ IMPLEMENTADO |
| E7.2 | Vista operativa | pendiente |
| E7.3 | Migración secciones | pendiente |
