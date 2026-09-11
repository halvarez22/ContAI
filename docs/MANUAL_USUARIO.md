# ContAI — Manual de Usuario

**Para Contadores Junior y Auxiliares · Piloto de campo · Agosto 2026**

> ContAI es tu asistente de registro y revisión contable. Te ayuda a importar comprobantes, ordenar el banco, aplicar pagos, vigilar riesgo fiscal y preparar una póliza para tu sistema de captura. **No reemplaza** al contador responsable ni a las declaraciones oficiales ante el SAT.

**Dirección de acceso (producción):** `https://cont-ai-psi.vercel.app`

📅 **Selector de Periodo**: En la parte superior del Panel General verás los selectores de AÑO y MES. Casi todos los módulos (Conciliación, Aplicación de Pagos, Exportación) trabajan con el periodo seleccionado. Antes de operar, verifica que el mes y año sean los correctos.

---

## 📌 1. Inicio de sesión y configuración inicial

### 🎯 Objetivo
En este módulo aprenderás a entrar a ContAI, elegir la empresa con la que vas a trabajar y revisar la configuración básica (datos del negocio, catálogo de cuentas y equipo).

### 💡 Valor esperado
Al trabajar aquí obtendrás acceso seguro con tu cuenta de Google, la empresa correcta en pantalla y, si eres administrador, la posibilidad de invitar a tu equipo con roles claros.

### 🛠️ Paso a paso intuitivo
1. Abre el navegador (Chrome, Edge o Firefox) y entra a la dirección de ContAI.
2. Haz clic en **Iniciar sesión con Google** y elige la cuenta autorizada por tu despacho.
3. Si te pide empresa, en **Selecciona una empresa** elige la correcta y haz clic en **Entrar**.
   - También puedes **Crear nueva empresa** (nombre y RFC) y luego **Crear y entrar**.
4. En la barra superior verás el nombre y RFC de la empresa activa. Si tienes varias, cámbiala con el selector de empresa.
5. Para salir, en el menú izquierdo haz clic en **Cerrar sesión**.
6. En la barra superior puedes cambiar entre **Modo Operativo** (vista detallada de tareas del periodo) y **Modo Ejecutivo** (indicadores y resumen para revisión rápida). El modo Operativo es el recomendado para el trabajo diario.
7. **Configuración** (menú izquierdo): revisa nombre, RFC y el **catálogo de cuentas contables**; guarda con **Guardar configuración**.
8. Si tu rol es administrador o propietario, en **Configuración → Equipo** puedes **Invitar** (roles: administrador, contador o solo lectura), **Copiar enlace** de invitación y cambiar o revocar accesos.

### 📝 Ejemplo práctico
Entras el lunes y ves dos empresas: “Taller Martínez” y “Despacho Central”. Eliges Taller Martínez → **Entrar**. Todos los números del Panel general corresponden solo a esa empresa.

### ⚠️ Alerta Pro
Si no puedes entrar, pide a tu administrador que confirme tu invitación y que estés usando el correo correcto. No compartas la sesión en una computadora pública: cierra sesión al terminar.

---

## 📌 1.1 Mes demo (para conocer ContAI sin XML propios)

### 🎯 Objetivo
Cargar un mes de ejemplo con números conocidos para recorrer Panel, Transacciones, Fiscal, Conciliación y Exportar póliza **antes** de importar los XML de tu cliente.

### 🛠️ Paso a paso
1. Verifica **año y mes** arriba (el demo se carga en ese periodo).
2. En **Panel general** (modo Operativo) → Acciones rápidas → **Cargar mes demo**.
3. Confirma. ContAI elimina solo movimientos **demo previos del mismo periodo** y crea ~18 transacciones de ejemplo.
4. Se descarga `banco_demo_YYYY-MM.csv` para practicar Conciliación.
5. Verás el banner **Datos de demostración** mientras existan esos movimientos.

**Requisitos:** tu administrador debe tener activada la variable `VITE_ENABLE_DEMO_SEED=true` en el entorno, y tu rol debe ser **propietario** o **administrador**. Si no ves el botón, pide que activen el flag o usa **Importar CFDI** con XML reales.

**Importante:** el mes demo **no** es Descarga SAT. Los cálculos (IVA, nómina de 4 partidas, póliza) sí pasan por el mismo motor que producción. Detalle numérico: `docs/DEMO_SEED_VERIFICACION.md`.

---

## 📌 2. Importación de datos

### 🎯 Objetivo
En este módulo aprenderás a cargar comprobantes XML (CFDI), archivos Excel de movimientos o inventarios, y a usar la **Descarga SAT (Beta)** para traer información al libro del periodo.

### 💡 Valor esperado
Al trabajar aquí obtendrás movimientos ya registrados (o listos para revisar), con sugerencias de clasificación cuando aplique, sin capturar todo a mano.

### 🛠️ Paso a paso intuitivo

**A) CFDI (archivo XML)**
1. En **Panel general** (modo Operativo) usa **Importar CFDI**, o en **Fiscal** la tarjeta **Importar CFDI (XML)** → **Importar XML**.
2. Elige uno o varios archivos XML.
3. Espera los mensajes: subida/validación → procesamiento con asistencia → resultado.
4. Con un solo archivo verás un resumen (tipo, total, fecha, folio fiscal, emisor, receptor). Revisa y haz clic en **Registrar transacción**.
5. Con varios archivos el sistema procesa el lote y te indica qué archivo falló, si alguno falla.
6. Cierra el cuadro con **Cancelar** o **Cerrar**.

**B) Excel**
1. Desde **Panel general** o **Transacciones**, haz clic en **Importar Excel**.
2. Elige el archivo `.xlsx` (formatos que el despacho ya usa: ingresos/egresos, control de inventarios o utilidad de ventas).
3. Espera **Importando…** y revisa el mensaje final.
4. Si el periodo ya está cerrado, esas filas con fecha en periodo cerrado no se registran.

**C) Descarga SAT (Beta)**
1. Menú **Descarga SAT**.
2. Captura RFC, fechas y tipo (emitidos y recibidos / solo emitidos / solo recibidos).
3. Haz clic en **Solicitar descarga e importar**.
4. Lee el aviso de la pantalla: en el piloto suele estar en **modo simulación / prueba**, sin conexión real permanente al portal del SAT. Úsalo solo como indique tu administrador.

**D) Recibos de nómina (XML timbrado)**

> **Importante:** ContAI **no tiene un menú aparte de “Nómina”**. Los recibos de nómina del SAT se importan por la misma puerta que los CFDI de facturas. El ciclo completo es: **importar → revisar en Transacciones → conciliar banco → exportar póliza**.

**Dónde está cada paso en pantalla**

| Paso | Dónde en ContAI |
|------|-----------------|
| Importar XML de nómina | **Panel general** → Acciones rápidas → **Importar CFDI** (también en **Fiscal** → Importar CFDI) |
| Ver movimientos importados | Menú **Transacciones** |
| Cruzar con el banco | Menú **Conciliación** |
| Generar asiento de 4 partidas | **Transacciones** → **Exportar póliza (.txt)** |

**Paso a paso — nómina de principio a fin**
1. Verifica **año y mes** arriba (deben coincidir con la fecha del recibo).
2. En **Panel general**, haz clic en **Importar CFDI** y elige el XML timbrado del recibo de nómina (puedes seleccionar varios a la vez).
3. Espera a que termine el lote. Si un archivo falla, anota el nombre y el mensaje de error.
4. Abre **Transacciones** y localiza los egresos nuevos:
   - **Cuenta:** Gastos de Nómina (asignada automáticamente, sin asistencia de IA).
   - **Concepto:** suele verse como `Nómina · [nombre del empleado] · [fecha]`.
   - **Monto:** el **neto** pagado al empleado (lo que salió del banco), no el bruto.
   - **Proveedor / contraparte:** nombre y RFC del empleado.
5. Ve a **Conciliación**, sube el CSV del banco y cruza cada egreso de nómina con su transferencia o depósito. Confirma la fila.
6. Regresa a **Transacciones** y haz clic en **Exportar póliza (.txt)**. Ahí se arma el asiento contable completo (ver sección 6).

**Qué hace ContAI con cada XML de nómina**
- Crea **un solo egreso** por recibo (monto neto = `Comprobante@Total` del XML).
- Asigna la cuenta **Gastos de Nómina** sin pedir clasificación.
- Guarda retenciones (ISR, IMSS) y percepciones brutas como **metadatos** para la póliza; **no** crea movimientos bancarios extra en Transacciones.
- Los pasivos (ISR por Pagar, IMSS por Pagar) **solo aparecen al exportar** la póliza `.txt`, no en la lista de transacciones ni en conciliación.

**Cómo reconocer una nómina ya importada**
- Tipo **egreso**, cuenta **Gastos de Nómina**, concepto que empieza con **Nómina ·**.
- No verás una etiqueta “Nómina” en pantalla; usa cuenta y concepto como señales.

**Varios empleados, un solo depósito bancario**
Si el banco muestra **un abono** por la nómina de varios empleados, en **Conciliación** usa el panel **Resolver…** para unir ese movimiento de banco contra **varios** egresos de nómina (split 1↔N).

**Cuentas contables usadas en la póliza (automático)**

| Partida | Cuenta en el `.txt` |
|---------|---------------------|
| Cargo (gasto bruto) | Gastos de Nómina |
| Abono (retención ISR) | ISR por Pagar |
| Abono (retención IMSS) | IMSS por Pagar |
| Abono (pago al empleado) | Bancos |

Estas cuentas vienen preconfiguradas en el piloto; no hay pantalla de configuración de catálogo de nómina en esta versión.

### 📝 Ejemplo práctico
Te llegan 15 XML del mes (10 facturas y 5 recibos de nómina). Los seleccionas juntos en **Importar CFDI**, dejas que el lote termine y abres **Transacciones**. Filtras por egresos con cuenta **Gastos de Nómina** para revisar solo la nómina; el resto lo revisas por los que quedaron “en revisión”. Luego concilias en **Conciliación** y exportas la póliza.

### ⚠️ Alerta Pro
ContAI **no sustituye** la validación oficial de timbrado ante el SAT. Si un XML no carga, anota el nombre del archivo y el mensaje de error: eso acelera el soporte. Si importas nómina y el banco muestra un solo depósito por varios empleados, usa la conciliación por partes (un movimiento de banco contra varios egresos de nómina).

---

## 📌 3. Conciliación bancaria inteligente

### 🎯 Objetivo
En este módulo aprenderás a cruzar el estado de cuenta (archivo del banco) con tus movimientos en ContAI, aceptar sugerencias, resolver diferencias y confirmar lo que sí cuadra.

### 💡 Valor esperado
Al trabajar aquí obtendrás el porcentaje de conciliación del periodo y movimientos marcados como conciliados con el banco, listos para exportar la póliza cuando también estén clasificados.

### 🛠️ Paso a paso intuitivo
1. Abre **Conciliación** en el menú.
2. Verifica el **año y mes** en la barra superior.
3. Haz clic en **Seleccionar CSV** y elige el archivo del banco (columnas típicas: fecha, monto, descripción).
4. El sistema propone coincidencias (incluye casos de un movimiento de banco contra varios del libro).
5. Filtra: **Todos**, **Listos**, **Conflictos**, **Sin match**, **Error IA**.
6. Abre una fila y usa el panel **Resolver…**: ajusta el cruce, **Aplicar match / split** y **Confirmar esta fila**.
7. Acciones masivas: **Sugerir con IA** y **Confirmar coincidencias sin conflicto** (solo las que no tengan conflicto).
8. Revisa el Panel general: el indicador de conciliación bancaria debe subir conforme confirmas.

### 📝 Ejemplo práctico
El banco muestra un abono de $10,000 y en ContAI tienes dos facturas de $6,000 y $4,000. Usas el panel de resolución para unir ese abono a ambas (split) y confirmas la fila.

### ⚠️ Alerta Pro
No confirmes “a ciegas” todo el lote. Empieza por **Listos**, luego **Conflictos**. Lo que quede **Sin match** suele ser comisión bancaria, transferencia interna o un movimiento aún no importado.

---

## 📌 4. Aplicación de pagos (PPD, parcialidades y pagos tipo P)

### 🎯 Objetivo
En este módulo aprenderás a aplicar un pago a una o varias facturas con saldo pendiente (muy común con método PPD), usando el panel de **Fiscal**.

### 💡 Valor esperado
Al trabajar aquí obtendrás facturas con saldo actualizado y un rastro claro de qué pago cubrió qué documento, sin perderte en hojas sueltas.

### 🛠️ Paso a paso intuitivo
1. Ve a **Fiscal** y localiza la tarjeta **Aplicar pagos**.
2. Verifica el **año y mes** en la barra superior.
3. Elige un origen:
   - Un **comprobante de pago (tipo P)** del periodo → **Aplicar**, o
   - **Pago manual**: captura el monto → **Continuar**.
4. En **Aplicar pago a facturas**, marca las facturas destino y asigna montos (hasta el límite que muestra la pantalla).
5. Opcional: **Sugerir con IA** para proponer el reparto.
6. Revisa totales y haz clic en **Confirmar aplicación**.
7. Al importar CFDI, el método de pago (PUE / PPD) queda registrado en el movimiento; las facturas PPD son las que normalmente aparecen con saldo por aplicar.

**Nota:** ContAI maneja internamente casos especiales como facturas globales del SAT y anticipos. No necesitas una pantalla separada para estos casos: el flujo de **Aplicar pagos** funciona igual. El sistema mantiene el rastro de qué pago cubrió qué documento.

### 📝 Ejemplo práctico
Tienes una factura PPD de $11,600 y un CFDI de pago por $5,000. En **Aplicar pagos** eliges ese pago, marcas la factura, pones $5,000 y confirmas. Queda saldo pendiente por el resto.

### ⚠️ Alerta Pro
Verifica el **periodo** (mes/año) arriba: solo verás pagos y facturas de ese periodo. Si no aparece la factura, confirma que ya está importada y que pertenece al mes seleccionado.

---

## 📌 5. Auditoría de riesgo fiscal (lista 69-B)

### 🎯 Objetivo
En este módulo aprenderás a publicar la lista de riesgo 69-B (si eres administrador) e interpretar las alertas en transacciones y en el Panel general.

### 💡 Valor esperado
Al trabajar aquí obtendrás una señal visual cuando el RFC de la contraparte coincide con la lista vigente, para detenerte y revisar antes de dar por bueno el gasto.

### 🛠️ Paso a paso intuitivo
1. En **Fiscal**, si tienes permiso de administración, abre **Lista de riesgo fiscal 69-B**.
2. Lee el aviso: se publicará una **nueva versión** de la lista.
3. Haz clic en **Cargar CSV / Excel** y elige el archivo CSV o Excel de la lista 69-B que el SAT publica mensualmente (tu administrador o socio debe proporcionártelo actualizado).
4. Espera **Leyendo…** / **Publicando…**.
5. En **Transacciones**, busca el distintivo **Riesgo 69-B** (puedes ver la fecha de publicación al pasar el cursor).
6. En **Panel general**, revisa el indicador **Proveedores con riesgo fiscal (69-B)** del periodo.

### 📝 Ejemplo práctico
Cargas la lista del mes. Al abrir un egreso de “Proveedor XYZ”, ves **Riesgo 69-B**. No lo apruebas hasta que el socio revise el expediente.

### ⚠️ Alerta Pro
La alerta exige coincidencia **exacta del RFC**. Sin RFC de contraparte en el movimiento, no habrá alerta aunque el proveedor esté en la lista. Completa o importa bien el RFC.

---

## 📌 6. Exportación contable (póliza de diario)

### 🎯 Objetivo
En este módulo aprenderás a generar y descargar la póliza de diario en archivo de texto para llevarla a tu software de captura.

### 💡 Valor esperado
Al trabajar aquí obtendrás un archivo `.txt` con asientos del periodo (fecha, tipo, cuenta, concepto, cargo, abono), listo para importar según el procedimiento de tu despacho.

### 🛠️ Paso a paso intuitivo
1. Abre **Transacciones**.
2. Elige el mes/año correcto arriba.
3. Haz clic en **Exportar póliza (.txt)**.
4. Si el botón no está disponible, lee el mensaje: hace falta que las transacciones estén **clasificadas (con cuenta)** y **conciliadas con el banco**.
5. Descarga el archivo (nombre típico `poliza_ContAI_AAAA-MM.txt`) y guárdalo en la carpeta del periodo.
6. En la misma barra también puedes **Exportar CSV** o generar el **Reporte mensual** si tu flujo lo pide.

**Nóminas en la póliza (automático):**  
Si importaste recibos de nómina timbrados **y los conciliaste**, al exportar ContAI genera un asiento de **4 partidas** por cada egreso de nómina (en el archivo `.txt`, no en Transacciones):

1. **Cargo** → Gastos de Nómina (percepciones brutas)
2. **Abono** → ISR por Pagar (retención; se omite si el monto es $0.00)
3. **Abono** → IMSS por Pagar (retención; se omite si el monto es $0.00)
4. **Abono** → Bancos (neto pagado al empleado)

Todas las líneas del mismo recibo llevan el **mismo concepto** (ej. `Nómina · Juan Pérez · 2026-08-15`).

**Por qué en Transacciones solo ves el neto:** la conciliación bancaria trabaja con lo que salió del banco. Los pasivos (ISR e IMSS retenidos) se calculan al exportar y van solo al `.txt` para tu software de captura.

**Si el XML no trae retenciones completas:** la exportación no se bloquea. Genera un asiento simple de 2 líneas (gasto neto / banco) y añade `[nomina: pasivos omitidos]` al concepto para que el contador lo ajuste manualmente.

**Ejemplo de asiento en el `.txt` (nómina completa)**

| Fecha | Tipo | Cuenta | Concepto | Cargo | Abono |
|-------|------|--------|----------|-------|-------|
| 2026-08-15 | CARGO | Gastos de Nómina | Nómina · Juan Pérez · 2026-08-15 | 10,000.00 | 0.00 |
| 2026-08-15 | ABONO | ISR por Pagar | Nómina · Juan Pérez · 2026-08-15 | 0.00 | 1,200.00 |
| 2026-08-15 | ABONO | IMSS por Pagar | Nómina · Juan Pérez · 2026-08-15 | 0.00 | 300.00 |
| 2026-08-15 | ABONO | Bancos | Nómina · Juan Pérez · 2026-08-15 | 0.00 | 8,500.00 |

### 📝 Ejemplo práctico
Ya conciliaste el banco y todas las cuentas están asignadas. Exportas la póliza de agosto y se la entregas al auxiliar de captura con el resto de papeles del mes.

### ⚠️ Alerta Pro
Si faltan movimientos en la póliza, casi siempre falta **cuenta contable** o **conciliación bancaria** en esos renglones. Complétalos en Transacciones / Conciliación y vuelve a exportar. ContAI **no** envía la póliza solo a CONTPAQi u otros sistemas: tú importas el archivo en tu software de captura.

---

## Preguntas frecuentes (FAQ)

**1. ¿Qué hago si la asistencia sugiere una cuenta incorrecta?**  
Abre el movimiento en **Transacciones → Ver detalles**, corrige la cuenta (o edita según tu permiso), guarda y, si hace falta aprobación, usa **Aprobar** / **Rechazar**. La sugerencia es apoyo; la responsabilidad final es del equipo contable.

**2. ¿Por qué no puedo exportar la póliza?**  
Porque aún no hay movimientos del periodo que cumplan: cuenta asignada **y** conciliación bancaria confirmada. Revisa filtros, completa clasificación y termina **Conciliación**.

**3. ¿Por qué mi pago o factura no aparece en “Aplicar pagos”?**  
Casi siempre es el **periodo** (mes distinto), el documento aún no importado, o no es un origen válido (pago tipo P / pago manual frente a facturas con saldo). Cambia el mes, importa el XML faltante y vuelve a intentar.

**4. ¿Dónde veo la nómina en ContAI?**  
No hay menú “Nómina”. Importa los XML por **Importar CFDI**, revísalos en **Transacciones** (cuenta **Gastos de Nómina**, concepto `Nómina · …`), concílialos en **Conciliación** y exporta la póliza desde **Transacciones**. El asiento de 4 partidas solo lo verás dentro del archivo `.txt` descargado.

**5. ¿Por qué la póliza de nómina no muestra ISR e IMSS en Transacciones?**  
Por diseño: Transacciones y conciliación usan el **neto bancario** (lo pagado al empleado). ISR e IMSS retenidos se incluyen automáticamente al **Exportar póliza (.txt)** como abonos a ISR por Pagar e IMSS por Pagar.

**6. ¿Puedo mezclar facturas y nóminas en la misma importación?**  
Sí. Selecciona todos los XML juntos en **Importar CFDI**. ContAI detecta el tipo de cada archivo: facturas pasan por clasificación normal; nóminas se registran directo como egreso con Gastos de Nómina.

**7. ¿Por qué no veo “Cargar mes demo”?**  
Solo aparece si el entorno tiene `VITE_ENABLE_DEMO_SEED=true` y tu rol es propietario o administrador. En producción pública suele estar apagado a propósito. Usa **Importar CFDI** o pide a tu admin que active el flag en el despliegue de piloto.

---

## Notas de alcance del piloto

- Menú principal: Panel general, Transacciones, Análisis, Conciliación, Descarga SAT, Fiscal, Inventario, Recurrentes, Bitácora, Configuración.
- **Mes demo (E14.0):** opcional vía flag de entorno; purge solo de movimientos `demo_seed` del periodo; no sustituye Descarga SAT.
- **Nómina:** no hay módulo propio; flujo vía **Importar CFDI** → **Transacciones** → **Conciliación** → **Exportar póliza (.txt)**.
- La conciliación bancaria vive en **Conciliación** (no dentro de Análisis).
- Descarga SAT es **Beta** (en el piloto suele operar en simulación, salvo indicación del administrador).
- Cuentas de nómina en póliza (Gastos de Nómina, ISR por Pagar, IMSS por Pagar, Bancos) vienen predefinidas; configuración de catálogo en UI queda fuera de alcance del piloto.
- No hay envío automático a sistemas de captura externos: la póliza se descarga como archivo de texto.
