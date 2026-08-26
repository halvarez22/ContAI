# Implementation Plan — E13.2 · Asiento de nómina dinámico en exportación de póliza

**Estado:** pendiente de aprobación explícita (APO — cero código hasta OK).  
**Fecha:** 2026-08-26  
**Prerequisito cerrado:** E13.1 (`is_nomina`, metadatos ISR/IMSS/percepciones en TX; **sin** TX de pasivo en Firestore).

---

## 1. Diagnóstico (estado actual)

### Lo que E13.1 dejó listo
| Dato | Campo Firestore | Origen |
|------|-----------------|--------|
| Neto pagado | `monto` | `Comprobante@Total` |
| ISR retenido | `nomina_isr_retained` | Deducción tipo `002` |
| IMSS retenido | `nomina_imss_retained` | Deducción tipo `001` |
| Percepciones brutas | `nomina_total_percepciones` | `Nomina@TotalPercepciones` |
| Flag | `is_nomina: true` | Router nómina |
| Cuenta gasto | `account_name` | `Gastos de Nómina` (default) |

### Problema (eslabón faltante)
`polizaExportService.buildPolizaLinesForTx` genera **2 líneas** por TX egreso:
- Cargo → cuenta (`Gastos de Nómina`)
- Abono → `Bancos` (neto)

Para nómina MX estándar se necesitan **4 líneas** (mismo `txId`, un asiento):
1. **Cargo** Gastos de Nómina → **bruto** (`nomina_total_percepciones` o `neto + ISR + IMSS`)
2. **Abono** ISR por Pagar → `nomina_isr_retained`
3. **Abono** IMSS por Pagar → `nomina_imss_retained`
4. **Abono** Bancos → `monto` (neto)

### Brecha en el pipeline hoy
`App.tsx` mapea TX a `PolizaTxInput` **sin** campos nómina → aunque existan en Firestore, la exportación no los ve.

```1018:1029:src/App.tsx
  const polizaExport = usePolizaExport({
    transactions: transactionsInPeriod.map((tx) => ({
      id: String(tx.id),
      // ... sin is_nomina, nomina_isr_retained, etc.
    })),
```

### Por qué NO crear TX de pasivo (recordatorio)
El banco muestra 1 movimiento neto (o dispersión global). Pasivos solo en **momento exportación** — coherente con Opción B del auditor.

---

## 2. Estrategia (quirúrgica, sin tocar conciliación)

### 2.1 Extender contratos
**Archivo:** `src/types/polizaExport.ts`

Añadir a `PolizaTxInput` (opcionales, merge-only):
- `is_nomina?: boolean`
- `nomina_isr_retained?: number`
- `nomina_imss_retained?: number`
- `nomina_total_percepciones?: number`

Añadir a `BuildPolizaDiarioParams` (opcional):
- `nominaIsrCuenta?: string`
- `nominaImssCuenta?: string`
- ( `contraCuenta` ya existe para Bancos )

Defaults en **`src/config/nominaDefaults.ts`** (extender, no duplicar):
```ts
export const DEFAULT_NOMINA_ISR_ACCOUNT = 'ISR por Pagar';
export const DEFAULT_NOMINA_IMSS_ACCOUNT = 'IMSS por Pagar';
```

**Alcance piloto:** solo defaults en código (como `Gastos de Nómina` en E13.1).  
**Fuera de E13.2:** panel Configuración para editar cuentas ISR/IMSS en Firestore (E13.3 si el piloto lo pide).

### 2.2 Lógica de líneas nómina
**Archivo:** `src/services/polizaExportService.ts`

Nueva función pura:
```ts
buildNominaPolizaLinesForTx(tx, opts): PolizaLine[]
```

Reglas:
| # | Regla |
|---|--------|
| 1 | Solo si `tx.is_nomina === true` y `tipo === 'egreso'` |
| 2 | `neto = roundMoney(tx.monto)` |
| 3 | `isr = roundMoney(tx.nomina_isr_retained ?? 0)` |
| 4 | `imss = roundMoney(tx.nomina_imss_retained ?? 0)` |
| 5 | `bruto = roundMoney(tx.nomina_total_percepciones ?? neto + isr + imss)` |
| 6 | Validar cuadre: `bruto === neto + isr + imss` (tolerancia ±0.02). Si falla → **warning en concepto** o fallback a asiento simple 2 líneas (neto) — ver §5 |
| 7 | Generar 4 líneas; **omitir** líneas ISR/IMSS si monto = 0 |
| 8 | Mismo `concepto` / `fecha` / `txId` en las 4 |
| 9 | Cuentas: cargo = `tx.account_name`; abonos = defaults configurables |

`buildPolizaLinesForTx`: al inicio, si nómina → delegar a `buildNominaPolizaLinesForTx`.

### 2.3 Conteo de elegibles / asientos
Hoy: `eligibleCount = lines.length / 2` → **incorrecto** con 4 líneas.

Cambio: contar **transacciones exportadas** (1 nomina = 1 asiento), no pares de líneas.
- Variable interna: `exportedTxCount`
- Header TXT: `# elegibles=${exportedTxCount}` (semántica: asientos, no líneas)
- Feedback UI hook: "N asiento(s)" — sin cambio de copy si ya dice asientos

### 2.4 Cableado UI → service
**Archivo:** `src/App.tsx`  
Pasar en el map a `usePolizaExport`:
- `is_nomina`, `nomina_isr_retained`, `nomina_imss_retained`, `nomina_total_percepciones`

**Archivo:** `src/hooks/usePolizaExport.ts`  
Opcional: pasar `contraCuenta` / cuentas pasivo si en el futuro vienen de org (E13.2 solo defaults).

### 2.5 Sin cambios
- Conciliación bancaria (E9.1)
- Importación nómina (E13.1)
- Firestore schema (campos ya existen)
- Formato `.txt` (mismo delimitador `;`, mismas columnas)
- Groq / classify

---

## 3. Grafo de impacto

```text
Transacciones periodo (Firestore, is_nomina + metadatos)
       → App.tsx map PolizaTxInput (+ campos nómina)
       → usePolizaExport → buildPolizaDiarioTxt
            → buildPolizaLinesForTx
                 ├─ is_nomina? → buildNominaPolizaLinesForTx (4 líneas)
                 └─ else → 2 líneas actuales
       → computePolizaTotals (balance global)
       → download .txt
```

**Archivos tocados:** mínimo 5 (+ tests + manual).

---

## 4. Archivos

| Acción | Ruta | Responsabilidad |
|--------|------|-----------------|
| Modificar | `src/types/polizaExport.ts` | Campos nómina en `PolizaTxInput` |
| Modificar | `src/config/nominaDefaults.ts` | Cuentas default ISR/IMSS |
| Modificar | `src/services/polizaExportService.ts` | `buildNominaPolizaLinesForTx` + fix conteo |
| Modificar | `src/App.tsx` | Map metadatos nómina al export |
| Modificar | `src/services/polizaExportService.test.ts` | Casos nómina 4 líneas + balance |
| Modificar | `docs/MANUAL_USUARIO.md` | § Exportación: asiento nómina automático |
| Opcional | `src/hooks/usePolizaExport.test.ts` | Smoke si hace falta |

**Prohibido:** nuevas TX en Firestore, cambios conciliación, XML ERP, cálculo ISR/IMSS.

---

## 5. Preguntas críticas (resolver en aprobación)

1. **Fallback si metadatos incompletos** (sin ISR/IMSS/percepciones):  
   - **A)** Asiento simple 2 líneas (neto) — seguro, no bloquea export.  
   - **B)** Omitir TX con reason `nomina_metadatos_incompletos`.  
   **Recomendación auditoría:** **A** con concepto suffix `[nomina: pasivos omitidos]`.

2. **Descuadre aritmético bruto ≠ neto+ISR+IMSS** (>0.02):  
   - Usar `bruto = neto + isr + imss` recalculado y continuar (warning), no rechazar export.

3. **¿Incluir líneas ISR/IMSS en $0.00?**  
   **Recomendación:** no (omitir líneas cero).

4. **Config cuentas pasivo en UI**  
   **E13.2:** solo defaults. **E13.3:** catálogo org si piloto lo exige.

---

## 6. Plan de pruebas

### Unitarias (`polizaExportService.test.ts`)

| # | Caso | Esperado |
|---|------|----------|
| 1 | Nómina completa: neto 8500, ISR 1200, IMSS 300, percepciones 10000 | 4 líneas; cargos=10000; abonos=10000 |
| 2 | Nómina sin IMSS (0) | 3 líneas (sin abono IMSS) |
| 3 | TX normal egreso (no nómina) | 2 líneas — regresión |
| 4 | Batch mixto nómina + factura | balance global TXT |
| 5 | `eligibleCount` / asientos | 1 nomina + 1 factura = 2 asientos, no `lines/2` roto |

### Regresión
- Suite global ≥218 passed
- `tsc --noEmit` limpio

### Smoke manual piloto
1. Importar XML nómina → conciliar banco → Exportar póliza  
2. Abrir `.txt`: ver 4 líneas por empleado, cuadre cargos=abonos

---

## 7. Manual de usuario (delta)

En **§6 Exportación contable**, añadir párrafo:
- Las nóminas (`is_nomina`) generan asiento de 4 partidas al exportar (Gasto bruto, ISR por pagar, IMSS por pagar, Banco neto).
- La conciliación sigue usando **solo el egreso neto** en Transacciones.
- Cuentas de pasivo: defaults del sistema (configurables en versión futura).

---

## 8. Criterios de aceptación (DoD)

- [ ] `PolizaTxInput` incluye campos nómina; `App.tsx` los pasa
- [ ] Nómina elegible exporta 4 líneas (o 3 si IMSS/ISR = 0) balanceadas
- [ ] Bruto = percepciones almacenadas o neto+ISR+IMSS
- [ ] TX no-nómina sin regresión (2 líneas)
- [ ] Conteo asientos corregido (no `lines/2`)
- [ ] Tests ≥5 casos nuevos/extendidos en polizaExportService
- [ ] Manual actualizado
- [ ] Suite + tsc limpios
- [ ] Commit solo tras evidencia cruda y OK auditor

---

## 9. Fuera de alcance (E13.3+)

- Cuentas ISR/IMSS editables en Configuración (Firestore)
- Agrupación de 50 nóminas en 1 asiento global (dispersión bancaria única)
- Póliza XML CONTPAQi / COI nativo
- Recalcular ISR/IMSS desde catálogo SAT

---

**Entregable:** este plan.  
**Siguiente paso:** respuesta **"APROBADO E13.2"** + respuestas §5 → implementación → evidencia → commit.
