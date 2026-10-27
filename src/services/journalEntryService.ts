/**
 * Asiento de devengo (E16). Puro: sin Firebase ni React.
 */

import {
  ACCRUAL_BANCOS_CODE,
  ACCRUAL_CLIENTES_CODE,
  ACCRUAL_IVA_ACREDITABLE_CODE,
  ACCRUAL_IVA_TRASLADADO_CODE,
  ACCRUAL_PROVEEDORES_CODE,
} from '../config/chartOfAccounts';
import type { CatalogAccount } from '../types/chartOfAccounts';
import {
  ATAJO_PUE_CONCEPTO,
  type AccrualResult,
  type JournalEntry,
  type JournalLine,
} from '../types/journalEntry';
import { POLIZA_CONCEPTO_MAX } from '../types/polizaExport';
import { roundMoney } from '../types/paymentApplication';

export type AccrualDraft = {
  id: string;
  tipo: string;
  monto: number;
  fecha: string | Date;
  fiscal_subtotal?: number;
  fiscal_iva?: number;
  account_code?: string;
  metodo_pago_sat?: string;
  concepto?: string | null;
  proveedor?: string | null;
  is_nomina?: boolean;
};

const MISSING_FISCAL = 'Faltan el subtotal y el IVA del comprobante.';
const UNBALANCED = 'El subtotal más el IVA no iguala el total.';
const MISSING_ACCOUNT = 'Falta el código de la cuenta del movimiento.';
const NOMINA_EXCLUDED = 'La nómina no entra a la póliza de devengo.';

function inactiveAccount(code: string): string {
  return `La cuenta ${code} no está activa en el catálogo.`;
}

function activeAccount(
  chart: readonly CatalogAccount[],
  code: string
): CatalogAccount | undefined {
  return chart.find((account) => account.activa && account.code === code);
}

function fechaIso(fecha: string | Date): string {
  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    return fecha.toISOString().slice(0, 10);
  }
  const text = String(fecha);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '0000-00-00';
}

function conceptoMovimiento(draft: AccrualDraft): string {
  const parts = [draft.proveedor, draft.concepto]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  const raw = parts.join(' - ') || 'Sin concepto';
  return raw.replace(/;/g, ' ').replace(/[\r\n]+/g, ' ').slice(0, POLIZA_CONCEPTO_MAX);
}

function line(
  account: CatalogAccount,
  tipo: JournalLine['tipo'],
  monto: number,
  concepto: string
): JournalLine {
  return {
    account_code: account.code,
    account_name: account.name,
    tipo,
    monto,
    concepto,
  };
}

export function journalEntryBalances(entry: JournalEntry): boolean {
  let cargos = 0;
  let abonos = 0;
  for (const item of entry.lines) {
    if (!Number.isFinite(item.monto) || item.monto < 0) return false;
    if (item.tipo === 'cargo') cargos = roundMoney(cargos + item.monto);
    else abonos = roundMoney(abonos + item.monto);
  }
  return entry.lines.length >= 2 && cargos > 0 && cargos === abonos;
}

export function buildAccrualJournalEntry(
  draft: AccrualDraft,
  chart: readonly CatalogAccount[],
  atajoPueBancos: boolean
): AccrualResult {
  if (draft.is_nomina === true) return { ok: false, reason: NOMINA_EXCLUDED };
  const tipo = String(draft.tipo || '').toLowerCase();
  if (tipo !== 'ingreso' && tipo !== 'egreso') {
    return { ok: false, reason: 'El movimiento no es ingreso ni egreso.' };
  }
  const subtotal = draft.fiscal_subtotal;
  const iva = draft.fiscal_iva;
  if (typeof subtotal !== 'number' || typeof iva !== 'number' || !Number.isFinite(subtotal) || !Number.isFinite(iva)) {
    return { ok: false, reason: MISSING_FISCAL };
  }
  const total = roundMoney(Math.abs(Number(draft.monto) || 0));
  const base = roundMoney(subtotal);
  const tax = roundMoney(iva);
  if (total <= 0 || base < 0 || tax < 0) {
    return { ok: false, reason: UNBALANCED };
  }
  if (roundMoney(base + tax) !== total) {
    return { ok: false, reason: UNBALANCED };
  }
  const accountCode = String(draft.account_code ?? '').trim();
  if (!accountCode) return { ok: false, reason: MISSING_ACCOUNT };
  const movement = activeAccount(chart, accountCode);
  if (!movement) return { ok: false, reason: inactiveAccount(accountCode) };

  const atajo =
    atajoPueBancos === true &&
    String(draft.metodo_pago_sat ?? '').trim().toUpperCase() === 'PUE';
  const contraCode = atajo
    ? ACCRUAL_BANCOS_CODE
    : tipo === 'ingreso'
      ? ACCRUAL_CLIENTES_CODE
      : ACCRUAL_PROVEEDORES_CODE;
  const contra = activeAccount(chart, contraCode);
  if (!contra) return { ok: false, reason: inactiveAccount(contraCode) };

  const ivaCode = tipo === 'ingreso' ? ACCRUAL_IVA_TRASLADADO_CODE : ACCRUAL_IVA_ACREDITABLE_CODE;
  const ivaAccount = tax > 0 ? activeAccount(chart, ivaCode) : undefined;
  if (tax > 0 && !ivaAccount) return { ok: false, reason: inactiveAccount(ivaCode) };

  const concepto = conceptoMovimiento(draft);
  const contraConcepto = atajo ? ATAJO_PUE_CONCEPTO : concepto;
  const lines: JournalLine[] = [];
  if (tipo === 'ingreso') {
    lines.push(line(contra, 'cargo', total, contraConcepto));
    lines.push(line(movement, 'abono', base, concepto));
    if (ivaAccount && tax > 0) lines.push(line(ivaAccount, 'abono', tax, concepto));
  } else {
    lines.push(line(movement, 'cargo', base, concepto));
    if (ivaAccount && tax > 0) lines.push(line(ivaAccount, 'cargo', tax, concepto));
    lines.push(line(contra, 'abono', total, contraConcepto));
  }

  const entry: JournalEntry = {
    transaction_id: String(draft.id),
    tipo,
    fecha: fechaIso(draft.fecha),
    atajo_pue_bancos: atajo,
    lines,
  };
  if (!journalEntryBalances(entry)) {
    return { ok: false, reason: UNBALANCED };
  }
  return { ok: true, entry };
}

export function accrualPersistence(
  result: AccrualResult,
  proposedStatus: 'revisión' | 'conciliado',
  proposedReason: string | null
): {
  status: 'revisión' | 'conciliado';
  asiento_devengo?: JournalEntry;
  policy_review_reason: string | null;
} {
  if (result.ok === false) {
    return {
      status: 'revisión',
      policy_review_reason: proposedReason
        ? `${proposedReason} · ${result.reason}`
        : result.reason,
    };
  }
  return {
    status: proposedStatus,
    asiento_devengo: result.entry,
    policy_review_reason: proposedReason,
  };
}

export function countStoredAccruals(
  rows: readonly { asiento_devengo?: unknown }[]
): number {
  return rows.filter((row) => parseJournalEntry(row.asiento_devengo)).length;
}

export function parseJournalEntry(raw: unknown): JournalEntry | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  if (row.tipo !== 'ingreso' && row.tipo !== 'egreso') return undefined;
  if (typeof row.transaction_id !== 'string' || typeof row.fecha !== 'string') return undefined;
  if (!Array.isArray(row.lines)) return undefined;
  const lines: JournalLine[] = [];
  for (const item of row.lines) {
    if (!item || typeof item !== 'object') return undefined;
    const lineRow = item as Record<string, unknown>;
    if (lineRow.tipo !== 'cargo' && lineRow.tipo !== 'abono') return undefined;
    if (typeof lineRow.account_code !== 'string' || typeof lineRow.account_name !== 'string') {
      return undefined;
    }
    if (typeof lineRow.monto !== 'number' || typeof lineRow.concepto !== 'string') return undefined;
    lines.push({
      account_code: lineRow.account_code,
      account_name: lineRow.account_name,
      tipo: lineRow.tipo,
      monto: lineRow.monto,
      concepto: lineRow.concepto,
    });
  }
  const entry: JournalEntry = {
    transaction_id: row.transaction_id,
    tipo: row.tipo,
    fecha: row.fecha,
    atajo_pue_bancos: row.atajo_pue_bancos === true,
    lines,
  };
  return journalEntryBalances(entry) ? entry : undefined;
}

function escapeCell(value: string): string {
  return value.replace(/;/g, ' ').replace(/[\r\n]+/g, ' ');
}

export function formatAccrualJournalToTxt(
  entries: readonly JournalEntry[],
  meta: {
    organizationId: string;
    periodKey: string;
    generatedAt: Date;
    eligibleCount: number;
    skippedCount: number;
  }
): string {
  const header = [
    '# ContAI Poliza Diario',
    '# tipo=devengo',
    `# org=${escapeCell(meta.organizationId)}`,
    `# periodo=${escapeCell(meta.periodKey)}`,
    `# generado=${meta.generatedAt.toISOString()}`,
    `# elegibles=${meta.eligibleCount};omitidas=${meta.skippedCount}`,
    ['Fecha', 'Tipo', 'Cuenta', 'Concepto', 'Cargo', 'Abono', 'TxId'].join(';'),
  ];
  const rows: string[] = [];
  for (const entry of entries) {
    for (const item of entry.lines) {
      const cargo = item.tipo === 'cargo' ? item.monto : 0;
      const abono = item.tipo === 'abono' ? item.monto : 0;
      rows.push(
        [
          entry.fecha,
          item.tipo === 'cargo' ? 'CARGO' : 'ABONO',
          escapeCell(item.account_code),
          escapeCell(item.concepto),
          roundMoney(cargo).toFixed(2),
          roundMoney(abono).toFixed(2),
          escapeCell(entry.transaction_id.slice(0, 40)),
        ].join(';')
      );
    }
  }
  return [...header, ...rows].join('\r\n') + '\r\n';
}
