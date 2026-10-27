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
