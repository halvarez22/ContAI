/**
 * Reglas de cuenta compartidas por el catálogo y las pólizas del Anexo 24.
 */

import { ANEXO24_RFC_PATTERN } from '../config/anexo24';
import type { CatalogAccount } from '../types/chartOfAccounts';
import type { Anexo24NaturalezaSat } from '../types/anexo24Polizas';

export function naturalezaSat(account: CatalogAccount): Anexo24NaturalezaSat | null {
  if (account.naturaleza === 'iva') {
    if (account.tipo_iva === 'acreditable') return 'D';
    if (account.tipo_iva === 'trasladado') return 'A';
    return null;
  }
  if (account.naturaleza === 'activo' || account.naturaleza === 'gasto') return 'D';
  if (
    account.naturaleza === 'pasivo' ||
    account.naturaleza === 'capital' ||
    account.naturaleza === 'ingreso'
  ) {
    return 'A';
  }
  return null;
}

export function anexo24OrganizationRfc(value: string | null | undefined): string | null {
  const rfc = String(value ?? '').trim().toUpperCase();
  return ANEXO24_RFC_PATTERN.test(rfc) ? rfc : null;
}
