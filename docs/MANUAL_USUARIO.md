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
1. Usa la misma puerta **Importar CFDI** (no hay módulo aparte de nómina).
2. Si el archivo es un recibo de nómina del SAT (tipo nómina), ContAI crea **un solo egreso** por el monto neto pagado al empleado.
3. La cuenta se asigna automáticamente a **Gastos de Nómina** (sin pedir clasificación a la asistencia).
4. El RFC y nombre del empleado quedan en el movimiento para conciliar con el banco. Retenciones como ISR o IMSS se guardan como datos de apoyo; **no** generan movimientos bancarios aparte en esta versión.

### 📝 Ejemplo práctico
Te llegan 15 XML del mes. Los seleccionas juntos en **Importar CFDI**, dejas que el lote termine y abres **Transacciones** para revisar los que quedaron “en revisión”.

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
Si importaste recibos de nómina timbrados, al exportar ContAI genera un asiento de **4 partidas** por cada egreso de nómina conciliado:
1. Cargo → Gastos de Nómina (percepciones brutas)
2. Abono → ISR por Pagar (retención)
3. Abono → IMSS por Pagar (retención)
4. Abono → Bancos (neto pagado al empleado)

La conciliación bancaria sigue usando **solo el egreso neto** en Transacciones; los pasivos aparecen únicamente en el archivo `.txt`. Si faltan datos de retención en el XML, la exportación usa un asiento simple (gasto neto / banco) e indica `[nomina: pasivos omitidos]` en el concepto.

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

---

## Notas de alcance del piloto

- Menú principal: Panel general, Transacciones, Análisis, Conciliación, Descarga SAT, Fiscal, Inventario, Recurrentes, Bitácora, Configuración.
- La conciliación bancaria vive en **Conciliación** (no dentro de Análisis).
- Descarga SAT es **Beta** (en el piloto suele operar en simulación, salvo indicación del administrador).
- No hay envío automático a sistemas de captura externos: la póliza se descarga como archivo de texto.
