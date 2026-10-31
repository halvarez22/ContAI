/**
 * Pólizas Anexo 24. Puro: no modifica lo que recibe ni escribe archivos.
 */

import {
  ANEXO24_BLOCKED_HINT,
  ANEXO24_BOTH_ENTRIES_REASON,
  ANEXO24_CONCEPTO_MAX,
  ANEXO24_NO_CFDI_NOTICE,
  ANEXO24_NO_POLIZAS_REASON,
  ANEXO24_NOT_CONCILIADO,
  ANEXO24_RFC_INVALID_REASON,
  ANEXO24_RFC_PATTERN,
  ANEXO24_TIPO_SOLICITUD,
  ANEXO24_UUID_PATTERN,
} from '../config/anexo24';
import {
  ACCRUAL_BANCOS_CODE,
  ACCRUAL_CLIENTES_CODE,
  ACCRUAL_PROVEEDORES_CODE,
  ANEXO24_SEED_CODES,
} from '../config/chartOfAccounts';
import { periodKey } from '../lib/periodClose';
import type { CatalogAccount } from '../types/chartOfAccounts';
import type { JournalEntry, JournalLine } from '../types/journalEntry';
import { parseJournalEntry } from './journalEntryService';
import { roundMoney } from '../types/paymentApplication';
import type {
  Anexo24Application,
  Anexo24Block,
  Anexo24CompNal,
  Anexo24Excluded,
  Anexo24Movement,
  Anexo24NaturalezaSat,
  Anexo24Notice,
  Anexo24Poliza,
  Anexo24PolizaInput,
  Anexo24PolizaResult,
  Anexo24Transaccion,
  TipoPolizaSat,
} from '../types/anexo24Polizas';

export function naturalezaSat(account: CatalogAccount): Anexo24NaturalezaSat | null {
  if (account.naturaleza === 'iva') {
    if (account.tipo_iva === 'acreditable') return 'D';
    if (account.tipo_iva === 'trasladado') return 'A';
    return null;
  }
  if (account.naturaleza === 'activo' || account.naturaleza === 'gasto') return 'D';
  if (account.naturaleza === 'pasivo' || account.naturaleza === 'capital' || account.naturaleza === 'ingreso') {
    return 'A';
  }
  return null;
}

function blockedResult(
  key: string,
  reason: string,
  blocked: Anexo24Block[],
  notices: Anexo24Notice[],
  excluded: Anexo24Excluded[]
): Anexo24PolizaResult {
  return { ok: false, periodKey: key, reason, polizas: [], blocked, notices, excluded };
}

function inMonth(fecha: string, year: number, monthIndex: number): boolean | null {
  const parsed = new Date(fecha);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear() === year && parsed.getMonth() === monthIndex;
}

function polizaFecha(fecha: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(fecha)) return null;
  const day = fecha.slice(0, 10);
  const parsed = new Date(`${day}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return day;
}

function clipConcepto(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').trim();
  const text = clean || 'Sin concepto';
  return text.length > ANEXO24_CONCEPTO_MAX ? text.slice(0, ANEXO24_CONCEPTO_MAX) : text;
}

function activeAccount(chart: readonly CatalogAccount[], code: string): CatalogAccount | undefined {
  const trimmed = code.trim();
  return chart.find((account) => account.activa && account.code.trim() === trimmed);
}

function requiresCfdi(movement: Anexo24Movement): boolean {
  const tipo = String(movement.cfdi_tipo_comprobante ?? '').trim().toUpperCase();
  return movement.importado_cfdi === true || tipo === 'I' || tipo === 'E' || tipo === 'N' || tipo === 'P';
}

function tipoPoliza(entry: JournalEntry): TipoPolizaSat | null {
  const hasBancos = entry.lines.some((line) => line.account_code.trim() === ACCRUAL_BANCOS_CODE);
  if (!hasBancos) return '3';
  if (entry.tipo === 'ingreso') return '1';
  if (entry.tipo === 'egreso') return '2';
  return null;
}

function hostIndex(entry: JournalEntry): number {
  const bancos = entry.lines.findIndex((line) => line.account_code.trim() === ACCRUAL_BANCOS_CODE);
  if (bancos >= 0) return bancos;
  const contra = entry.lines.findIndex((line) => {
    const code = line.account_code.trim();
    return code === ACCRUAL_CLIENTES_CODE || code === ACCRUAL_PROVEEDORES_CODE;
  });
  return contra >= 0 ? contra : 0;
}

function validRfc(value: string | null | undefined): string | null {
  const rfc = String(value ?? '').trim().toUpperCase();
  return ANEXO24_RFC_PATTERN.test(rfc) ? rfc : null;
}

function validUuid(value: string | null | undefined): string | null {
  const uuid = String(value ?? '').trim();
  return ANEXO24_UUID_PATTERN.test(uuid) ? uuid : null;
}

function compNal(uuid: string, rfc: string, montoTotal: number): Anexo24CompNal {
  return { uuid, rfc, montoTotal: roundMoney(montoTotal), moneda: 'MXN', tipCamb: '1' };
}

function pushBlock(
  blocked: Anexo24Block[],
  transactionId: string,
  accountCode: string,
  reason: string
): void {
  blocked.push({ transactionId, accountCode, reason });
}

function applicationsSum(amounts: readonly number[]): number {
  let sum = 0;
  for (const amount of amounts) sum = roundMoney(sum + roundMoney(amount));
  return sum;
}

function buildLines(
  movement: Anexo24Movement,
  entry: JournalEntry,
  origin: 'devengo' | 'liquidacion',
  chart: readonly CatalogAccount[],
  movements: readonly Anexo24Movement[],
  applications: readonly Anexo24Application[],
  blocked: Anexo24Block[],
  notices: Anexo24Notice[]
): Anexo24Transaccion[] | null {
  const lines: Anexo24Transaccion[] = [];
  let failed = false;
  for (const line of entry.lines) {
    const code = line.account_code.trim();
    const account = activeAccount(chart, code);
    if (!account) {
      pushBlock(blocked, movement.id, code, 'La cuenta no está en el catálogo activo.');
      failed = true;
      continue;
    }
    if (!ANEXO24_SEED_CODES.includes(account.code)) {
      pushBlock(blocked, movement.id, account.code, 'La cuenta no tiene código agrupador del SAT.');
      failed = true;
      continue;
    }
    if (naturalezaSat(account) === null) {
      pushBlock(blocked, movement.id, account.code, 'La cuenta no tiene naturaleza deudora o acreedora.');
      failed = true;
      continue;
    }
    lines.push({
      numCta: account.code,
      desCta: account.name,
      concepto: clipConcepto(line.concepto),
      debe: line.tipo === 'cargo' ? roundMoney(line.monto) : 0,
      haber: line.tipo === 'abono' ? roundMoney(line.monto) : 0,
      comprobantes: [],
    });
  }
  if (failed) return null;

  if (origin === 'liquidacion') {
    return attachLiquidacion(movement, entry, lines, movements, applications, blocked) ? lines : null;
  }
  return attachDevengo(movement, entry, lines, blocked, notices) ? lines : null;
}

function attachDevengo(
  movement: Anexo24Movement,
  entry: JournalEntry,
  lines: Anexo24Transaccion[],
  blocked: Anexo24Block[],
  notices: Anexo24Notice[]
): boolean {
  const host = lines[hostIndex(entry)];
  if (!host) return false;
  const uuid = validUuid(movement.cfdi_uuid);
  if (requiresCfdi(movement)) {
    if (!movement.cfdi_uuid?.trim()) {
      pushBlock(blocked, movement.id, host.numCta, 'Falta el UUID del comprobante.');
      return false;
    }
    if (!uuid) {
      pushBlock(blocked, movement.id, host.numCta, 'El UUID del comprobante no tiene el formato requerido.');
      return false;
    }
    const rfc = validRfc(movement.rfc_contraparte);
    if (!rfc) {
      pushBlock(blocked, movement.id, host.numCta, 'El RFC del comprobante no tiene el formato requerido.');
      return false;
    }
    const monto = typeof movement.monto === 'number' && Number.isFinite(movement.monto) && movement.monto > 0
      ? movement.monto
      : host.debe + host.haber;
    host.comprobantes.push(compNal(uuid, rfc, monto));
    return true;
  }
  if (!String(movement.cfdi_uuid ?? '').trim()) {
    notices.push({ transactionId: movement.id, reason: ANEXO24_NO_CFDI_NOTICE });
    return true;
  }
  if (!uuid) {
    pushBlock(blocked, movement.id, host.numCta, 'El UUID del comprobante no tiene el formato requerido.');
    return false;
  }
  const rfc = validRfc(movement.rfc_contraparte);
  if (!rfc) {
    pushBlock(blocked, movement.id, host.numCta, 'El RFC del comprobante no tiene el formato requerido.');
    return false;
  }
  const monto = typeof movement.monto === 'number' && Number.isFinite(movement.monto) && movement.monto > 0
    ? movement.monto
    : host.debe + host.haber;
  host.comprobantes.push(compNal(uuid, rfc, monto));
  return true;
}

function findLine(entry: JournalEntry, codes: readonly string[]): JournalLine | undefined {
  return entry.lines.find((line) => codes.includes(line.account_code.trim()));
}

function attachLiquidacion(
  movement: Anexo24Movement,
  entry: JournalEntry,
  lines: Anexo24Transaccion[],
  movements: readonly Anexo24Movement[],
  applications: readonly Anexo24Application[],
  blocked: Anexo24Block[]
): boolean {
  const bancos = findLine(entry, [ACCRUAL_BANCOS_CODE]);
  const contra = findLine(entry, [ACCRUAL_CLIENTES_CODE, ACCRUAL_PROVEEDORES_CODE]);
  const bancosOut = lines.find((line) => line.numCta === ACCRUAL_BANCOS_CODE);
  const contraOut = lines.find(
    (line) => line.numCta === ACCRUAL_CLIENTES_CODE || line.numCta === ACCRUAL_PROVEEDORES_CODE
  );
  if (!bancos || !contra || !bancosOut || !contraOut) {
    pushBlock(
      blocked,
      movement.id,
      '',
      'La liquidación no tiene las partidas de bancos y de clientes o proveedores.'
    );
    return false;
  }

  const paymentUuid = validUuid(movement.cfdi_uuid);
  const paymentRfc = validRfc(movement.rfc_contraparte);
  if (!movement.cfdi_uuid?.trim()) {
    pushBlock(blocked, movement.id, bancosOut.numCta, 'Falta el UUID del comprobante.');
    return false;
  }
  if (!paymentUuid) {
    pushBlock(blocked, movement.id, bancosOut.numCta, 'El UUID del comprobante no tiene el formato requerido.');
    return false;
  }
  if (!paymentRfc) {
    pushBlock(blocked, movement.id, bancosOut.numCta, 'El RFC del comprobante no tiene el formato requerido.');
    return false;
  }
  bancosOut.comprobantes.push(compNal(paymentUuid, paymentRfc, bancos.monto));

  const mine = applications.filter((app) => app.source_id === movement.id);
  if (mine.length === 0) {
    pushBlock(blocked, movement.id, contraOut.numCta, 'El complemento no tiene facturas aplicadas.');
    return false;
  }

  const amounts: number[] = [];
  let failed = false;
  for (const app of mine) {
    if (!Number.isFinite(app.amount)) {
      pushBlock(
        blocked,
        movement.id,
        contraOut.numCta,
        `El importe de la aplicación ${app.id} en el movimiento ${movement.id} no es válido.`
      );
      failed = true;
      continue;
    }
    const target = movements.find((row) => row.id === app.target_transaction_id);
    const uuid = validUuid(app.cfdi_uuid_relacionado) ?? validUuid(target?.cfdi_uuid);
    if (!String(app.cfdi_uuid_relacionado ?? '').trim() && !String(target?.cfdi_uuid ?? '').trim()) {
      pushBlock(
        blocked,
        movement.id,
        contraOut.numCta,
        `Falta el UUID de la aplicación ${app.id} en el movimiento ${movement.id}.`
      );
      failed = true;
      continue;
    }
    if (!uuid) {
      pushBlock(
        blocked,
        movement.id,
        contraOut.numCta,
        `El UUID de la aplicación ${app.id} en el movimiento ${movement.id} no tiene el formato requerido.`
      );
      failed = true;
      continue;
    }
    const rfc = validRfc(target?.rfc_contraparte);
    if (!rfc) {
      pushBlock(
        blocked,
        movement.id,
        contraOut.numCta,
        `Falta el RFC de la aplicación ${app.id} en el movimiento ${movement.id}.`
      );
      failed = true;
      continue;
    }
    amounts.push(app.amount);
    contraOut.comprobantes.push(compNal(uuid, rfc, app.amount));
  }
  if (failed) return false;

  const sum = applicationsSum(amounts);
  const partida = roundMoney(contra.monto);
  if (sum !== partida) {
    const difference = roundMoney(partida - sum).toFixed(2);
    pushBlock(
      blocked,
      movement.id,
      contraOut.numCta,
      `Las aplicaciones no igualan la partida del movimiento ${movement.id}. Diferencia: ${difference}.`
    );
    return false;
  }
  return true;
}

function polizaNumber(year: number, monthIndex: number, index: number): string {
  const month = String(monthIndex + 1).padStart(2, '0');
  return `P${year}${month}${String(index + 1).padStart(5, '0')}`;
}

export function buildAnexo24Polizas(input: Anexo24PolizaInput): Anexo24PolizaResult {
  const key = periodKey(input.year, input.monthIndex);
  const rfc = validRfc(input.organizationRfc);
  if (!rfc) {
    return blockedResult(key, ANEXO24_RFC_INVALID_REASON, [
      { transactionId: '', accountCode: '', reason: ANEXO24_RFC_INVALID_REASON },
    ], [], []);
  }

  const blocked: Anexo24Block[] = [];
  const notices: Anexo24Notice[] = [];
  const excluded: Anexo24Excluded[] = [];
  const built: Anexo24Poliza[] = [];

  for (const movement of input.movements) {
    const placed = inMonth(movement.fecha, input.year, input.monthIndex);
    if (placed === null) {
      if (movement.status === 'conciliado') {
        pushBlock(blocked, movement.id, '', 'Fecha inválida.');
      }
      continue;
    }
    if (!placed) continue;
    if (movement.status !== 'conciliado') {
      excluded.push({ transactionId: movement.id, reason: ANEXO24_NOT_CONCILIADO });
      continue;
    }

    const devengo = parseJournalEntry(movement.asiento_devengo);
    const liquidacion = parseJournalEntry(movement.asiento_liquidacion);
    if (devengo && liquidacion) {
      pushBlock(blocked, movement.id, '', ANEXO24_BOTH_ENTRIES_REASON);
      continue;
    }
    const entry = devengo ?? liquidacion;
    if (!entry) {
      pushBlock(blocked, movement.id, '', 'El movimiento conciliado no tiene un asiento que cuadre.');
      continue;
    }
    const moneda = String(movement.moneda ?? '').trim().toUpperCase();
    if (moneda && moneda !== 'MXN') {
      pushBlock(blocked, movement.id, '', 'Moneda distinta de MXN.');
      continue;
    }
    const tipo = tipoPoliza(entry);
    if (!tipo) {
      pushBlock(blocked, movement.id, '', 'No se pudo determinar el tipo de póliza.');
      continue;
    }
    const fecha = polizaFecha(entry.fecha);
    if (!fecha) {
      pushBlock(blocked, movement.id, '', 'Fecha inválida.');
      continue;
    }
    const before = blocked.length;
    const transacciones = buildLines(
      movement,
      entry,
      devengo ? 'devengo' : 'liquidacion',
      input.chart,
      input.movements,
      input.applications,
      blocked,
      notices
    );
    if (!transacciones || blocked.length > before) continue;

    built.push({
      tipo,
      numUnIdenPol: '',
      fecha,
      concepto: clipConcepto(entry.lines[0]?.concepto ?? movement.concepto ?? ''),
      transactionId: movement.id,
      transacciones,
    });
  }

  if (blocked.length > 0) {
    return blockedResult(key, ANEXO24_BLOCKED_HINT, blocked, notices, excluded);
  }
  if (built.length === 0) {
    return blockedResult(key, ANEXO24_NO_POLIZAS_REASON, [], notices, excluded);
  }

  const ordered = [...built].sort((left, right) => {
    const byDate = left.fecha.localeCompare(right.fecha);
    return byDate === 0 ? left.transactionId.localeCompare(right.transactionId) : byDate;
  });
  const polizas = ordered.map((poliza, index) => ({
    ...poliza,
    numUnIdenPol: polizaNumber(input.year, input.monthIndex, index),
  }));

  return {
    ok: true,
    rfc,
    year: input.year,
    monthIndex: input.monthIndex,
    tipoSolicitud: ANEXO24_TIPO_SOLICITUD,
    periodKey: key,
    polizas,
    blocked: [],
    notices,
    excluded,
  };
}
