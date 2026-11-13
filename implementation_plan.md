# Implementation Plan — E15 · Catálogo con código y naturaleza + mapeo

**Estado:** PENDIENTE DE DICTAMEN (auditor forense Qwen).  
**Código de aplicación:** prohibido hasta Visto Bueno de este plan y autorización explícita del usuario.  
**Fecha:** 2026-10-27  
**Sustituye como plan activo a:** E14.0 (cerrado; el texto anterior queda en el historial de git).  
**Prerequisito de producto:** reglas contables v1 de la sección 0, respondidas por el contador el 2026-10-27.

Este archivo es un solo entregable. E16, E17 y E18 no se implementan aquí.

---

## 0. Reglas contables v1 — CONGELADAS

Estas tres reglas son contrato. E15 no las reabre. E16 y E17 las consumen; no las reinterpretan.

### R1 — El asiento al importar el XML es siempre de devengo

Al registrar el CFDI el asiento (cuando E16 lo genere) es de devengo, por el **subtotal** y el **IVA**, no por el total contra Bancos.

- **Ingreso:** Cargo Clientes · Abono Ingresos (subtotal) · Abono IVA trasladado (si aplica).
- **Egreso / gasto:** Cargo Gasto (subtotal) · Cargo IVA acreditable (si aplica) · Abono Proveedores.
- **PUE no cambia la naturaleza.** El atajo PUE → Bancos, en lugar de Clientes o Proveedores, es excepción **configurable por organización**, apagada por defecto. Si se usa, la póliza deja traza de atajo.
- Campo futuro (no se persiste en E15): `organizations.atajo_pue_bancos: boolean`, default `false`. Un control que no tenga efecto violaría U-First. Lo enciende E16, que es quien arma el asiento.

### R2 — Conciliación y complemento de pago saldan la contracuenta

La póliza de devengo existe al importar y clasificar, haya o no cobro o pago.

- Conciliación bancaria y CFDI de pago (tipo P) son un segundo momento: asiento de liquidación sobre Clientes o Proveedores.
- La elegibilidad de la póliza de devengo no depende de `bank_reconciled`.

**E15 no cambia `isPolizaEligible`.** Hoy (`polizaExportService.ts`) exige `account_name` y (`bank_reconciled === true` o `bank_reconcile_status === 'full'`), y arma dos líneas por el **total** contra `Bancos`. Quitar ese candado ahora exportaría ese asiento de efectivo como si ya fuera la póliza de devengo. El candado cae en E16, junto con el generador nuevo.

### R3 — Toda cuenta de catálogo tiene código y naturaleza

| Campo | Obligatorio | Valores |
|---|---|---|
| `code` | Sí | Texto jerárquico numérico, p. ej. `401.01` |
| `name` | Sí | Nombre visible |
| `naturaleza` | Sí | `activo` \| `pasivo` \| `capital` \| `ingreso` \| `gasto` \| `iva` |
| `tipo_iva` | Solo si `naturaleza === 'iva'` | `trasladado` \| `acreditable` |

Precisión necesaria para que R3 sea implementable, derivada del propio criterio (el IVA tiene tratamiento especial y sigue siendo cuenta de balance):

- `naturaleza === 'iva'` sin `tipo_iva` es inválida.
- `tipo_iva` en una cuenta que no es `iva` es inválido.
- Para E17 (fuera de este plan): `trasladado` se presenta en pasivo; `acreditable`, en activo.
- v1 no tiene naturaleza `costo`. Un costo de ventas se registra como `gasto` hasta un plan posterior.

Sin `naturaleza`, balanza y estado de resultados serían una heurística. E15 deja el dato; no calcula los estados.

---

## 1. Diagnóstico técnico actual

### Qué existe

| Área | Estado real | Ruta |
|---|---|---|
| Catálogo | `cuentas_contables: string[]` sin código ni naturaleza. Tope de rules en el doc de **usuario**: lista &lt; 200 | `src/types/organization.ts`, `organizationService.ts`, `firestore.rules` `isValidUser` |
| Semilla en UI | Ocho textos fijos dentro de `App.tsx` (`DEFAULT_ACCOUNT_CATALOG`) | `src/App.tsx` ~151 |
| Settings | Textarea “una cuenta por línea” → `updateOrganizationSettings` | `App.tsx` `saveSettingsProfile` |
| Clasificador Groq | Prompt con cinco cuentas **quemadas**. `account_code` se parsea y **no se guarda** en la transacción | `groqAIService.ts` `systemInstructions.clasificador`, `types/agentDecision.ts`, `types/transaction.ts` |
| Import 1 XML | Escribe la TX y luego Groq. Si Groq falla, cuenta provisional `'Ingresos por Ventas'` o `'Gastos Operativos'`, `account_source: 'manual_fallback'` | `src/hooks/useImportFlow.ts` |
| Import batch | Misma clasificación, `account_source: 'ai'`, sin código | `src/services/cfdiBatchImportService.ts` |
| Alta manual | `App.tsx` llama `executeAgent` directo (el componente habla con Groq) | `App.tsx` `triggerAgent` |
| Nómina | Sin Groq. Nombre fijo `Gastos de Nómina`, `account_source: 'nomina_default'` | `src/config/nominaDefaults.ts` |
| ClaveProdServ | No se extrae. `CfdiExtracted` guarda descripción, no clave | `src/lib/cfdiXml.ts` |
| Póliza | Export TXT post-conciliación. No hay líneas de póliza persistidas | `polizaExportService.ts` |
| Reglas de mapeo | No existen | — |
| Excel | No asigna `account_name` | `excelImportService.ts` — fuera de este plan |

### Qué viola las reglas del repo

- Cuentas y lista del prompt están hardcodeadas (`App.tsx`, prompt del clasificador). HRU pide `src/config/`.
- `App.tsx` invoca Groq. La arquitectura lo prohíbe.
- `account_code` ya está en `AgentDecision` y se descarta. El catálogo no puede alimentar E17.
- No hay naturaleza, así que un estado financiero no tiene criterio de corte.

### Qué este plan no arregla

Póliza de devengo, quitar el candado bancario, balanza, estado de resultados, DIOT, contabilidad electrónica, atajo PUE operativo, reescritura de transacciones históricas, orquestador de modelos, panel admin de tasas.

---

## 2. Grafo de impacto

```
[Configuración · ChartOfAccountsSection]
        │ guarda catálogo y reglas (owner | admin)
        ▼
[useAccountCatalog]  ── no SDK ──►  [organizationService]
        │                                  │ merge org.catalogo_cuentas
        │                                  │ proyección cuentas_contables = names
        │                                  │ writeBatch de mapeo_cuentas
        ▼                                  ▼
[Firestore organizations/{id}]     [organizations/{id}/mapeo_cuentas/{ruleId}]
        │
        │  resolveEffectiveChart()  (puro, también si aún no se guardó)
        ▼
[decideAccount]  en accountMappingService
        │ 1. match de reglas (AND, prioridad). Si pega → no hay Groq
        │ 2. si no: classify inyectado → groqAIService.executeAgent
        │    el payload a Groq lleva códigos del catálogo y no lleva RFC
        │ 3. el código devuelto tiene que existir y estar activo
        ▼
llamadores:
  useImportFlow (XML individual)
  cfdiBatchImportService (batch; tipo P y nómina no pasan por Groq)
  alta / edición manual, que hoy está en App.tsx y debe usar el mismo decideAccount
        ▼
[transactions.account_code + account_name + account_source]
        │
        ├── listeners y dropdowns leen el nombre (compat)
        ├── póliza diario SIGUE igual (no lee account_code en E15)
        └── E16 / E17 aún no existen
```

`resolveEffectiveChart` y `decideAccount` son la única puerta. Prohibido dejar un llamador que siga asignando el nombre a mano con la lista vieja.

---

## 3. Efectos secundarios (lista cerrada)

| Pieza | Efecto | Acción en E15 |
|---|---|---|
| `Organization.cuentas_contables` | Sigue existiendo. Pasa a ser proyección de nombres, escrita en el mismo `setDoc` | No borrarla. Deja de ser editable |
| Dropdowns y filtros que leen `account_name` | Siguen mostrando texto | La fuente de opciones pasa a `catalogo` activo, ordenado por `code` |
| `useActiveOrganization` | Hoy parsea `string[]` | Parsea el catálogo estructurado y, si falta, deriva en memoria |
| Tests de org (`OrgSwitcher`, `OrgPicker`) | Construyen `cuentas_contables: []` | Añadir `catalogo_cuentas: []` |
| Prompt `clasificador` | Deja de traer cuentas fijas | El catálogo viaja en el user payload, ya sanitizado |
| `groqAIService.test.ts` | Espera el JSON actual | Cubrir `account_code` aceptado solo si el resolver lo valida |
| `parseCfdiXml` / fixtures | Campo nuevo | `claveProdServ` del primer `Concepto`. Los fixtures que no lo traigan quedan en `''` |
| Nómina | Sigue sin Groq | Además del nombre, persiste el `code` de la semilla `601.01` si el nombre coincide |
| Demo seed | Nombres `Ingresos por Ventas` y `Gastos Operativos` | No se renombran. Coinciden con la semilla |
| `isPolizaEligible` y TXT | Ninguno | No se tocan |
| `paymentApplicationService`, SAT, insights, conciliador, auditor | Ninguno | No se tocan |
| `firestore.rules` `isValidUser` | El tope de `cuentas_contables` está en **users**, no en orgs | No mover ese tope. Validar el catálogo en `organizations` |
| Transacciones ya guardadas | Tienen nombre y no código | No se reescriben. El código entra en clasificaciones nuevas |
| Auditoría | Schema `usuario_id`, `accion`, `recurso`, `detalles` | Acciones nuevas abajo. Sin RFC en `detalles` |

---

## 4. Contrato

### 4.1 Cuenta

Archivo nuevo `src/types/chartOfAccounts.ts`.

```ts
naturaleza: 'activo' | 'pasivo' | 'capital' | 'ingreso' | 'gasto' | 'iva'
tipo_iva?: 'trasladado' | 'acreditable' // obligatorio si y solo si naturaleza === 'iva'
code: string   // /^[0-9]+(\.[0-9]+)*$/ , longitud 1..20, único en la org
name: string   // trim, 1..80
activa: boolean
```

Funciones puras en `accountMappingService.ts`: `assertCatalog(accounts)`, `assertAccount(account)`. Rechazan duplicado de `code`, `iva` sin `tipo_iva`, y `tipo_iva` fuera de `iva`.

### 4.2 Dónde se guarda

- Fuente de verdad: `organizations/{id}.catalogo_cuentas` (array de mapas, máximo 200).
- Proyección, mismo write: `cuentas_contables = catalogo_cuentas.filter(a => a.activa).map(a => a.name)`.
- Pendientes legado (nombres que no se pudieron mapear, sin naturaleza inventada): `organizations/{id}.catalogo_pendientes: string[]`.
- Reglas: subcolección `organizations/{id}/mapeo_cuentas/{ruleId}`.

No hay subcolección de cuentas: el catálogo viaja con la org y el tope ya usado en el producto es 200.

### 4.3 Semilla oficial v1 (`src/config/chartOfAccounts.ts`)

Dictamen del auditor (2026-10-27): tabla apta, alineada al Anexo 24 de la RMF 2026. Los nombres de ContAI se conservan porque el demo y la nómina ya los persisten. `118.01` y `208.01` existen para el cobro o pago (E16); el devengo de la importación usa `119.01` y `209.01`. No hay cuenta «Otros».

| code | Nombre en ContAI | Nombre oficial Anexo 24 | naturaleza | tipo_iva |
|---|---|---|---|---|
| 102.01 | Bancos | Bancos nacionales | activo | — |
| 105.01 | Clientes | Clientes nacionales | activo | — |
| 119.01 | IVA acreditable | IVA pendiente de pago | iva | acreditable |
| 118.01 | IVA acreditable pagado | IVA acreditable pagado | iva | acreditable |
| 201.01 | Proveedores | Proveedores nacionales | pasivo | — |
| 209.01 | IVA trasladado | IVA trasladado no cobrado | iva | trasladado |
| 208.01 | IVA trasladado cobrado | IVA trasladado cobrado | iva | trasladado |
| 216.01 | ISR por Pagar | ISR retenido por sueldos y salarios | pasivo | — |
| 216.11 | IMSS por Pagar | Retenciones de IMSS a los trabajadores | pasivo | — |
| 401.01 | Ingresos por Ventas | Ventas y/o servicios gravados a la tasa general | ingreso | — |
| 115.02 | Insumos y Mercancías | Materia prima y materiales | activo | — |
| 601.84 | Gastos Operativos | Otros gastos generales | gasto | — |
| 601.49 | Viáticos y Viajes | Viáticos y gastos de viaje | gasto | — |
| 601.61 | Marketing y Publicidad | Propaganda y publicidad | gasto | — |
| 601.34 | Servicios Profesionales | Honorarios a PF nacionales | gasto | — |
| 601.01 | Gastos de Nómina | Sueldos y salarios | gasto | — |

`nominaDefaults.ts` importa `601.01`, `216.01` y `216.11` desde esta semilla. No se duplican los nombres. El provisional de egreso es `601.84` (Gastos Operativos), no la cuenta de nómina.

### 4.4 Resolución del catálogo efectivo

`resolveEffectiveChart(org)`:

1. Si `catalogo_cuentas` tiene elementos válidos → ese array.
2. Si no, y `cuentas_contables` tiene textos → `migrateLegacyNames`.
3. Si no hay nada → semilla completa.

`migrateLegacyNames(names)`:

- Match por nombre normalizado (trim, minúsculas, espacios colapsados) **solo** contra `name` de la semilla.
- `'Nómina y Honorarios'` no es `'Gastos de Nómina'`. `'Impuestos'` no es IVA. Esos quedan en `pendientes`.
- Un pendiente no es destino de regla ni opción de Groq hasta que el usuario le asigne `code` y `naturaleza` y lo guarde.
- Org nueva (`createOrganizationForUser`): se escribe la semilla y `cuentas_contables` derivado. `catalogo_pendientes: []`.
- Org vieja: no hay script de backfill. El cálculo en memoria y el guardado explícito usan la misma función. Nada se persiste solo por abrir la pantalla.

### 4.5 Regla de mapeo

```ts
type AccountMappingRule = {
  id: string
  organization_id: string
  priority: number          // menor gana; empate → id asc
  enabled: boolean
  account_code: string      // cuenta activa del catálogo efectivo
  match: {
    tipo?: 'ingreso' | 'egreso'
    cfdi_tipo?: 'I' | 'E' | 'N' | 'P' | 'T'
    clave_prod_serv?: string  // 8 dígitos, exacta
    metodo_pago_sat?: 'PUE' | 'PPD'
    uso_cfdi?: string
    rfc_contraparte?: string  // exacto, 12 o 13; solo para match local
  }
}
```

- Al menos una clave dentro de `match`.
- Todas las claves presentes deben cumplirse (AND).
- Primera regla habilitada en orden de prioridad gana.
- Sin reglas sembradas. El usuario las crea.

Esto no es el fallback por keywords prohibido en la política de IA. Es configuración del contador, evaluada **antes** de Groq. Si ninguna regla pega, se llama a Groq. Si Groq falla, se mantiene el comportamiento actual de no bloquear el XML: cuenta provisional de la semilla (`401.01` ingreso, `601.84` egreso), `confidence_score: 0`, `account_source: 'manual_fallback'`, `status: 'revisión'`. No se elige cuenta por palabras del concepto.

### 4.6 `decideAccount`

Vive en `accountMappingService.ts`. No importa Firebase ni `groqAIService`. Recibe `classify` por parámetro.

Entrada de match (local, puede incluir RFC y clave):

`tipo`, `cfdi_tipo`, `clave_prod_serv`, `metodo_pago_sat`, `uso_cfdi`, `rfc_contraparte`, `monto`, `concepto`, `proveedor`, `fecha`, `moneda`.

Salida:

```ts
{
  account_code: string
  account_name: string       // nombre del catálogo, no el texto libre del modelo
  account_source: 'rule' | 'ai' | 'manual_fallback' | 'nomina_default'
  confidence_score: number
  requires_human_approval: boolean
  rule_id?: string
}
```

- Regla ganadora → no se llama `classify`. `account_source: 'rule'`. `requires_human_approval: false` salvo el umbral de monto que ya aplica el llamador (`HIGH_AMOUNT_REVIEW_THRESHOLD`, hoy 50000 en `App.tsx`; el umbral se lee, no se mueve).
- Groq: el payload que sale hacia `classify` incluye `catalog: { code, name, naturaleza }[]` con todas las cuentas activas. **No incluye** `rfc_contraparte`, domicilio, email ni teléfono. El prompt ordena: `account_code` tiene que ser uno de esa lista.
- Código ausente, inactivo o inventado → no se guarda el nombre libre. Se trata como fallo de Groq (provisional + revisión).
- Nómina no entra a `decideAccount`. Su camino actual se conserva y se le añade `account_code` de `601.01` cuando el nombre es el de la semilla.

### 4.7 Transacción

Campos nuevos opcionales en `TransactionDoc` (no renombrar los existentes):

- `account_code?: string`
- `clave_prod_serv?: string` (primer concepto; permite re-mapear sin el XML)

`isValidTransaction` sigue con `hasAll` de los campos actuales. `account_code` ausente sigue siendo válido. Si se valida en rules, solo cuando la clave viene: string de 1 a 20.

### 4.8 Auditoría

| Evento | `accion` | `recurso` | `detalles` |
|---|---|---|---|
| Guardar catálogo | `CATALOGO_CUENTAS_UPDATED` | `organizations` | `organization_id`, `cuentas`, `pendientes` (conteos) |
| Guardar regla | `MAPEO_CUENTA_SAVED` | `mapeo_cuentas` | `organization_id`, `rule_id`, `account_code` |
| Borrar regla | `MAPEO_CUENTA_DELETED` | `mapeo_cuentas` | `organization_id`, `rule_id` |
| Match de regla al importar | `ACCOUNT_MAPPED_BY_RULE` | `transactions` | `id`, `account_code`, `rule_id` |
| Groq | `AI_CLASSIFICATION_GROQ` | id de transacción o `ai_service` (el que ya use el llamador) | decisión, `account_code`. Sin RFC. Opcionales `provider`, `modelUsed`, `tokensUsed` |

Varias reglas en un solo guardado → `writeBatch`.

### 4.9 Permisos

Igual que el settings actual: escribe catálogo y reglas quien `canManageOrg` (owner, admin). Lee quien `canReadOrg`. El contador clasifica con el catálogo; no lo edita.

### 4.10 UI

`src/components/settings/ChartOfAccountsSection.tsx` reemplaza el textarea. `App.tsx` solo lo monta y deja de ser dueño de la lista.

- Alta / edición de cuenta: código, nombre, naturaleza, tipo de IVA si naturaleza es `iva`, activa.
- Lista de pendientes con acción “asignar” (abre el alta ya con el nombre) o “descartar”.
- Reglas: prioridad, cuenta destino, filtros de la sección 4.5, habilitar, borrar.
- Errores de validación en la pantalla, con el campo que falló. Salir con Cancelar sin guardar.
- El componente no importa Firebase ni Groq. El hook `useAccountCatalog` llama a `organizationService`.

Dropdowns de cuenta en alta manual siguen en `App.tsx` pero las opciones salen del catálogo activo (código + nombre). El valor guardado sigue siendo `account_name` **y** `account_code`.

---

## 5. Archivos a crear

| Ruta | Responsabilidad única |
|---|---|
| `src/types/chartOfAccounts.ts` | Tipos, uniones y constantes de naturaleza / tipo IVA |
| `src/config/chartOfAccounts.ts` | Semilla y solo la semilla |
| `src/services/accountMappingService.ts` | Validar, migrar nombres, resolver catálogo, matchear reglas, `decideAccount` |
| `src/services/accountMappingService.test.ts` | Pruebas de la sección 7 |
| `src/hooks/useAccountCatalog.ts` | Carga y guardado vía `organizationService` |
| `src/components/settings/ChartOfAccountsSection.tsx` | UI de catálogo, pendientes y reglas |
| `src/components/settings/ChartOfAccountsSection.test.tsx` | Render de validación y de pendiente sin naturaleza |

## 6. Archivos a modificar

| Ruta | Cambio |
|---|---|
| `src/types/organization.ts` | `catalogo_cuentas`, `catalogo_pendientes`. `cuentas_contables` se documenta como proyección |
| `src/types/transaction.ts` | `account_code?`, `clave_prod_serv?` |
| `src/services/organizationService.ts` | Parseo, alta de org con semilla, update que escribe catálogo + proyección, CRUD de reglas en batch. Sigue siendo el único writer de org |
| `src/hooks/useActiveOrganization.ts` | Hidratar catálogo con `resolveEffectiveChart` |
| `src/services/groqAIService.ts` | Instrucción del clasificador sin cuentas fijas; el catálogo llega en el contexto sanitizado |
| `src/services/groqAIService.test.ts` | JSON con `account_code`; el sanitizado no deja pasar un RFC si alguien lo mete en el contexto de clasificación |
| `src/hooks/useImportFlow.ts` | `decideAccount` antes de Groq; persiste `account_code` y `clave_prod_serv` |
| `src/services/cfdiBatchImportService.ts` | El mismo `decideAccount` en el ramo que hoy llama a `classify`. Tipo P y nómina intactos en su ramo |
| `src/services/cfdiBatchImportService.test.ts` | Caso regla que evita el classify inyectado; caso código Groq inválido |
| `src/lib/cfdiXml.ts` | `claveProdServ` del primer `Concepto` |
| `src/config/nominaDefaults.ts` | Códigos importados de la semilla. Los nombres públicos no cambian |
| `src/App.tsx` | Quitar `DEFAULT_ACCOUNT_CATALOG` y el textarea. Montar la sección. Alta/edición manual usa `decideAccount`. No se añade lógica de negocio nueva al archivo |
| `src/components/org/OrgSwitcher.test.tsx` | Fixture con `catalogo_cuentas: []` |
| `src/components/org/OrgPickerScreen.test.tsx` | Igual |
| `firestore.rules` | En `organizations/{orgId}`: `catalogo_cuentas` lista &lt; 200, mapas con `code`, `name`, `naturaleza` válida; `catalogo_pendientes` lista de strings &lt; 200. Subcolección `mapeo_cuentas`: read `canReadOrg`, write `canManageOrg` |

Si `organizationService.ts` fuera a pasar de 600 líneas, se detiene el turno y se enmienda este plan. No se improvisa otro writer.

## 7. Pruebas

`npm test` de los archivos nuevos y de los test ya citados. `npm run lint`. Si se toca `firestore.rules` de pagos no aplica; este cambio de rules se cubre con el validador puro (la regla de Firestore espeja `assertCatalog`) y, si el entorno de emulador ya está en el repo para org, un caso de permiso. No se exige e2e nuevo.

Casos mínimos de `accountMappingService.test.ts`:

1. Cuenta `iva` sin `tipo_iva` rechazada. `tipo_iva` en cuenta `gasto` rechazado. Código duplicado rechazado.
2. `migrateLegacyNames(['Gastos Operativos', 'Impuestos', 'Nómina y Honorarios'])` mapea solo la primera; las otras dos quedan pendientes, sin naturaleza.
3. Dos reglas: gana la de menor `priority`. Empate de prioridad: gana el `id` menor. Regla `enabled: false` no gana.
4. Match AND: falla si `tipo` coincide y `clave_prod_serv` no.
5. Regla ganadora: el `classify` inyectado no se llama. `account_source === 'rule'`.
6. Sin regla: `classify` se llama **sin** `rfc_contraparte` en el objeto. Código del catálogo → `account_source === 'ai'` y el nombre sale del catálogo aunque el modelo mande otro texto.
7. Código inventado por el modelo → provisional `601.84` o `401.01` según `tipo`, revisión, `manual_fallback`.
8. `classify` que lanza → el mismo provisional. El XML no se pierde.
9. `resolveEffectiveChart` con org vacía devuelve la semilla, incluidos Bancos `102.01`, Clientes, Proveedores, IVA de devengo `119.01` y `209.01`, ingresos y nómina `601.01`.
10. Todo código de la semilla cumple `/^[0-9]+(\.[0-9]+)*$/`. El IVA acreditable de devengo (`name` «IVA acreditable») es `119.01`, no `118.01`. El IVA trasladado de devengo (`name` «IVA trasladado») es `209.01`, no `208.01`.

Parser: un XML de fixture con `ClaveProdServ="01010101"` produce ese valor; sin atributo, `''`.

UI: la sección muestra un pendiente y no ofrece ese nombre como destino de una regla.

## 8. Definición de hecho

- Una org nueva queda con la semilla (código + naturaleza) y la proyección de nombres.
- Una org con lista vieja de textos obtiene cuentas solo donde el nombre calza; el resto se ve como pendiente y no lo elige Groq.
- Importar un CFDI cuyo match pega en una regla guarda `account_code`, `account_name` del catálogo y `account_source: 'rule'`, sin llamada a Groq, con audit `ACCOUNT_MAPPED_BY_RULE`.
- Importar uno sin regla guarda un código que existe en el catálogo, o el provisional de semilla en revisión.
- Nómina sigue sin Groq y guarda `601.01` junto al nombre actual.
- `isPolizaEligible` y el TXT de póliza se comportan igual que antes de E15.
- `npm run lint` y las pruebas de la sección 7 en verde.

## 9. Fuera de alcance (para el dictamen)

| Tema | Cuándo |
|---|---|
| Generar líneas de devengo al importar | E16 |
| Dejar de exigir conciliación en `isPolizaEligible` | E16, el mismo cambio que el generador |
| Persistir y usar `atajo_pue_bancos` | E16 |
| Balanza y estado de resultados | E17, después de E15 y E16 |
| Flujo guiado / aprobar en lote | E18 |
| Reclasificar transacciones históricas | No en estos cuatro entregables, salvo un plan propio |
| Centros de costo, DIOT, envío SAT | Fuera |

## 10. Cierre del dictamen

El auditor autorizó la semilla de la sección 4.3 y la ejecución de las secciones 5 y 6 el 2026-10-27. E16 (devengo, atajo PUE, cambio de `isPolizaEligible`) y E17 (balanza) no forman parte de esta escritura. No hay pregunta abierta.

## 11. E16 — Póliza de devengo (dictamen 2026-10-27, ejecución autorizada)

`isPolizaEligible` no cambia: sigue exigiendo cuenta y conciliación, y gobierna el TXT de efectivo. El devengo se guarda en `asiento_devengo` al clasificar y se exporta con otro botón. Nómina, tipo P, Excel, históricos, balanza y las cuentas `118.01` / `208.01` quedan fuera.

Condiciones vinculantes del dictamen:

1. `buildAccrualJournalEntry` regresa `{ ok: true, entry } | { ok: false, reason }`. Si `ok` es false, `useImportFlow` y `batchClassificationService` dejan la transacción en `revisión` y escriben el motivo. No hay fallo silencioso.
2. `formatAccrualJournalToTxt` vive en `journalEntryService.ts`. `polizaExportService.ts` solo elige los asientos y llama a esa función.
3. `accrualPostingService.ts` audita únicamente con `logAuditEntry` de `auditService.ts`. Acción `POLIZA_DEVENGO_GENERADA`. Sin RFC ni nombre de contraparte. Si hubo atajo, `detalles` incluye el texto `Aplicado atajo PUE a Bancos`.

Asiento: ingreso cargo `105.01` por el total, abono de la cuenta clasificada por el subtotal y abono `209.01` por el IVA si es mayor a cero. Egreso al revés, con `119.01` y `201.01`. El atajo, solo con el flag activo y método PUE, cambia la contrapartida a `102.01`. Un PPD no lo usa. El flag nace apagado.

## 12. E17 — Balanza y estado de resultados (dictamen 2026-10-27, ejecución autorizada)

`buildFinancialReports` consume los `asiento_devengo` ya guardados y el catálogo activo. No reescribe asientos ni abre otra consulta: usa las transacciones del año que ya carga el listener (`organization_id` + `fecha`, tope 5,000).

Saldo final = saldo inicial + cargos − abonos. El saldo inicial de enero es 0; el de los meses siguientes acumula desde el 1 de enero. El estado de resultados toma solo el mes y solo naturalezas `ingreso` y `gasto`. El IVA queda en la balanza.

Condiciones vinculantes:

1. Si `truncated` es true, Fiscal muestra un aviso visible de que la balanza es preliminar.
2. Las filas con saldo inicial, cargos y abonos en cero no se muestran. Las anomalías sí, aunque el monto sea cero.
3. Si `financialReportsService.ts` pasa de 400 líneas, la agregación se extrae a una función del mismo archivo.

## 13. E18 — Aprobación en lote (dictamen 2026-10-27, ejecución autorizada)

La cola muestra las transacciones del mes en `revisión`. Aprobar escribe `conciliado`. Rechazar escribe `rechazado` y exige motivo. No se crea el estado `aprobado`. Cambiar la cuenta de una fila en revisión usa el catálogo activo y `buildAccrualJournalEntry`; no llama a Groq ni crea una regla. La nómina no reconstruye el devengo. Una transacción `conciliado` no vuelve a clasificarse.

La función pura arma los parches. La escritura usa `commitTransactionUpdatesBatch` (`writeBatch`, `merge`, bloques de 400). Quien aprueba es `canWriteOrg` (dueño, admin o contador).

Condición vinculante:

1. `planBatchApproval` recibe `periodos_cerrados` y rechaza cada transacción cuya fecha cae en un periodo cerrado, con el motivo `Periodo cerrado`. El caso queda en `batchApprovalService.test.ts`.

Bitácora `APROBACION_LOTE_EJECUTADA`: `organization_id`, `periodKey`, `action`, `affected_count` y `reason` solo en el rechazo. Sin lista de ids ni RFC.

## 14. Fase 1 — Balance general y exportación (dictamen 2026-10-27, ejecución autorizada)

El balance se arma con las mismas filas de la balanza. El activo conserva el saldo final. El pasivo y el capital se presentan con el signo invertido, para leer el acreedor en positivo. La utilidad del ejercicio se suma al capital. No hay póliza de cierre.

`301.01 Capital Social` entra a la semilla. La reciben las organizaciones nuevas. El catálogo ya guardado no se reescribe.

La exportación de la balanza y del estado de resultados es CSV con separador `;` y UTF-8. Si el año viene cortado, la descarga queda deshabilitada.

Condición vinculante:

1. `total_activo` suma el saldo final de las cuentas de activo y del IVA acreditable. `total_pasivo` suma la presentación acreedora del pasivo y del IVA trasladado. `total_capital` suma la presentación acreedora del capital más `utilidad_neta`. `is_balanced` es verdadero solo si `roundMoney(total_activo) === roundMoney(total_pasivo + total_capital)`. El caso de prueba cubre el IVA y la utilidad.

## 15. E16.1 — Devengo de nómina (dictamen 2026-10-27, ejecución autorizada)

`buildAccrualJournalEntry` deja de rechazar la nómina. Si `is_nomina` es true, arma el asiento y lo valida con `journalEntryBalances`. No hay un segundo constructor.

Cargo a gastos de nómina por las percepciones. Abono al ISR, al IMSS y a bancos por el neto. Una retención en cero no genera línea. El concepto de la línea es «Nómina».

Condiciones vinculantes:

1. `total_percepciones`, `isr_retained` e `imss_retained` son `number` en `src/types/journalEntry.ts`. La rama de nómina no los trata como cero si faltan.
2. Además del asiento de cuatro líneas, una prueba con ISR en cero exige tres líneas, sin una línea de monto cero.
3. La reasignación de una nómina falla con el texto exacto «La clasificación de nómina es automática y no puede modificarse manualmente».

## 16. E19 — Liquidación de CFDI tipo P (dictamen 2026-10-27, ejecución autorizada)

Un complemento de pago no devenga ingreso ni gasto. Liquida Bancos contra Clientes o contra Proveedores. El cobro o el pago se decide comparando el RFC de la empresa con el emisor y el receptor del complemento. La aplicación por UUID que ya existe no se modifica y no condiciona el asiento.

El asiento se guarda en `asiento_liquidacion`. La balanza, el balance y la póliza de devengo lo suman. El estado de resultados no recibe esas líneas.

Condiciones vinculantes:

1. Bancos, Clientes y Proveedores se resuelven en el catálogo activo por el nombre de la semilla. `buildPaymentApplicationEntry` no escribe los códigos `102.01`, `105.01` ni `201.01`. Si el catálogo cambia el código, el asiento usa el código nuevo.
2. Si la liquidación cuadra, el estado queda en `conciliado`. Si falla, queda en `revisión` con un motivo: «Moneda distinta de MXN en complemento de pago» o «No se pudo determinar si es cobro o pago», o la cuenta inactiva.
3. La prueba del RFC cubre emisor → `cobro`, receptor → `pago`, y sin coincidencia → vacío, que provoca el fallo controlado.

## 17. E20 — Importación Excel con devengo (dictamen 2026-10-28, ejecución autorizada)

La fila de Excel no construye su propio asiento. Se mapea a `AccrualDraft` y el devengo lo arma el mismo generador que el CFDI. `useImportFlow.ts` solo entrega el archivo. E21 a E26 no se implementan aquí.

Condiciones vinculantes:

1. `excelImportService.ts` no arma líneas. Mapea la fila y llama a `postClassifiedAccrual`, que usa `buildAccrualJournalEntry` y `journalEntryBalances`.
2. Todo aviso de revisión o de omisión nombra la fila en base 1. Si faltan subtotal e IVA, el motivo es «Fila 15: Faltan subtotal e IVA para generar el devengo».
3. La fila queda en `ExcelRowDraft`: `concepto`, `monto`, `fiscal_subtotal`, `fiscal_iva` y `rowIndex`. Sin `any`.
4. El periodo cerrado se revisa antes de construir el asiento. Esa fila no se procesa y el motivo es «Fila X: Periodo cerrado». El resto del lote sigue.

## 18. E21 — Asientos faltantes del periodo abierto (dictamen 2026-10-28, ejecución autorizada)

El botón de la balanza genera, solo en el periodo abierto, los asientos que faltan. El comercial y la nómina pasan por `postClassifiedAccrual`. Un CFDI tipo P histórico no se inventa: queda en revisión. No se promueve el estatus a conciliado. No se borran CFDIs ni `audit_logs`. E22 a E26 no se implementan aquí.

Condiciones vinculantes:

1. Si `asiento_devengo` o `asiento_liquidacion` ya pasa `journalEntryBalances`, el movimiento se omite y no se sobrescribe.
2. Si no hay cuenta y `decideAccount` devuelve `manual_fallback` o `requires_human_approval`, no se arma un asiento provisional. El motivo es «Falta clasificación de cuenta válida».
3. La reconstrucción recibe `HistoricalReconstructionDraft`. Sin `any` y sin `Record<string, unknown>` en esa firma.
4. Un tipo P de prueba devuelve exactamente «No se puede reconstruir la liquidación: el complemento de pago no está guardado» y no llama a un generador de asientos.

## 19. E22 — Actualización de catálogo existente (dictamen 2026-10-31, ejecución autorizada)

Las organizaciones que ya guardaron su catálogo reciben solo las cuentas de la semilla cuyo código todavía no existe. No se reescribe el nombre, la naturaleza ni ningún otro dato de una cuenta presente. La comparación usa `catalogo_cuentas` guardado. La persistencia sigue en `updateOrganizationChart`. E23 a E26 no se implementan aquí.

Condiciones vinculantes:

1. El log `CATALOGO_CUENTAS_UPDATED` lleva `cuentas` con la longitud del catálogo ya fusionado y `pendientes` con la longitud de pendientes. No se registra el conteo previo a la fusión.
2. `addMissingSeedAccounts` ejecuta `assertCatalog` sobre el catálogo fusionado antes de `updateOrganizationChart`. Si la validación falla, no se escribe nada.
3. Un catálogo vacío agrega la semilla completa: `addedCount` es su longitud, `accounts` y `addedAccounts` coinciden con la semilla.
4. `mergeMissingSeedAccounts` no modifica el arreglo ni las cuentas que recibió.

## 20. E23 — Tablero unificado de pendientes (dictamen 2026-10-31, ejecución autorizada)

Centro de lectura del mes seleccionado. Agrupa los movimientos que piden acción y abre la pantalla que ya los resuelve. No aprueba, no genera asientos y no cambia la conciliación. La vista operativa sigue en su lugar.

Cada movimiento entra en una sola lista. La cadena es revisión, luego falta de cuenta, luego conciliación. Un rechazado no entra. La cuenta falta si `account_code` queda vacío. La conciliación está hecha si `bank_reconciled` es verdadero o `bank_reconcile_status` es `full`, la misma señal de la póliza de efectivo. El mes se filtra dentro de la función con el calendario local. El motivo guardado se muestra cuando existe; si no, «En revisión».

Los botones «Revisar», «Abrir movimiento» y «Conciliar» solo cambian de pestaña o abren el detalle. No llaman a `postClassifiedAccrual` ni a `planBatchApproval`.

Condiciones vinculantes:

1. La prioridad vive en una cadena `if / else if` dentro de `aggregatePendingActions`. Una transacción en revisión, sin cuenta y sin banco aparece solo en `in_review`, con los otros dos contadores en cero.
2. El arreglo recibido es `readonly` y no se modifica. Una prueba compara el contenido antes y después.
3. Si `policy_review_reason` tiene texto, ese es el motivo. Si es nulo o vacío, el motivo es «En revisión».
4. Los tres botones solo navegan. «Revisar» no aprueba ni genera asientos.

## 21. E24 — Aprobación en lote por umbral de confianza (dictamen 2026-10-31, ejecución autorizada)

El umbral vive en la organización. Si no está guardado, es 0.90. Solo el dueño o un administrador lo cambian. El contador puede ejecutar la aprobación. El visor no.

Una transacción en revisión se aprueba solo si el periodo está abierto, el devengo o la liquidación cuadra y la confianza es un número finito mayor o igual al umbral. Nómina y tipo P entran por el mismo camino. El parche no cambia la cuenta ni el asiento. La marca es `aprobado_por: 'auto_confidence'`. Si no hay elegibles, no se escribe ni se audita.

La selección es pura. El guardado reutiliza `commitTransactionUpdatesBatch`. La auditoría lleva organización, periodo, umbral y conteo. No lleva identificadores de transacciones.

Condiciones vinculantes:

1. La confianza se acepta solo con `typeof score === 'number' && Number.isFinite(score) && score >= threshold`. Un `confidence_score` nulo no aprueba.
2. El parche lleva `status`, `aprobado_por` y las marcas de fecha. No lleva `account_code` ni `asiento_devengo`. La auditoría no incluye un arreglo de identificadores.
3. El umbral `0` aprueba todo lo que tenga asiento válido y confianza numérica mayor o igual a cero. El umbral `1` aprueba solo si la confianza es exactamente `1`.

## 22. E25 — Ver y corregir la cuenta de una línea (dictamen 2026-10-31, ejecución autorizada)

El detalle muestra las líneas del asiento guardado. Solo se cambia el código de una línea, por una cuenta activa. El importe, el cargo o abono y el concepto se quedan. Nómina y tipo P siguen bloqueados con los mensajes ya existentes. Un movimiento que no está en revisión, o un visor, ve las líneas sin selector.

La validación vive en `lineReassignmentService.ts`. `journalEntryService.ts` no se toca. Si el asiento resultante no cuadra, no se guarda. La auditoría es `CUENTA_LINEA_REASIGNADA` y no lleva RFC ni importes.

Condiciones vinculantes:

1. El asiento recibido no se modifica. Una prueba lo congela y compara el contenido y la referencia de `lines`.
2. El índice es válido solo si `lineIndex >= 0 && lineIndex < entry.lines.length`. Si no, el motivo es «Índice de línea inválido». La prueba cubre un índice negativo y uno fuera de rango.
3. Cambiar una cuenta de gasto activa por una de ingreso activa se acepta, el asiento sigue cuadrando y el nombre de la línea pasa a ser el de la cuenta nueva.

## 23. E26 — Reclasificación de un conciliado (dictamen 2026-10-31, ejecución autorizada)

Solo el dueño o un administrador puede reabrir un movimiento conciliado. El estado vuelve a revisión y el devengo se arma de nuevo con la cuenta nueva. Si el generador no cuadra, no se guarda nada. Nómina y tipo P siguen bloqueados. El contador no ve la acción.

La confirmación es la casilla «Entiendo que esto modificará un movimiento ya conciliado». La auditoría es `RECLASIFICACION_CONCILIADO_EJECUTADA` e incluye al usuario que la ejecutó. E18 y E25 no se abren para este caso.

Condiciones vinculantes:

1. El parche borra `aprobado_por` y `aprobado_en` con `deleteField()`. No incluye `confidence_score`.
2. El objeto recibido se congela en una prueba y no cambia.
3. La confianza original se queda fuera del parche.
4. La auditoría lleva `usuario_id` del actor.

## 24. Anexo 24 — XML de pólizas (dictamen 2026-10-31, ejecución autorizada)

Descarga del XML de pólizas versión 1.3. No se envía al SAT. No entra el catálogo, la balanza, la DIOT ni los bancos. No se modifica el generador de asientos, la conciliación ni el TXT de flujo.

La fuente es el devengo conciliado del mes. Si no hay devengo y sí hay liquidación, se exporta esa. Si ambos asientos son válidos, el archivo se detiene. Un pago a varias facturas no parte la partida: cada aplicación cuelga como comprobante, por el importe aplicado. El código agrupador solo existe si la cuenta está en la semilla. El tipo de póliza depende de si hay Bancos. Si una partida no cabe en el esquema, no hay archivo.

Condiciones vinculantes:

1. Devengo y liquidación válidos a la vez bloquean con «El movimiento tiene devengo y liquidación a la vez.»
2. La suma de aplicaciones se compara con `roundMoney`. Si no iguala la partida, el motivo nombra el movimiento y la diferencia.
3. La naturaleza deudora o acreedora recibe la cuenta completa. IVA acreditable es deudora; IVA trasladado es acreedora.
4. Una prueba congela los movimientos de entrada.
5. El RFC de la organización debe cumplir el formato de 12 o 13 caracteres. «ABC123» bloquea.
6. Una aplicación sin UUID relacionado ni UUID de la factura destino bloquea y nombra el movimiento y la aplicación.

## 25. Anexo 24 — XML del catálogo (dictamen 2026-10-31, ejecución autorizada)

Descarga del XML de catálogo versión 1.3. No se envía al SAT y no lleva sello. No entran la balanza ni la DIOT. El catálogo sigue plano: nivel 1 y sin cuenta padre.

`NumCta` es el código de la cuenta en ContAI. `CodAgrup` es otro atributo. Su valor sale de `accountCodeToCodAgrup`. En la semilla ese valor es el mismo texto del código, porque el XSD 1.3 enumera `102.01` y no `102010`. Un resultado que no tenga la forma del catálogo del SAT detiene el archivo. `102010` no es un código agrupador válido.

Entran solo las cuentas activas que mapean. Una inactiva no entra y se avisa en la pantalla. RFC inválido, código repetido, nombre vacío o de más de 400 caracteres, más de 200 cuentas, cero cuentas activas e IVA sin tipo detienen el archivo.

Condiciones vinculantes:

1. `accountCodeToCodAgrup('102.01')` devuelve `102.01`, el valor publicado en `c_CodAgrup`. El XML escribe `NumCta` y `CodAgrup` como atributos distintos.
2. `102010` no pasa la validación del agrupador y el archivo se detiene.
3. El catálogo recibido se congela en una prueba y no cambia.
4. Si el mapeo no devuelve un agrupador válido, el motivo nombra la cuenta.
5. La cuenta inactiva se avisa junto al botón de descarga. Una prueba de componente lo comprueba.

## 26. Anexo 24 — XML de la balanza (dictamen 2026-10-31, ejecución autorizada)

Descarga del XML de balanza versión 1.3. El envío es normal (`N`). No hay complementaria, sello ni envío al SAT. No se modifica `buildFinancialReports`.

La función recibe la balanza ya calculada. `CodAgrup` se valida y no se escribe: el nodo solo lleva `NumCta`, `SaldoIni`, `Debe`, `Haber` y `SaldoFin`. Una cuenta con los cuatro saldos en cero no entra y no bloquea.

Condiciones vinculantes:

1. Una cuenta con saldo y código `601.99` detiene el archivo con «La cuenta 601.99 no tiene código agrupador válido del SAT.»
2. El monto `1000` se escribe `1000.00`.
3. El reporte de entrada se congela en una prueba y no cambia.
4. Cargos 100 y abonos 90 se comparan con `roundMoney` y detienen el archivo con «La balanza no cuadra. Diferencia: 10.00.»

## 27. Manual de usuario para la prueba de Sebas (autorizado 2026-11-02)

Reescritura de la guía, sin cambios de pantallas ni de cálculo. El texto usa los nombres de botones y tarjetas que ya están en la app, en lenguaje de despacho.

Archivos:

- `docs/MANUAL_USUARIO.md`
- `MANUAL_USUARIO.md` (el mismo texto, para que no queden dos guías)

No se regenera el PDF en ese paso. No entran reglas de Cursor, secretos ni XML de prueba.

## 28. PDF de la guía con el logo (autorizado 2026-11-02)

`scripts/build-manual-pdf.mjs` arma `MANUAL_USUARIO.pdf` desde `MANUAL_USUARIO.md`. La portada lleva el logo de `public/brand/contai-logo.png` sobre una franja `#1e3a5f`. Títulos, tablas y pie usan esa tinta. El texto de la guía no cambia.

## 29. Corrección 1 — importar XML de Sebas (autorizado 2026-11-03)

La app publicada no tiene el XSD oficial: `/cfdi/xsd/cfdv40.xsd` responde con la página de inicio. La validación cae al esquema reducido y ese esquema rechaza `CondicionesDePago`. El cuadro muestra el texto del validador, en inglés, y no abre la vista previa. Un CFDI 3.3 también se detiene ahí.

Archivos:

- `src/assets/cfdi/cfdi40-comprobante-lite.xsd` — permite atributos extra del comprobante.
- `src/lib/cfdiXsdValidate.ts` — frase en español; el texto del motor no sale al cuadro.
- `src/hooks/useImportFlow.ts` y `src/services/cfdiBatchImportService.ts` — usan esa frase. El lote ya muestra el nombre del archivo aparte.
- `src/lib/cfdiXsdValidate.test.ts` — 4.0 con condiciones de pago pasa; 3.3 muestra la frase.

No cambian conciliación, impuestos, póliza ni Anexo 24.

## 30. Sprint 1 — la lista y el CSV respetan el mes (autorizado 2026-11-06)

La lista de Transacciones y su CSV recorren todo el libro. El mes elegido ya filtra el panel con `filterTransactionsByMonth` y no filtra esa lista.

Alcance:

- `filteredTransactions` parte de ese mes y después aplica tipo, estado, proveedor, etiqueta y fechas.
- El CSV exporta esa lista. Si el mes no tiene filas, no descarga el resto del libro.
- El botón se apaga cuando el listado visible está vacío y dice por qué.
- Mes vacío: «{mes} no tiene movimientos. Importa los CFDI de ese mes o elige otro periodo.»
- Mes con movimientos y filtros sin coincidencia: se conserva «No hay transacciones que coincidan con los filtros.»

Archivos:

- `src/lib/monthlyAnalysis.ts` — el filtro conserva el tipo de cada fila. Ahí viven el texto del vacío y el armado del CSV, para probarlos sin montar la pantalla.
- `src/lib/monthlyAnalysis.test.ts` — dos meses no se mezclan en la lista ni en el CSV; el vacío nombra el mes y el siguiente paso.
- `src/App.tsx` — la lista y `exportToCSV` usan el mes.
- `src/types/appSections.ts` y `src/components/sections/TransactionsSection.tsx` — el cuadro recibe el texto del vacío. La prueba del cuadro lo muestra.

No se crean pantallas ni servicios. No cambian póliza, conciliación, Fiscal, panel, Anexo 24, Groq ni org. Sprint 2 y Sprint 3 no entran.

## 31. Sprint 2 — no volver a cargar un folio vigente (autorizado 2026-11-06)

Un CFDI con el mismo folio puede guardarse otra vez. La consulta por folio ya existe (`organization_id` + `cfdi_uuid`, de diez en diez) y no trae el estado. El único caller de esa consulta es el almacén de pagos.

Regla: un movimiento rechazado no bloquea la recarga. Pendiente, revisión y conciliado sí. La línea de $17,400 en Pendiente no se borra y no hay botón de eliminar.

Alcance:

- `isActiveDuplicate` en `src/lib/cfdiDuplicates.ts`, con el comentario de la regla. Falso solo si el estado es `rechazado`.
- `findTransactionsByCfdiUuids` agrega `status` al resultado. La consulta y el índice no cambian.
- `cfdiPaymentImportStore.ts` no lee `status`. Se deja igual. No tiene prueba propia; `npm run lint` y la prueba de pagos siguen en verde.
- El lote consulta una vez, antes de `commitCfdiTransactionBatch`, y omite el archivo con una frase que lleva su nombre. Otro folio del mismo lote sí entra. Una segunda copia del mismo folio en ese lote no entra.
- El archivo suelto consulta antes de `createTransaction`. Nómina suelta y complemento P suelto no pasan por esa función y quedan fuera.
- `useImportFlow.ts` ya está en 599 líneas. La decisión vive en el lib; el hook solo llama y guarda el nombre del archivo.

Archivos:

- `src/lib/cfdiDuplicates.ts` y `src/lib/cfdiDuplicates.test.ts`
- `src/services/firestoreService.ts`
- `src/services/cfdiBatchImportService.ts` y su prueba
- `src/hooks/useImportFlow.ts`

No cambian póliza, conciliación, Fiscal, panel, Anexo 24, Groq, org ni el Sprint 3.

## 32. Sprint 3 — barra de avance al cargar XML (autorizado 2026-11-06)

Al cargar varios XML, la validación del paquete no avisa archivo por archivo. La lectura y la clasificación sí. El contrato `CfdiBatchProgress` no cambia y no hay fase nueva.

Alcance:

- `parseCfdiXmlBatch` recibe un aviso opcional, sin `any`: `current`, `total`, `fileName` (el archivo en turno) y `message` (el texto del paso, por ejemplo «Leyendo 3/8»).
- El único caller es `runCfdiBatchImport`. Traduce ese aviso a la fase `uploading` que ya existe.
- Al guardar el lote, el texto pasa a «Guardando el lote…» con la fase `processing_ai`.
- La barra del cuadro es `current / total`. 2 de 8 se ve como 25 % y muestra el nombre del archivo.
- Un solo archivo usa la misma barra al leerlo y al guardarlo. No se trata como lote: al abrir la vista previa se quita el avance para que siga el botón de registrar.

Archivos:

- `src/services/cfdiBatchImportService.ts` y `src/services/cfdiBatchImportService.progress.test.ts`
- `src/components/ImportModals.tsx` y `src/components/ImportModals.test.tsx`
- `src/hooks/useImportFlow.ts` — solo asigna el avance del archivo suelto. La decisión no crece ahí.

No cambian `src/types/cfdiBatch.ts`, póliza, conciliación, Fiscal, panel, Anexo 24, Groq ni org.

## 33. Cargar carpeta de XML (autorizado 2026-11-12)

El cuadro ya acepta varios archivos, pero no deja elegir la carpeta. En Windows, abrir la carpeta y pulsar Abrir entrega un solo XML.

Alcance cerrado en cuatro rondas:

- `handleCfdiFiles` sigue siendo `(fileList: FileList | null) => void`. El único cable es `App.tsx`. El filtro corre dentro del hook, antes de la bifurcación.
- Un XML abre la vista previa. Dos o más van a `runCfdiBatch`, que pasa a recibir `SelectedCfdiFile[]`. Su único caller es `handleCfdiFiles`. Lee `f.file.text()` y guarda `f.displayName` en el aviso y en `inputs`.
- `let inputs = []` se declara antes del `try`. El `finally` llama `releaseXmlTexts(inputs)`.
- Los `File` de la carpeta no se guardan en el estado. La purga de prueba basta con dejar `xmlText` en blanco y el arreglo en cero.
- Al cerrar el cuadro se vacían también los dos refs del XML suelto.
- Tras el filtro, el cuadro muestra «Revisando carpeta…» y cede un turno antes de leer el primero.
- Carpeta sin XML: «Esta carpeta no tiene XML. Elige la carpeta donde están los CFDI.»
- Los que no son XML se cuentan en el aviso del cuadro y esa frase permanece hasta cerrar o elegir otra carga.
- Mientras hay una carga, los dos botones quedan apagados: «Espera a que termine la carga actual.»
- Sin `webkitdirectory`, o en táctil sin ratón, **Cargar carpeta** nace apagado: «Elegir carpeta no está disponible en este navegador. Usa Cargar archivo(s) XML y marca varios.»
- El párrafo de Fiscal queda: «Abre la ventana y elige varios XML o la carpeta del mes. No valida timbrado.» El título y el botón no cambian.
- El sufijo `.xml` vive en el lib. No es tasa, cuenta ni modelo.
- No se crea `useImportFlow.test.ts`. La prueba del cuadro restaura `matchMedia` con `vi.unstubAllGlobals()` en `afterEach`.

Archivos:

- `src/lib/cfdiFileSelection.ts` y `src/lib/cfdiFileSelection.test.ts`
- `src/components/ImportModals.tsx` y `src/components/ImportModals.test.tsx`
- `src/hooks/useImportFlow.ts`
- `src/components/sections/FiscalSection.tsx`

No cambian póliza, conciliación, Anexo 24, Groq, org ni el manual. El servicio del lote no cambia de contrato.

## 34. Ficha fiscal en la lista de facturas (autorizado 2026-11-12)

La lista no enseña el comprobante como viene. El IVA se colapsa en `inferIvaTasaFromAmounts` (`src/lib/cfdiXml.ts`, líneas 137–144) y esa función no se toca. La ficha es otro dato: impuestos del nodo, folio, folio fiscal, descuento y clase del comprobante.

Contrato del archivo suelto, tipos estrictos, sin `any` y sin `DocumentData` en el retorno:

- `buildSingleCfdiCreatePayload` → `SingleCfdiCreatePayload`
- `buildSingleCfdiReplacePayload` → `SingleCfdiReplacePayload`
- `createTransaction` y `setTransaction` siguen recibiendo `DocumentData`. El tipado se pierde en esa frontera. Lo sostienen `tsc --noEmit` y las pruebas del helper y del lote.
- `creado_en` se agrega en la llamada, no dentro del tipo.
- `appendNominaIsr` es puro: devuelve un `CfdiFiscalFace` nuevo cuando agrega la línea y no muta el argumento.

`IMPORT_CFDI` sigue con `{ id, uuid }`. La ficha no entra a Groq ni a `decideAccount`.

Fuera de este plan: la nómina de un solo archivo (`createImportedNomina`) y el complemento de pago de un solo archivo (`createImportedTipoP`) no llevan ficha. Su guardado no se modificó. La nómina y el pago que entran en un lote sí la llevan, porque el ciclo del lote ya tiene el XML.

Cierre forense, ronda 5, 12 nov 2026. Cinco rondas. `tsc --noEmit` en verde y 432 pruebas en verde, 8 omitidas, 18 de ellas de esta ficha. No hay commit. La nómina y el pago de un solo archivo, el previo de IVA, el CSV y las facturas ya guardadas quedan como deuda de otro plan.

Pruebas: 16 %, 0 % y exento distintos; 0.106667 es «IVA 2/3»; ISR 10 %; descuento; nota de crédito; serie, folio y folio fiscal; nómina con serie, folio y descuento, y sin ellos; nómina sin nodo de ISR y con `isrRetenido` mayor que cero; `toEqual` de la ficha entre alta y reemplazo; el lote guarda la ficha solo si se le pasa.
