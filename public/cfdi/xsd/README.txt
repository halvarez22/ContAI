Validación XSD completa (CFDI 4.0)
==================================

Para validar contra el esquema oficial del SAT (cfdv40.xsd y dependencias):

1. Descarga el paquete de esquemas desde el portal del SAT (Miscelánea Fiscal / Anexo 20 / archivos XSD CFDI 4.0).

2. Copia en esta carpeta (public/cfdi/xsd/) al menos:
   - cfdv40.xsd
   - Todos los XSD que importe ese archivo (catálogos, complementos, etc.)

3. La app intentará cargar /cfdi/xsd/cfdv40.xsd en el navegador.
   Si faltan imports, la validación puede fallar y se usará el esquema "lite" embebido.

4. Tras un build, los archivos en public/ se sirven desde la raíz del sitio.

Referencia útil: https://www.sat.gob.mx (sección de CFDI / documentación técnica).
