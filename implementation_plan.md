# Implementation Plan — E13.1 · Importación XML Nómina 1.2

**Estado:** pendiente de aprobación explícita del auditor (APO — cero código hasta OK).  
**Fecha:** 2026-08-26  
**Condiciones vinculantes:** las 4 corregidas por auditoría (monto = `Comprobante@Total`; 1 egreso/recibo; parser + router mínimo; `cfdi_uuid` + `is_nomina` sin Storage).

---

## 1. Diagnóstico técnico (código actual)

### Flujo de importación CFDI hoy

| Capa | Ruta | Rol |
|------|------|-----|
| UI | `ImportModals` / Panel · **Importar CFDI** | 1 archivo → preview; N → batch |
| Hook | `useImportFlow.ts` | Preview: `parseCfdiXml`; commit 1: crea TX + **siempre** Groq |
| Batch | `cfdiBatchImportService.ts` | `parseCfdiWithSatExtensions` → `buildCfdiTransactionDraftExtended` → `writeBatch` → Groq si `requiresGroqClassification` |
| Parser base | `src/lib/cfdiXml.ts` | CFDI 4.0 mínimo (sin nómina) |
| Extensión SAT | `src/lib/cfdiPagosParser.ts` | Global + Pagos 2.0 (`Tipo P`) — **patrón a espejar** |
| Pagos | `cfdiPaymentImportService.ts` | Ya conoce `CfdiTipoComprobanteSat` incl. `'N'` |
| TX | `types/transaction.ts` + `transactionSat.ts` | `cfdi_uuid`, `cfdi_tipo_comprobante`; **no** hay `is_nomina` aún |
| Audit | `auditService.logAuditEntry(accion, recurso, detalles)` | Schema legacy (`usuario_id`, `accion`, …) |

### Hallazgos que E13.1 debe corregir / respetar

1. **`mapTipoComprobanteToTxTipo`**: solo `E` → egreso; **`N` cae en ingreso** hoy. Para nómina del patrón (empresa) el egreso es obligatorio → el router de nómina debe forzar `tipo: 'egreso'` (y se propone ajustar el mapper para `N` → `egreso` de forma explícita y testeada).
2. **`rfc_contraparte` en egresos normales** = emisor. En nómina el empleado es **`cfdi:Receptor`** → override en rama nómina: `rfc_contraparte` = RFC receptor; `proveedor` = nombre receptor (etiqueta UI existente).
3. **Preview 1 archivo** (`useImportFlow`) **no** usa el draft builder batch ni salta Groq → hay que enrutar nómina también en el camino single-file (cuenta fija, sin clasificador).
4. **No existe** `TotalNetoPagado` en Nómina 1.2. Neto = `Comprobante@Total` (validación opcional vs `TotalPercepciones + TotalOtrosPagos − TotalDeducciones` con tolerancia de centavos).

### Violaciones que el brief original habría causado (ya descartadas)

- TX separadas ISR/IMSS → romperían conciliación 1↔N.  
- Storage de XML → fuera de alcance.  
- Reescribir importador I/E → innecesario; patrón P ya existe.

---

## 2. Estrategia de implementación

### 2.1 Detección (router)

Un XML se trata como nómina si:

- `Comprobante@TipoDeComprobante === "N"` (case-insensitive), **o**
- existe nodo con `localName === "Nomina"` (complemento `nomina12`, independiente del prefijo).

**Reglas de error claras:**

| Caso | Resultado |
|------|-----------|
| Tipo `N` **sin** nodo `Nomina` | Error: CFDI de nómina sin complemento |
| `Nomina` presente pero tipo ≠ `N` | Tratar como nómina (complemento manda) + warning en detalles de audit opcionales |
| XML malformado / sin Comprobante | Error de parseo (igual que CFDI actual) |
| Tipo `I`/`E`/`P` sin nómina | Flujo actual sin cambios |

### 2.2 Parser puro — `src/lib/nominaXmlParser.ts`

API propuesta:

```ts
parseNominaXml(xmlContent: string):
  | { ok: true; data: NominaExtracted }
  | { ok: false; errors: string[] }
```

Reutiliza helpers de localName (mismo estilo que `cfdiXml` / `cfdiPagosParser`). Internamente puede llamar `parseCfdiXml` para base (uuid, total, fechas, receptor/emisor) y luego enriquecer con complemento.

**`NominaExtracted`** (`src/types/nominaImport.ts`), campos mínimos:

| Campo | Origen SAT |
|-------|------------|
| `total` (neto egreso) | `Comprobante@Total` — **único monto de la TX** |
| `cfdiUuid` | Timbre / UUID ya extraído por `parseCfdiXml` |
| `fecha` / `fechaPago` | `Comprobante@Fecha` y/o `Nomina@FechaPago` (preferir FechaPago para concepto si existe) |
| `empleadoRfc`, `empleadoNombre` | `cfdi:Receptor@Rfc`, `@Nombre` |
| `totalPercepciones`, `totalDeducciones`, `totalOtrosPagos` | `Nomina@…` |
| `isrRetenido` | Suma `Deduccion@Importe` donde `TipoDeduccion === "002"` (0 si no hay) |
| `imssRetenido` | Idem `TipoDeduccion === "001"` |
| `tipoNomina` | `Nomina@TipoNomina` (O/E) opcional metadato |
| `emisorRfc` | Patrón (auditoría) |

**Prohibido:** leer o inventar `TotalNetoPagado`.

Validación aritmética suave (no bloqueante si falla por redondeo):  
`|Total − (TotalPercepciones + TotalOtrosPagos − TotalDeducciones)| ≤ 0.02` → si excede, **warning** en `errors` no fatales o campo `warnings[]` (definir en tipos); el monto de TX sigue siendo `Comprobante@Total`.

**Múltiples nodos `Nomina` en un CFDI:** E13.1 = **solo el primero**; documentar deuda E13.x si aparece en piloto.

### 2.3 Mapeo a 1 transacción (egreso)

| Campo TX | Valor E13.1 |
|----------|-------------|
| `tipo` | `'egreso'` |
| `monto` | `total` (Comprobante) |
| `rfc_contraparte` | RFC empleado (Receptor) |
| `proveedor` | Nombre empleado (o RFC si vacío) |
| `concepto` | p.ej. `Nómina · {nombre} · {fechaPago}` |
| `account_name` | `'Gastos de Nómina'` (constante tipada) |
| `account_source` | `'rule'` / `'nomina_default'` (consistente con strings existentes) |
| `is_nomina` | `true` |
| `nomina_isr_retained` | número |
| `nomina_imss_retained` | número |
| `nomina_total_percepciones` / `nomina_total_deducciones` | opcionales útiles |
| `cfdi_uuid` | UUID |
| `cfdi_tipo_comprobante` | `'N'` |
| `importado_cfdi` | `true` |
| `egreso_acredita_iva` / `deducible` | `false` (nómina ≠ IVA acreditable típico; alineado a no inventar fiscal) |
| `requiresGroqClassification` | **`false`** — **no enviar nombre/RFC a Groq** |

Constantes en `src/config/nominaDefaults.ts` (o junto a types): `DEFAULT_NOMINA_ACCOUNT_NAME = 'Gastos de Nómina'`.

### 2.4 Enrutador (archivos a tocar — mínimo)

| Archivo | Cambio |
|---------|--------|
| **Crear** `src/types/nominaImport.ts` | Interfaces extracción + resultado parse |
| **Crear** `src/lib/nominaXmlParser.ts` | Parser puro |
| **Crear** `src/lib/nominaXmlParser.test.ts` | ≥3 casos DoD |
| **Crear** `src/config/nominaDefaults.ts` | Cuenta default |
| **Crear** fixture XML | `src/services/providers/nominaCfdiFixtures.ts` (o bajo `src/lib/__fixtures__/`) — XML sintético válido mínimo |
| **Modificar** `src/lib/cfdiXml.ts` | `mapTipoComprobanteToTxTipo`: `N` → `egreso` (+ test) |
| **Modificar** `cfdiBatchImportService.ts` | Tras parse extendido: si nómina → `buildNominaTransactionDraft` (función nueva en service o lib) con `requiresGroqClassification: false`; skip rama P/global conflictiva |
| **Modificar** `types/cfdiBatch.ts` / payload draft | Extender payload con campos nómina opcionales **o** index signature ya existente en `TransactionDoc` |
| **Modificar** `types/transaction.ts` o `transactionSat.ts` | Tipar `is_nomina?`, `nomina_isr_retained?`, `nomina_imss_retained?` (merge-only, opcionales) |
| **Modificar** `useImportFlow.ts` | Preview/commit 1 archivo: detectar nómina → parse nómina → TX con cuenta fija **sin** `classify` Groq |
| **Modificar** `docs/MANUAL_USUARIO.md` | § breve importación nómina (misma puerta Importar CFDI) |
| **Audit** | Tras commit exitoso nómina: `logAuditEntry('NOMINA_IMPORTED', 'transactions', { documentId, cfdi_uuid, monto, … })` — sin renombrar schema |

**No tocar:** motor conciliación, pólizas, rules Firestore (campos nuevos opcionales), UI módulo nómina, PAC/CSD.

### 2.5 Efectos secundarios

| Módulo | Efecto |
|--------|--------|
| Conciliación | Beneficio: 1 egreso ≈ 1 (o N) movimiento(s) banco neto; **sin** pasivos ISR/IMSS |
| Groq / costos | Menos llamadas (cuenta fija) |
| Preview UI | Puede mostrar mismos campos CFDI; opcional badge “Nómina” si trivial (no obligatorio DoD) |
| Póliza | Entrará cuando esté clasificada (ya lo estará) + conciliada banco |
| Tipo `N` mal mapeado hoy | Corregir mapper evita ingresos fantasma si alguien ya importó N |

---

## 3. Plan de pruebas

### Unitarias (`nominaXmlParser.test.ts`)

1. **Nómina válida** — fixture con `TipoDeComprobante="N"`, nodo `Nomina`, deducciones 001/002 → `ok`, `total` correcto, ISR/IMSS, RFC receptor.  
2. **Tipo N sin complemento** → `ok: false`, mensaje claro.  
3. **XML malformado** → `ok: false`.  
4. (Extra recomendado) CFDI `I` sin nómina → el router **no** llama parser nómina (test de draft builder / detect helper).  
5. (Extra) `mapTipoComprobanteToTxTipo('N') === 'egreso'`.

### Integración ligera

- Test de `buildNominaTransactionDraft` (o equivalente): `requiresGroqClassification === false`, `account_name === 'Gastos de Nómina'`, `is_nomina === true`, **una sola** TX (no arrays de pasivos).

### Regresión

- Suite global ≥213 (+ nuevos).  
- `tsc --noEmit`, lint.  
- Smoke manual: importar 1 XML I/E y 1 N; I/E sigue con Groq; N sin clasificador.

### Evidencia cruda (post-implementación, para auditor)

- `rg` / Select-String de `TotalNetoPagado` → **cero hits** en `src/`.  
- Output vitest del archivo de tests nómina.  
- Diff files list.

---

## 4. Manual de usuario (alcance docs)

Añadir en `docs/MANUAL_USUARIO.md` (módulo Importación), subsección breve:

- Misma puerta **Importar CFDI**.  
- Si el XML es recibo de nómina timbrado, ContAI crea **un egreso** por el neto pagado al empleado, cuenta **Gastos de Nómina**.  
- No hay pantalla aparte de nómina.  
- No promete asientos separados de ISR/IMSS (E13.2).  
- Descarga SAT Beta sin cambios.

---

## 5. Preguntas críticas (resolver en aprobación del plan)

1. **¿Confirmáis `mapTipoComprobanteToTxTipo('N') → 'egreso'` de forma global?** (recomendado: sí).  
2. **¿Nombre de metadatos exactos?** Propuesta: `nomina_isr_retained`, `nomina_imss_retained`, `is_nomina` (snake_case como el resto del schema TX).  
3. **¿Un CFDI con varios nodos `Nomina`?** E13.1 = solo el primero — ¿OK?  
4. **¿Validación aritmética Total vs fórmula SAT:** solo warning, nunca rechazar si `Total` existe — ¿OK?  
5. **¿Preview single-file debe mostrar ISR/IMSS en UI** o basta persistir metadatos sin UI nueva? (DoD no exige UI; recomendación: sin UI nueva).

---

## 6. Criterios de aceptación (DoD) — checklist

- [ ] `src/lib/nominaXmlParser.ts` + tipos + tests (≥3 casos).  
- [ ] Router en batch + single-file (`useImportFlow`) para tipo N / nodo Nomina.  
- [ ] Exactamente **1 egreso** por recibo; monto = `Comprobante@Total`; metadatos ISR/IMSS; **cero** TX pasivo.  
- [ ] `is_nomina: true` + `cfdi_uuid`; sin Storage XML.  
- [ ] Sin Groq para nómina (cuenta fija).  
- [ ] Cero regresión I/E/P.  
- [ ] Manual actualizado.  
- [ ] Suite + `tsc` limpios.  
- [ ] Cero ocurrencias de `TotalNetoPagado` en código.  
- [ ] Commit **solo** tras aprobación de evidencia por auditor.

---

## 7. Fuera de alcance (E13.2+)

- Asientos / TX de ISR por pagar e IMSS por pagar.  
- Multi-nómina por CFDI.  
- Guardar XML en Storage.  
- UI módulo nómina / reportes de retenciones.  
- Cálculo fiscal propio o PAC.

---

**Entregable:** este plan. **Siguiente paso:** aprobación explícita del auditor (y respuestas a §5). Luego implementación. **Prohibido:** código antes de ese OK.
