/**
 * Balanza Anexo 24. Pura: no modifica el reporte que recibe.
 */

import {
  ANEXO24_BALANZA_ANIO_MAX,
  ANEXO24_BALANZA_ANIO_MIN,
  ANEXO24_BALANZA_BLOCKED_HINT,
  ANEXO24_BALANZA_SIN_CATALOGO,
  ANEXO24_BALANZA_SIN_CUENTAS,
  ANEXO24_BALANZA_TIPO_ENVIO,
  ANEXO24_PERIODO_INVALIDO,
  ANEXO24_RFC_INVALID_REASON,
} from '../config/anexo24';
import { accountCodeToCodAgrup } from '../config/anexo24Mapping';
import { TRIAL_BALANCE_TRUNCATED_HINT } from '../types/financialReports';
import type { ReportRow } from '../types/financialReports';
import { roundMoney } from '../types/paymentApplication';
import type {
  Anexo24BalanzaBlock,
  Anexo24BalanzaCuenta,
  Anexo24BalanzaInput,
  Anexo24BalanzaResult,
} from '../types/anexo24Balanza';
import { anexo24OrganizationRfc } from './anexo24Account';

function periodoOf(year: number, monthIndex: number): string {
  return `${String(monthIndex + 1).padStart(2, '0')}-${year}`;
}

function blockedResult(
  periodo: string,
  reason: string,
  blocked: Anexo24BalanzaBlock[]
): Anexo24BalanzaResult {
  return { ok: false, periodo, reason, cuentas: [], blocked };
}

function periodIsValid(year: number, monthIndex: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= ANEXO24_BALANZA_ANIO_MIN &&
    year <= ANEXO24_BALANZA_ANIO_MAX &&
    Number.isInteger(monthIndex) &&
    monthIndex >= 0 &&
    monthIndex <= 11
  );
}

function isZeroRow(row: ReportRow): boolean {
  return (
    roundMoney(row.saldo_inicial) === 0 &&
    roundMoney(row.cargos) === 0 &&
    roundMoney(row.abonos) === 0 &&
    roundMoney(row.saldo_final) === 0
  );
}

export function buildAnexo24Balanza(input: Anexo24BalanzaInput): Anexo24BalanzaResult {
  const periodo = periodoOf(input.year, input.monthIndex);
  const rfc = anexo24OrganizationRfc(input.organizationRfc);
  if (!rfc) {
    return blockedResult(periodo, ANEXO24_RFC_INVALID_REASON, [
      { accountCode: '', reason: ANEXO24_RFC_INVALID_REASON },
    ]);
  }
  if (!periodIsValid(input.year, input.monthIndex)) {
    return blockedResult(periodo, ANEXO24_PERIODO_INVALIDO, [
      { accountCode: '', reason: ANEXO24_PERIODO_INVALIDO },
    ]);
  }
  if (input.trialBalance.truncated) {
    return blockedResult(periodo, TRIAL_BALANCE_TRUNCATED_HINT, [
      { accountCode: '', reason: TRIAL_BALANCE_TRUNCATED_HINT },
    ]);
  }
  if (input.trialBalance.anomalies.length > 0) {
    return blockedResult(periodo, ANEXO24_BALANZA_SIN_CATALOGO, [
      { accountCode: '', reason: ANEXO24_BALANZA_SIN_CATALOGO },
    ]);
  }

  const blocked: Anexo24BalanzaBlock[] = [];
  const cuentas: Anexo24BalanzaCuenta[] = [];
  for (const row of input.trialBalance.rows) {
    if (isZeroRow(row)) continue;
    const code = row.account_code.trim();
    if (!accountCodeToCodAgrup(code)) {
      blocked.push({
        accountCode: code,
        reason: `La cuenta ${code} no tiene código agrupador válido del SAT.`,
      });
      continue;
    }
    cuentas.push({
      numCta: code,
      saldoIni: roundMoney(row.saldo_inicial),
      debe: roundMoney(row.cargos),
      haber: roundMoney(row.abonos),
      saldoFin: roundMoney(row.saldo_final),
    });
  }

  if (blocked.length > 0) {
    return blockedResult(periodo, ANEXO24_BALANZA_BLOCKED_HINT, blocked);
  }
  if (cuentas.length === 0) {
    return blockedResult(periodo, ANEXO24_BALANZA_SIN_CUENTAS, [
      { accountCode: '', reason: ANEXO24_BALANZA_SIN_CUENTAS },
    ]);
  }

  let debe = 0;
  let haber = 0;
  for (const cuenta of cuentas) {
    debe = roundMoney(debe + cuenta.debe);
    haber = roundMoney(haber + cuenta.haber);
  }
  if (debe !== haber) {
    const difference = roundMoney(debe - haber).toFixed(2);
    const reason = `La balanza no cuadra. Diferencia: ${difference}.`;
    return blockedResult(periodo, reason, [{ accountCode: '', reason }]);
  }

  return {
    ok: true,
    rfc,
    year: input.year,
    monthIndex: input.monthIndex,
    periodo,
    tipoEnvio: ANEXO24_BALANZA_TIPO_ENVIO,
    cuentas,
    blocked: [],
  };
}
