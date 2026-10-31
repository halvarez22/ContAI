/**
 * Código agrupador del SAT (catálogo c_CodAgrup, Anexo 24 versión 1.3).
 * El valor publicado para bancos nacionales es 102.01. 102010 no está en esa enumeración.
 */

import { ANEXO24_SEED_CODES } from './chartOfAccounts';

export const ANEXO24_CODAGRUP_PATTERN = /^[0-9]{3}(\.[0-9]{2,3})+$/;

const SEED_CODAGRUP = new Set<string>(ANEXO24_SEED_CODES);

export function isAnexo24CodAgrup(value: string): boolean {
  return ANEXO24_CODAGRUP_PATTERN.test(value);
}

export function accountCodeToCodAgrup(accountCode: string): string | null {
  const code = accountCode.trim();
  if (!SEED_CODAGRUP.has(code)) return null;
  if (!isAnexo24CodAgrup(code)) return null;
  return code;
}
