/**
 * Exportación póliza diario ContAI (E10.x MVP).
 * Lógica pura: elegibilidad, partida doble, sanitize, balance, TXT.
 * Sin React / Firebase / DOM.
 */

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
  contraCuenta: string = POLIZA_CONTRA_CUENTA_DEFAULT
): PolizaLine[] {
  const amount = roundMoney(Math.abs(Number(tx.monto) || 0));
  const fecha = toFechaIsoDate(tx.fecha);
  const concepto = buildConcepto(tx);
  const cuenta = sanitizePolizaField(
    String(tx.account_name ?? ''),
    POLIZA_CUENTA_MAX
  );
  const contra = sanitizePolizaField(contraCuenta, POLIZA_CUENTA_MAX);
  const txId = String(tx.id).slice(0, 40);
  const tipo = String(tx.tipo).toLowerCase();

  if (tipo === 'egreso') {
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
  const skipped: PolizaSkipped[] = [];
  const lines: PolizaLine[] = [];

  for (const tx of params.transactions) {
    if (!isPolizaEligible(tx) || !isKnownTipo(tx.tipo) || !isValidMonto(tx.monto)) {
      skipped.push({ id: String(tx.id), reason: skipReason(tx) });
      continue;
    }
    lines.push(...buildPolizaLinesForTx(tx, contra));
  }

  const eligibleCount = lines.length / 2;

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
