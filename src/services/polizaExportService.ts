/**
 * Exportación póliza diario ContAI (E10.x MVP + E13.2 nómina).
 * Lógica pura: elegibilidad, partida doble, sanitize, balance, TXT.
 * Sin React / Firebase / DOM.
 */

import {
  DEFAULT_NOMINA_IMSS_ACCOUNT,
  DEFAULT_NOMINA_ISR_ACCOUNT,
  NOMINA_TOTAL_ARITH_TOLERANCE,
} from '../config/nominaDefaults';
import { roundMoney } from './taxCalculatorService';
import {
  POLIZA_CONCEPTO_MAX,
  POLIZA_CONTRA_CUENTA_DEFAULT,
  POLIZA_CUENTA_MAX,
  POLIZA_FIELD_SEP,
  type BuildPolizaDiarioParams,
  type PolizaExportResult,
  type PolizaLine,
  type PolizaSkipReason,
  type PolizaSkipped,
  type PolizaTxInput,
} from '../types/polizaExport';

export function sanitizePolizaField(raw: string, maxLen: number): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/;/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s.\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLen);
}

/** Alias explícito para cuentas contables en póliza (E13.2). */
export function sanitizePolizaCuenta(raw: string): string {
  return sanitizePolizaField(raw, POLIZA_CUENTA_MAX);
}

export type PolizaNominaLineOptions = {
  contraCuenta?: string;
  nominaIsrCuenta?: string;
  nominaImssCuenta?: string;
};

const NOMINA_PASIVOS_OMITIDOS_SUFFIX = '[nomina: pasivos omitidos]';

function hasNominaPasivoMetadata(tx: PolizaTxInput): boolean {
  const isr = roundMoney(Number(tx.nomina_isr_retained) || 0);
  const imss = roundMoney(Number(tx.nomina_imss_retained) || 0);
  const percepciones = tx.nomina_total_percepciones;
  const neto = roundMoney(Math.abs(Number(tx.monto) || 0));
  if (isr > 0 || imss > 0) return true;
  if (percepciones != null && Number.isFinite(percepciones)) {
    return roundMoney(percepciones) > neto;
  }
  return false;
}

function buildConceptoWithSuffix(tx: PolizaTxInput, suffix: string): string {
  const base = buildConcepto(tx);
  const cleanSuffix = sanitizePolizaField(suffix, POLIZA_CONCEPTO_MAX);
  const maxBase = Math.max(0, POLIZA_CONCEPTO_MAX - cleanSuffix.length - 1);
  const trimmedBase = base.length > maxBase ? base.slice(0, maxBase) : base;
  return sanitizePolizaField(`${trimmedBase} ${cleanSuffix}`, POLIZA_CONCEPTO_MAX);
}

function buildSimpleEgresoLines(
  tx: PolizaTxInput,
  amount: number,
  concepto: string,
  contraCuenta: string
): PolizaLine[] {
  const fecha = toFechaIsoDate(tx.fecha);
  const cuenta = sanitizePolizaCuenta(String(tx.account_name ?? ''));
  const contra = sanitizePolizaCuenta(contraCuenta);
  const txId = String(tx.id).slice(0, 40);
  return [
    {
      fecha,
      tipo: 'CARGO',
      cuenta,
      concepto,
      cargo: amount,
      abono: 0,
      txId,
    },
    {
      fecha,
      tipo: 'ABONO',
      cuenta: contra,
      concepto,
      cargo: 0,
      abono: amount,
      txId,
    },
  ];
}

/**
 * E13.2 — Asiento nómina: Cargo bruto + Abono ISR + Abono IMSS + Abono Bancos.
 * Orden fijo; omite pasivos en 0; fallback 2 líneas si faltan metadatos.
 */
export function buildNominaPolizaLinesForTx(
  tx: PolizaTxInput,
  opts: PolizaNominaLineOptions = {}
): PolizaLine[] {
  const contra = opts.contraCuenta?.trim() || POLIZA_CONTRA_CUENTA_DEFAULT;
  const isrCuenta = sanitizePolizaCuenta(
    opts.nominaIsrCuenta?.trim() || DEFAULT_NOMINA_ISR_ACCOUNT
  );
  const imssCuenta = sanitizePolizaCuenta(
    opts.nominaImssCuenta?.trim() || DEFAULT_NOMINA_IMSS_ACCOUNT
  );

  const neto = roundMoney(Math.abs(Number(tx.monto) || 0));
  const fecha = toFechaIsoDate(tx.fecha);
  const txId = String(tx.id).slice(0, 40);
  const gastoCuenta = sanitizePolizaCuenta(String(tx.account_name ?? ''));
  const bancoCuenta = sanitizePolizaCuenta(contra);

  if (!hasNominaPasivoMetadata(tx)) {
    const concepto = buildConceptoWithSuffix(tx, NOMINA_PASIVOS_OMITIDOS_SUFFIX);
    return buildSimpleEgresoLines(tx, neto, concepto, contra);
  }

  const isr = roundMoney(Number(tx.nomina_isr_retained) || 0);
  const imss = roundMoney(Number(tx.nomina_imss_retained) || 0);
  let bruto =
    tx.nomina_total_percepciones != null &&
    Number.isFinite(tx.nomina_total_percepciones)
      ? roundMoney(tx.nomina_total_percepciones)
      : roundMoney(neto + isr + imss);

  const expectedBruto = roundMoney(neto + isr + imss);
  if (Math.abs(bruto - expectedBruto) > NOMINA_TOTAL_ARITH_TOLERANCE) {
    bruto = expectedBruto;
  }

  const concepto = buildConcepto(tx);
  const lines: PolizaLine[] = [
    {
      fecha,
      tipo: 'CARGO',
      cuenta: gastoCuenta,
      concepto,
      cargo: bruto,
      abono: 0,
      txId,
    },
  ];

  if (isr > 0) {
    lines.push({
      fecha,
      tipo: 'ABONO',
      cuenta: isrCuenta,
      concepto,
      cargo: 0,
      abono: isr,
      txId,
    });
  }

  if (imss > 0) {
    lines.push({
      fecha,
      tipo: 'ABONO',
      cuenta: imssCuenta,
      concepto,
      cargo: 0,
      abono: imss,
      txId,
    });
  }

  lines.push({
    fecha,
    tipo: 'ABONO',
    cuenta: bancoCuenta,
    concepto,
    cargo: 0,
    abono: neto,
    txId,
  });

  return lines;
}

export function formatPolizaAmount(n: number): string {
  return roundMoney(n).toFixed(2);
}

export function isPolizaEligible(tx: PolizaTxInput): boolean {
  const hasAccount = Boolean(String(tx.account_name ?? '').trim());
  const bankOk =
    tx.bank_reconciled === true || tx.bank_reconcile_status === 'full';
  return hasAccount && bankOk;
}

export function countPolizaEligible(
  transactions: ReadonlyArray<PolizaTxInput>
): number {
  let n = 0;
  for (const tx of transactions) {
    if (isPolizaEligible(tx) && isKnownTipo(tx.tipo) && isValidMonto(tx.monto)) {
      n += 1;
    }
  }
  return n;
}

function isKnownTipo(tipo: string): boolean {
  const t = String(tipo || '').toLowerCase();
  return t === 'ingreso' || t === 'egreso';
}

function isValidMonto(monto: number | string): boolean {
  const n = typeof monto === 'number' ? monto : Number(monto);
  return Number.isFinite(n) && Math.abs(n) > 0;
}

function toFechaIsoDate(fecha: string | Date): string {
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return fecha.toISOString().slice(0, 10);
  }
  const s = String(fecha);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '0000-00-00';
}

function buildConcepto(tx: PolizaTxInput): string {
  const parts = [tx.proveedor, tx.concepto]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean);
  const raw = parts.join(' - ') || 'Sin concepto';
  return sanitizePolizaField(raw, POLIZA_CONCEPTO_MAX);
}

function skipReason(tx: PolizaTxInput): PolizaSkipReason {
  if (!String(tx.account_name ?? '').trim()) return 'sin_cuenta';
  if (!(tx.bank_reconciled === true || tx.bank_reconcile_status === 'full')) {
    return 'sin_conciliacion_bancaria';
  }
  if (!isKnownTipo(tx.tipo)) return 'tipo_desconocido';
  return 'monto_invalido';
}

/**
 * Genera 2 líneas (cargo/abono) para una TX elegible.
 * egreso: Cargo=cuenta, Abono=Bancos
 * ingreso: Cargo=Bancos, Abono=cuenta
 */
export function buildPolizaLinesForTx(
  tx: PolizaTxInput,
  contraCuenta: string = POLIZA_CONTRA_CUENTA_DEFAULT,
  nominaOpts?: Pick<PolizaNominaLineOptions, 'nominaIsrCuenta' | 'nominaImssCuenta'>
): PolizaLine[] {
  const tipo = String(tx.tipo).toLowerCase();

  if (tx.is_nomina === true && tipo === 'egreso') {
    return buildNominaPolizaLinesForTx(tx, {
      contraCuenta,
      nominaIsrCuenta: nominaOpts?.nominaIsrCuenta,
      nominaImssCuenta: nominaOpts?.nominaImssCuenta,
    });
  }

  const amount = roundMoney(Math.abs(Number(tx.monto) || 0));
  const fecha = toFechaIsoDate(tx.fecha);
  const concepto = buildConcepto(tx);
  const cuenta = sanitizePolizaCuenta(String(tx.account_name ?? ''));
  const contra = sanitizePolizaCuenta(contraCuenta);
  const txId = String(tx.id).slice(0, 40);

  if (tipo === 'egreso') {
    return buildSimpleEgresoLines(tx, amount, concepto, contraCuenta);
  }

  // ingreso
  return [
    {
      fecha,
      tipo: 'CARGO',
      cuenta: contra,
      concepto,
      cargo: amount,
      abono: 0,
      txId,
    },
    {
      fecha,
      tipo: 'ABONO',
      cuenta,
      concepto,
      cargo: 0,
      abono: amount,
      txId,
    },
  ];
}

function escapeCell(value: string): string {
  return value.replace(/;/g, ' ').replace(/[\r\n]+/g, ' ');
}

export function computePolizaTotals(lines: ReadonlyArray<PolizaLine>): {
  totalCargos: number;
  totalAbonos: number;
  balanced: boolean;
} {
  let totalCargos = 0;
  let totalAbonos = 0;
  for (const l of lines) {
    totalCargos = roundMoney(totalCargos + l.cargo);
    totalAbonos = roundMoney(totalAbonos + l.abono);
  }
  return {
    totalCargos,
    totalAbonos,
    balanced: totalCargos === totalAbonos,
  };
}

export function linesToPolizaTxt(
  lines: ReadonlyArray<PolizaLine>,
  meta: {
    organizationId: string;
    periodKey: string;
    generatedAt: Date;
    eligibleCount: number;
    skippedCount: number;
  }
): string {
  const iso = meta.generatedAt.toISOString();
  const header = [
    '# ContAI Poliza Diario',
    `# org=${escapeCell(meta.organizationId)}`,
    `# periodo=${escapeCell(meta.periodKey)}`,
    `# generado=${iso}`,
    `# elegibles=${meta.eligibleCount};omitidas=${meta.skippedCount}`,
    ['Fecha', 'Tipo', 'Cuenta', 'Concepto', 'Cargo', 'Abono', 'TxId'].join(
      POLIZA_FIELD_SEP
    ),
  ];

  const rows = lines.map((l) =>
    [
      l.fecha,
      l.tipo,
      escapeCell(l.cuenta),
      escapeCell(l.concepto),
      formatPolizaAmount(l.cargo),
      formatPolizaAmount(l.abono),
      escapeCell(l.txId),
    ].join(POLIZA_FIELD_SEP)
  );

  return [...header, ...rows].join('\r\n') + '\r\n';
}

export function buildPolizaDiarioTxt(
  params: BuildPolizaDiarioParams
): PolizaExportResult {
  const contra =
    params.contraCuenta?.trim() || POLIZA_CONTRA_CUENTA_DEFAULT;
  const nominaOpts: Pick<
    PolizaNominaLineOptions,
    'nominaIsrCuenta' | 'nominaImssCuenta'
  > = {
    nominaIsrCuenta: params.nominaIsrCuenta,
    nominaImssCuenta: params.nominaImssCuenta,
  };
  const skipped: PolizaSkipped[] = [];
  const lines: PolizaLine[] = [];
  let exportedTxCount = 0;

  for (const tx of params.transactions) {
    if (!isPolizaEligible(tx) || !isKnownTipo(tx.tipo) || !isValidMonto(tx.monto)) {
      skipped.push({ id: String(tx.id), reason: skipReason(tx) });
      continue;
    }
    lines.push(...buildPolizaLinesForTx(tx, contra, nominaOpts));
    exportedTxCount += 1;
  }

  const eligibleCount = exportedTxCount;

  if (eligibleCount === 0) {
    return {
      ok: false,
      reason:
        'No hay transacciones conciliadas y clasificadas en este periodo para exportar',
      eligibleCount: 0,
      skipped,
    };
  }

  const { totalCargos, totalAbonos, balanced } = computePolizaTotals(lines);

  if (!balanced) {
    return {
      ok: false,
      reason: 'Desequilibrio en la póliza',
      eligibleCount,
      skipped,
    };
  }

  const generatedAt = params.generatedAt ?? new Date();
  const fileName = `poliza_ContAI_${params.periodKey}.txt`;
  const text = linesToPolizaTxt(lines, {
    organizationId: params.organizationId,
    periodKey: params.periodKey,
    generatedAt,
    eligibleCount,
    skippedCount: skipped.length,
  });

  return {
    ok: true,
    text,
    lines,
    eligibleCount,
    skipped,
    totalCargos,
    totalAbonos,
    fileName,
  };
}
