/**
 * Contratos CFDI — reexport del extracto existente + helpers de resultado.
 */

export type { CfdiExtracted } from '../lib/cfdiXml';

export type CfdiParseResult =
  | { ok: true; data: import('../lib/cfdiXml').CfdiExtracted }
  | { ok: false; errors: string[] };
