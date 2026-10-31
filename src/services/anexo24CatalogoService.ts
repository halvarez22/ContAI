/**
 * Catálogo Anexo 24. Puro: no modifica las cuentas que recibe.
 */

import {
  ANEXO24_CATALOGO_BLOCKED_HINT,
  ANEXO24_CATALOGO_MAX_ACCOUNTS,
  ANEXO24_CATALOGO_TOO_MANY,
  ANEXO24_DESC_MAX,
  ANEXO24_INACTIVE_NOTICE,
  ANEXO24_NO_ACTIVE_ACCOUNTS,
  ANEXO24_RFC_INVALID_REASON,
} from '../config/anexo24';
import { accountCodeToCodAgrup } from '../config/anexo24Mapping';
import { periodKey } from '../lib/periodClose';
import type {
  Anexo24CatalogoBlock,
  Anexo24CatalogoCuenta,
  Anexo24CatalogoInput,
  Anexo24CatalogoNotice,
  Anexo24CatalogoResult,
} from '../types/anexo24Catalogo';
import { anexo24OrganizationRfc, naturalezaSat } from './anexo24Account';

function blockedResult(
  key: string,
  reason: string,
  blocked: Anexo24CatalogoBlock[],
  notices: Anexo24CatalogoNotice[]
): Anexo24CatalogoResult {
  return { ok: false, periodKey: key, reason, cuentas: [], blocked, notices };
}

function repeatedCodeReason(code: string): string {
  return `El código ${code} está repetido.`;
}

export function buildAnexo24Catalogo(input: Anexo24CatalogoInput): Anexo24CatalogoResult {
  const key = periodKey(input.year, input.monthIndex);
  const rfc = anexo24OrganizationRfc(input.organizationRfc);
  if (!rfc) {
    return blockedResult(key, ANEXO24_RFC_INVALID_REASON, [
      { accountCode: '', reason: ANEXO24_RFC_INVALID_REASON },
    ], []);
  }
  if (input.chart.length > ANEXO24_CATALOGO_MAX_ACCOUNTS) {
    return blockedResult(key, ANEXO24_CATALOGO_TOO_MANY, [
      { accountCode: '', reason: ANEXO24_CATALOGO_TOO_MANY },
    ], []);
  }

  const activeCount = new Map<string, number>();
  for (const account of input.chart) {
    if (!account.activa) continue;
    const code = account.code.trim();
    activeCount.set(code, (activeCount.get(code) ?? 0) + 1);
  }

  const blocked: Anexo24CatalogoBlock[] = [];
  const notices: Anexo24CatalogoNotice[] = [];
  const reportedDuplicates = new Set<string>();
  const cuentas: Anexo24CatalogoCuenta[] = [];

  for (const account of input.chart) {
    const code = account.code.trim();
    if (!account.activa) {
      notices.push({ accountCode: code, reason: ANEXO24_INACTIVE_NOTICE });
      continue;
    }
    const copies = activeCount.get(code) ?? 0;
    if (copies > 1) {
      if (!reportedDuplicates.has(code)) {
        reportedDuplicates.add(code);
        blocked.push({ accountCode: code, reason: repeatedCodeReason(code) });
      }
      continue;
    }
    const name = account.name.trim();
    if (!name) {
      blocked.push({ accountCode: code, reason: 'La cuenta no tiene nombre.' });
      continue;
    }
    if (name.length > ANEXO24_DESC_MAX) {
      blocked.push({ accountCode: code, reason: 'El nombre de la cuenta excede la longitud del catálogo.' });
      continue;
    }
    const codAgrup = accountCodeToCodAgrup(account.code);
    if (!codAgrup) {
      blocked.push({
        accountCode: code,
        reason: `La cuenta ${code} no tiene código agrupador válido del SAT.`,
      });
      continue;
    }
    const natur = naturalezaSat(account);
    if (!natur) {
      blocked.push({ accountCode: code, reason: 'La cuenta no tiene naturaleza deudora o acreedora.' });
      continue;
    }
    cuentas.push({
      codAgrup,
      numCta: code,
      desc: name,
      nivel: 1,
      natur,
    });
  }

  if (blocked.length > 0) {
    return blockedResult(key, ANEXO24_CATALOGO_BLOCKED_HINT, blocked, notices);
  }
  if (cuentas.length === 0) {
    return blockedResult(key, ANEXO24_NO_ACTIVE_ACCOUNTS, [
      { accountCode: '', reason: ANEXO24_NO_ACTIVE_ACCOUNTS },
    ], notices);
  }

  const ordered = [...cuentas].sort((left, right) => left.numCta.localeCompare(right.numCta));
  return {
    ok: true,
    rfc,
    year: input.year,
    monthIndex: input.monthIndex,
    periodKey: key,
    cuentas: ordered,
    blocked: [],
    notices,
  };
}
