# 📒 ContAI — Manual de Usuario
### Para personal no técnico · Versión de Pruebas de Campo · Agosto 2026

---

> [!NOTE]
> Este manual está pensado para quien registra movimientos día a día. No necesitas conocimientos de contabilidad ni informática avanzada. Si algo no funciona como se describe aquí, anota el mensaje en pantalla y repórtalo al equipo de soporte.

---

## ¿Qué es ContAI?

**ContAI** es tu libreta de contabilidad digital. Sirve para:

- Anotar **ingresos** (dinero que entra) y **egresos** (dinero que sale).
- Ver **resúmenes mensuales** del negocio.
- Llevar un **inventario** básico de productos.
- Obtener **estimaciones orientativas** de IVA e ISR.
- Que la inteligencia artificial sugiera en qué categoría contable va cada gasto.

> [!IMPORTANT]
> ContAI es una herramienta de **apoyo** interno. No reemplaza al contador ni a las declaraciones oficiales ante el SAT.

---

## 1. Acceder a la aplicación

### Lo que necesitas
- La dirección web: **`https://cont-ai-psi.vercel.app`**
- Una cuenta de **Google (Gmail)** que el administrador haya autorizado.
- Conexión a internet estable.

### Cómo entrar

1. Abre tu navegador (Chrome, Edge o Firefox recomendados).
2. Escribe o pega la dirección web.
3. Haz clic en **"Iniciar sesión con Google"**.
4. Elige la cuenta de Gmail que usas para el negocio.
5. Si el navegador pide permiso para continuar, acéptalo.

✅ Cuando entres correctamente verás el **Panel general** con los números del mes.

![Pantalla de inicio de sesión de ContAI](C:\Users\halva\.gemini\antigravity\brain\7ecca29f-45db-4469-bf7c-d3e5840c62ac\contai_login_1787075151625.jpg)

### Cómo salir

- En el menú izquierdo, al fondo, haz clic en **"Cerrar sesión"** (ícono de puerta).
- Siempre cierra sesión si usas una computadora compartida.

---

## 2. El menú principal

A la izquierda de la pantalla está el menú con todas las secciones. Si lo ves muy angosto, busca el ícono ☰ (tres líneas) para expandirlo.

| Ícono | Sección | ¿Para qué sirve? |
|-------|---------|-----------------|
| 🏠 | **Panel general** | Resumen del mes: ingresos, egresos y accesos directos |
| 💳 | **Transacciones** | Lista de todos los movimientos; aquí se captura, filtra y exporta |
| 📊 | **Análisis** | Vista detallada del periodo + conciliación bancaria |
| 🏛️ | **Fiscal** | Estimaciones de IVA e ISR + cierre de meses |
| 📦 | **Inventario** | Productos y movimientos de mercancía |
| 🔁 | **Recurrentes** | Gastos o ingresos que se repiten (renta, suscripciones, etc.) |
| 📋 | **Bitácora** | Historial de quién hizo qué en el sistema |
| ⚙️ | **Configuración** | Nombre del negocio, RFC y catálogo de cuentas |

---

## 3. Panel general

Es lo primero que ves al entrar. Muestra:

- **Ingresos del mes** — dinero que entró.
- **Egresos del mes** — dinero que salió.
- **Saldo neto** — diferencia entre ingresos y egresos.
- **Movimientos en revisión** — registros que necesitan ser revisados antes de darse por buenos.
- Accesos directos para capturar una transacción rápidamente.

![Panel general con resumen mensual y transacciones recientes](C:\Users\halva\.gemini\antigravity\brain\7ecca29f-45db-4469-bf7c-d3e5840c62ac\contai_dashboard_1787075162201.jpg)

### Cambiar el periodo
En la parte superior hay un selector de **mes y año** con flechas `< >`. Al cambiarlo, todos los números se actualizan para mostrar ese periodo.

### Resumen con IA (si está activado)
Si ves un botón **"Generar resumen ejecutivo"** o **"Pregunta sobre el mes"**, la IA puede redactar un texto explicativo del periodo o responder preguntas en lenguaje natural. Escribe tu pregunta en el cuadro y espera la respuesta.

---

## 4. Transacciones

Esta es la sección que más usarás. Aquí viven **todos los movimientos** del negocio.

### 4.1 Capturar un movimiento manual

1. Haz clic en el botón **"+ Capturar"** (o el ícono de suma).
2. Llena el formulario:

| Campo | Qué poner | ¿Obligatorio? |
|-------|-----------|---------------|
| **Concepto** | Descripción breve (ej. "Compra de papel bond") | ✅ Sí |
| **Monto** | Cantidad en números, sin comas (ej. `1500`) | ✅ Sí |
| **Fecha** | La fecha real del movimiento | ✅ Sí |
| **Tipo** | *Ingreso* o *Egreso* | ✅ Sí |
| **Proveedor / Cliente** | Nombre de quien pagó o recibió | Opcional |
| **Cuenta contable** | Si la conoces; si no, la IA la sugiere | Opcional |
| **Etiquetas** | Palabras clave separadas por coma (ej. `Obra A, Urgente`) | Opcional |
| **IVA** | Tasa si aplica (16%, 8%, 0%, Exento) | Opcional |

3. Haz clic en **"Guardar"**.

![Formulario para capturar una transacción manual](C:\Users\halva\.gemini\antigravity\brain\7ecca29f-45db-4469-bf7c-d3e5840c62ac\contai_capturar_transaccion_1787075171696.jpg)

> [!TIP]
> Si no sabes la cuenta contable, déjala vacía. La inteligencia artificial la sugerirá automáticamente en segundos.

### 4.2 Estados de un movimiento

Después de guardar, cada movimiento tendrá uno de estos estados:

| Estado | Significado | ¿Qué hacer? |
|--------|------------|-------------|
| 🟡 **Pendiente** | La IA aún está clasificando | Esperar un momento |
| 🟠 **En revisión** | El sistema o la IA piden confirmación | Revisar y aprobar o rechazar |
| 🟢 **Conciliado** | Listo y clasificado correctamente | Nada, ya está bien |
| 🔴 **Rechazado** | Se decidió no usar este movimiento | Solo lectura |

Para **aprobar** un movimiento en revisión: ábrelo y haz clic en **"Aprobar"**. Aparecerá una confirmación para evitar clics por accidente.

### 4.3 Buscar y filtrar movimientos

En la parte superior de la lista de transacciones hay filtros:

- **Buscar** — escribe parte del nombre del proveedor o del concepto.
- **Tipo** — Todos / Ingresos / Egresos.
- **Estado** — Todos / Conciliado / En revisión / Pendiente / Rechazado.
- **Etiqueta** — filtra por etiqueta.
- **Fecha desde / hasta** — rango de fechas.

Combínalos para encontrar rápido lo que buscas.

![Lista de transacciones con filtros y estado de cada movimiento](C:\Users\halva\.gemini\antigravity\brain\7ecca29f-45db-4469-bf7c-d3e5840c62ac\contai_transacciones_lista_1787075182152.jpg)

### 4.4 Ver el detalle de un movimiento

Haz clic sobre cualquier movimiento de la lista para ver todos sus datos: cuenta asignada, nivel de confianza de la IA, etiquetas, RFC de la contraparte, etc.

### 4.5 Etiquetar movimientos

Las etiquetas te ayudan a agrupar movimientos por proyecto, sucursal o tipo de gasto.

1. Abre el detalle de un movimiento.
2. Escribe la etiqueta (ej. `Sucursal Norte`) y presiona Enter o clic en el botón de confirmar.
3. Para quitarla, haz clic en la **X** junto a la etiqueta.

Después puedes filtrar toda la lista por esa etiqueta.

### 4.6 Exportar a Excel / CSV

1. Aplica los filtros que quieras (periodo, tipo, etc.).
2. Haz clic en **"Exportar CSV"**.
3. Se descargará un archivo `.csv` que puedes abrir directamente con **Microsoft Excel**.

El archivo incluye: fecha, proveedor, concepto, tipo, monto, estado, cuenta, etiquetas y datos fiscales.

### 4.7 Importar desde Excel (carga masiva)

Si ya tienes movimientos en archivos Excel del negocio:

1. Haz clic en **"Importar Excel"**.
2. Selecciona uno o varios archivos `.xlsx`.
3. Espera el mensaje de confirmación con el conteo de transacciones y productos importados.

> [!WARNING]
> Los movimientos con fecha en un **mes cerrado** no se importan. Verifica en la sección Fiscal si el mes está cerrado antes de importar.

**Formatos de Excel compatibles:**
- Archivo de **ingresos y gastos tipo PFAE / CARLOS** (hojas de ingresos y gastos).
- Archivo de **control de inventarios** (ventas menudeo y existencias).
- Archivo de **utilidad de ventas**.

### 4.8 Importar una factura electrónica (XML / CFDI)

1. Haz clic en **"Importar CFDI"**.
2. Selecciona el archivo `.xml` que te proporcionó tu proveedor o descargaste del SAT.
3. El sistema valida que el archivo esté bien formado.
4. Si es válido, verás un resumen (total, fecha, emisor, receptor).
5. Haz clic en **"Registrar Transacción"** para guardarlo.

![Modal de importación de factura XML con vista previa de los datos del CFDI](C:\Users\halva\.gemini\antigravity\brain\7ecca29f-45db-4469-bf7c-d3e5840c62ac\contai_importar_cfdi_1787075206377.jpg)

> [!NOTE]
> Si aparece un error de validación, el archivo puede estar incompleto o dañado. Solicita que te reenvíen la factura.

---

## 5. Análisis

Muestra el periodo actual con más detalle:

- Gráficas de ingresos vs. egresos.
- Desglose por categoría o cuenta contable.
- Ranking de movimientos de mayor riesgo o revisión pendiente.

### Conciliación bancaria (si está disponible)

1. Descarga el estado de cuenta de tu banco en formato **CSV**.
2. En Análisis, haz clic en **"Cargar archivo del banco"**.
3. El sistema sugiere cuáles movimientos del banco coinciden con los que ya tienes registrados.
4. Revisa cada sugerencia y acepta o rechaza la coincidencia.

---

## 6. Fiscal

> [!IMPORTANT]
> Esta sección muestra **estimaciones orientativas** basadas en lo registrado en ContAI. **No sustituye** la declaración ante el SAT ni el trabajo del contador.

### 6.1 Estimaciones de IVA e ISR

Verás tarjetas con:
- **IVA causado del mes** — lo que el negocio debe de IVA según sus ventas registradas.
- **IVA acreditable** — lo que puede acreditar por sus compras.
- **ISR provisional estimado** — cálculo orientativo del impuesto sobre la renta.

### 6.2 Cierre de mes ⚠️

**Cerrar un mes** significa que ya no se podrán registrar nuevos movimientos con fecha en ese mes, ni a mano ni por importación.

![Sección Fiscal con estimaciones de IVA/ISR y control de cierre de periodos](C:\Users\halva\.gemini\antigravity\brain\7ecca29f-45db-4469-bf7c-d3e5840c62ac\contai_fiscal_1787075192043.jpg)

- Úsalo **únicamente cuando el contador confirme** que el mes está terminado.
- Para cerrar: haz clic en **"Cerrar Mes"** y confirma.
- Para volver a abrir un mes: haz clic en **"Abrir"** (requiere permiso).

> [!CAUTION]
> Una vez cerrado un mes, cualquier intento de guardar una transacción con esa fecha será bloqueado automáticamente. Asegúrate de tener todo capturado antes de cerrar.

---

## 7. Inventario

Lleva un registro básico de los productos o mercancías del negocio.

### 7.1 Productos

- Cada producto tiene: **código**, **nombre** y **unidad** (piezas, kg, litros, etc.).
- Para agregar un producto nuevo: botón **"+ Agregar producto"**.

### 7.2 Movimientos de inventario

- **Entrada** — llegó mercancía (compra o recepción).
- **Salida** — se vendió o se utilizó mercancía.
- **Ajuste** — corrección de cantidad (inventario físico, merma, etc.).

> [!WARNING]
> No podrás registrar movimientos de inventario en un mes cerrado en la sección Fiscal.

---

## 8. Recurrentes

Para gastos o ingresos que se repiten con regularidad (renta, nómina, suscripciones, etc.).

### Crear una plantilla recurrente

1. Haz clic en **"+ Agregar recurrente"**.
2. Llena: concepto, monto, tipo (ingreso/egreso), frecuencia y fecha de próxima ejecución.
3. Guarda.

### Gestionar plantillas existentes

| Acción | Cómo |
|--------|------|
| **Pausar** | Haz clic en el ícono ⏸ — deja de generar movimientos temporalmente |
| **Reactivar** | Haz clic en el ícono ▶ — vuelve a estar activa |
| **Editar** | Haz clic en el ícono ✏️ |
| **Eliminar** | Haz clic en el ícono 🗑️ |

Para **procesar** las recurrentes pendientes manualmente, haz clic en **"Procesar recurrentes"**.

---

## 9. Bitácora

Registro automático de todas las acciones importantes realizadas en el sistema:
- Quién capturó o modificó una transacción.
- Quién cerró o abrió un periodo.
- Cuándo se importaron archivos.

Es solo de **lectura**. No se puede modificar.

---

## 10. Configuración

Personaliza los datos del negocio.

| Campo | ¿Para qué? |
|-------|-----------|
| **Nombre de la empresa** | Aparece en los reportes exportados |
| **RFC** | Aparece en los reportes exportados |
| **Catálogo de cuentas** | Lista de cuentas contables disponibles al capturar |

---

## 11. Modo claro / oscuro 🌙

En la parte superior de la pantalla hay un ícono de **sol** ☀️ o **luna** 🌙. Haz clic para cambiar el fondo de la pantalla. La aplicación recuerda tu preferencia en ese navegador.

---

## 12. Preguntas frecuentes

**¿Puedo usar ContAI desde el celular?**
Sí, la app funciona en el navegador móvil, aunque la experiencia es mejor en computadora o tablet.

**¿Puedo borrar un movimiento?**
Depende de la configuración del administrador. Si no ves la opción de eliminar, repórtalo a soporte.

**¿Por qué no me deja guardar con una fecha?**
El mes de esa fecha probablemente está **cerrado** en Fiscal. Habla con quien pueda abrirlo.

**¿Se pierde la información si cambio de computadora?**
No. Los datos están en la nube. Mientras entres con la **misma cuenta de Google**, todo estará ahí.

**¿La IA reemplaza al contador?**
No. La IA solo ayuda a clasificar movimientos y generar textos de apoyo. Las decisiones fiscales y contables oficiales las define el contador.

**¿Qué hago si el login falla?**
Asegúrate de usar la cuenta de Gmail que el administrador autorizó. Si el problema persiste, reporta el mensaje de error exacto.

**¿Qué hago si un archivo XML da error?**
Verifica que sea un CFDI válido emitido por el SAT. Algunos archivos descargados de portales pueden estar incompletos.

---

## 13. Cómo reportar un problema

Cuando algo no funcione, anota y comparte con soporte:

1. ✅ **¿Qué estabas haciendo?** (ej. "Estaba guardando un egreso de $5,000")
2. ✅ **¿Qué botón presionaste?**
3. ✅ **¿Qué mensaje apareció en pantalla?** (captúralo con foto o screenshot)
4. ✅ **¿En qué dispositivo y navegador?** (ej. "Chrome en Windows")

Con esa información el equipo técnico puede ayudarte mucho más rápido. No necesitas saber programación.

---

*ContAI · Manual para pruebas de campo · Agosto 2026*
