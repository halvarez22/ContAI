/** Anexo 24 versión 1.3. Constantes del XML de pólizas. */

export const ANEXO24_POLIZAS_VERSION = '1.3';
export const ANEXO24_TIPO_SOLICITUD = 'AF';
export const ANEXO24_CONCEPTO_MAX = 300;
export const ANEXO24_POLIZAS_NAMESPACE =
  'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo';
export const ANEXO24_POLIZAS_SCHEMA = `${ANEXO24_POLIZAS_NAMESPACE}/PolizasPeriodo_1_3.xsd`;

export const ANEXO24_CATALOGO_NAMESPACE =
  'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas';
export const ANEXO24_CATALOGO_SCHEMA = `${ANEXO24_CATALOGO_NAMESPACE}/CatalogoCuentas_1_3.xsd`;
export const ANEXO24_DESC_MAX = 400;
export const ANEXO24_CATALOGO_MAX_ACCOUNTS = 200;
export const ANEXO24_INACTIVE_NOTICE = 'La cuenta está inactiva y no entra al catálogo.';
export const ANEXO24_NO_ACTIVE_ACCOUNTS = 'No hay cuentas activas para el catálogo.';
export const ANEXO24_CATALOGO_BLOCKED_HINT = 'Hay cuentas por corregir.';
export const ANEXO24_CATALOGO_TOO_MANY = 'El catálogo admite hasta 200 cuentas.';

/** Persona moral (12) o física (13). */
export const ANEXO24_RFC_PATTERN = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/i;

export const ANEXO24_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ANEXO24_RFC_INVALID_REASON =
  'El RFC de la organización no tiene el formato requerido.';

export const ANEXO24_BOTH_ENTRIES_REASON =
  'El movimiento tiene devengo y liquidación a la vez.';

export const ANEXO24_NO_POLIZAS_REASON =
  'No hay pólizas conciliadas para este periodo.';

export const ANEXO24_NO_CFDI_NOTICE =
  'Este movimiento no tiene comprobante fiscal.';

export const ANEXO24_NOT_CONCILIADO = 'El movimiento no está conciliado.';

export const ANEXO24_ROLE_HINT = 'Tu rol no puede descargar la contabilidad.';

export const ANEXO24_BLOCKED_HINT = 'Hay partidas por corregir.';
