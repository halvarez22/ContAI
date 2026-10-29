/**
 * Reconstruye asientos faltantes del periodo abierto.
 * No arma líneas: el devengo lo publica postClassifiedAccrual.
 */

import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import type { AccountMappingRule, CatalogAccount } from '../types/chartOfAccounts';
import { TRIAL_BALANCE_TRUNCATED_HINT } from '../types/financialReports';
import type { JournalEntry } from '../types/journalEntry';
import type {
  HistoricalReconstructionDraft,
  MissingJournalPatch,
  MissingJournalPlan,
} from '../types/missingJournal';
import type { TransactionDoc } from '../types/transaction';
import * as accountMapping from './accountMappingService';
import type { ClassifyAccountFn } from './accountMappingService';
import * as accrualPosting from './accrualPostingService';
import { logAuditEntry } from './auditService';
import {
  journalEntryBalances,
  parseJournalEntry,
  type AccrualDraft,
} from './journalEntryService';

export const MISSING_JOURNAL_TIPO_P =
  'No se puede reconstruir la liquidación: el complemento de pago no está guardado';
export const MISSING_JOURNAL_ACCOUNT = 'Falta clasificación de cuenta válida';
export const MISSING_JOURNAL_CLOSED = 'Periodo cerrado';

const MISSING_FISCAL = 'Faltan el subtotal y el IVA del comprobante.';

export type ReconstructOptions = {
  organizationId: string;
  periodosCerrados: readonly string[];
  accounts: readonly CatalogAccount[];
  rules: readonly AccountMappingRule[];
  atajoPueBancos: boolean;
  classify: ClassifyAccountFn;
};

type ReadyAccount = { code: string; name: string; source: string };

type OneResult =
  | { kind: 'omitted' }
  | { kind: 'closed'; notice: string }
  | { kind: 'review'; id: string; reason: string; notice: string }
  | { kind: 'ready'; id: string; entry: JournalEntry; account?: ReadyAccount };

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function storedEntryBalances(raw: unknown): boolean {
  const entry = parseJournalEntry(raw);
  return entry !== undefined && journalEntryBalances(entry);
}

export function movementLabel(fecha: string, concepto: string): string {
  const parsed = new Date(fecha);
  const when = Number.isNaN(parsed.getTime())
    ? fecha
    : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(parsed);
  const name = concepto.trim() || 'Sin concepto';
  return `${when} · ${name}`;
}

function noticeFor(draft: HistoricalReconstructionDraft, reason: string): string {
  return `${movementLabel(draft.fecha, draft.concepto)}: ${reason}`;
}

export function toHistoricalReconstructionDraft(
  tx: TransactionDoc
): HistoricalReconstructionDraft | null {
  const id = typeof tx.id === 'string' ? tx.id.trim() : '';
  if (!id) return null;
  if (tx.tipo !== 'ingreso' && tx.tipo !== 'egreso') return null;
  if (typeof tx.fecha !== 'string' || tx.fecha.trim() === '') return null;
  if (typeof tx.monto !== 'number' || !Number.isFinite(tx.monto)) return null;
  const code = typeof tx.account_code === 'string' ? tx.account_code.trim() : '';
  return {
    id,
    fecha: tx.fecha,
    tipo: tx.tipo,
    monto: tx.monto,
    concepto: typeof tx.concepto === 'string' ? tx.concepto : '',
    proveedor: typeof tx.proveedor === 'string' ? tx.proveedor : '',
    moneda: typeof tx.moneda === 'string' && tx.moneda.trim() ? tx.moneda : 'MXN',
    fiscal_subtotal: finiteOrNull(tx.fiscal_subtotal),
    fiscal_iva: finiteOrNull(tx.fiscal_iva),
    is_nomina: tx.is_nomina === true,
    total_percepciones: finiteOrNull(tx.nomina_total_percepciones),
    isr_retained: finiteOrNull(tx.nomina_isr_retained),
    imss_retained: finiteOrNull(tx.nomina_imss_retained),
    cfdi_tipo_comprobante: tx.cfdi_tipo_comprobante,
    account_code: code || null,
    account_name:
      typeof tx.account_name === 'string' && tx.account_name.trim() ? tx.account_name : null,
    metodo_pago_sat: tx.metodo_pago_sat,
    asiento_devengo: tx.asiento_devengo,
    asiento_liquidacion: tx.asiento_liquidacion,
  };
}

function toAccrualDraft(
  draft: HistoricalReconstructionDraft,
  accountCode: string
): AccrualDraft {
  const percepciones = draft.total_percepciones;
  const isr = draft.isr_retained;
  const imss = draft.imss_retained;
  const nominaReady =
    draft.is_nomina && percepciones !== null && isr !== null && imss !== null;
  return {
    id: draft.id,
    tipo: draft.tipo,
    monto: draft.monto,
    fecha: draft.fecha,
    fiscal_subtotal: draft.fiscal_subtotal ?? undefined,
    fiscal_iva: draft.fiscal_iva ?? undefined,
    account_code: accountCode,
    metodo_pago_sat: draft.metodo_pago_sat,
    concepto: draft.concepto,
    proveedor: draft.proveedor,
    is_nomina: draft.is_nomina,
    ...(nominaReady
      ? {
          nomina: {
            total_percepciones: percepciones,
            isr_retained: isr,
            imss_retained: imss,
          },
        }
      : {}),
  };
}

function review(draft: HistoricalReconstructionDraft, reason: string): OneResult {
  return {
    kind: 'review',
    id: draft.id,
    reason,
    notice: noticeFor(draft, reason),
  };
}

async function postReady(
  draft: HistoricalReconstructionDraft,
  accountCode: string,
  options: ReconstructOptions,
  account?: ReadyAccount
): Promise<OneResult> {
  const persisted = await accrualPosting.postClassifiedAccrual({
    organizationId: options.organizationId,
    draft: toAccrualDraft(draft, accountCode),
    chart: options.accounts,
    atajoPueBancos: options.atajoPueBancos,
    proposedStatus: 'conciliado',
    proposedReason: null,
    subtotal: draft.is_nomina ? (draft.total_percepciones ?? 0) : (draft.fiscal_subtotal ?? 0),
    iva: draft.is_nomina ? 0 : (draft.fiscal_iva ?? 0),
    total: draft.monto,
  });
  if (persisted.asiento_devengo) {
    return { kind: 'ready', id: draft.id, entry: persisted.asiento_devengo, account };
  }
  return review(draft, persisted.policy_review_reason ?? 'No se pudo armar el asiento.');
}

async function reconstructOne(
  draft: HistoricalReconstructionDraft,
  options: ReconstructOptions
): Promise<OneResult> {
  if (
    storedEntryBalances(draft.asiento_devengo) ||
    storedEntryBalances(draft.asiento_liquidacion)
  ) {
    return { kind: 'omitted' };
  }
  if (isTransactionDateInClosedPeriod(draft.fecha, [...options.periodosCerrados])) {
    return { kind: 'closed', notice: noticeFor(draft, MISSING_JOURNAL_CLOSED) };
  }
  if (String(draft.cfdi_tipo_comprobante ?? '').toUpperCase() === 'P') {
    return review(draft, MISSING_JOURNAL_TIPO_P);
  }
  if (draft.is_nomina) {
    return postReady(draft, draft.account_code ?? '', options);
  }
  if (draft.fiscal_subtotal === null || draft.fiscal_iva === null) {
    return review(draft, MISSING_FISCAL);
  }

  let accountCode = draft.account_code;
  let account: ReadyAccount | undefined;
  if (!accountCode) {
    const assignment = await accountMapping.decideAccount(
      {
        tipo: draft.tipo,
        monto: draft.monto,
        concepto: draft.concepto,
        proveedor: draft.proveedor,
        fecha: draft.fecha,
        moneda: draft.moneda,
      },
      options.accounts,
      options.rules,
      options.classify
    );
    if (
      assignment.account_source === 'manual_fallback' ||
      assignment.requires_human_approval
    ) {
      return review(draft, MISSING_JOURNAL_ACCOUNT);
    }
    accountCode = assignment.account_code;
    account = {
      code: assignment.account_code,
      name: assignment.account_name,
      source: assignment.account_source,
    };
  }
  return postReady(draft, accountCode, options, account);
}

export async function reconstructMissingJournals(
  drafts: readonly HistoricalReconstructionDraft[],
  options: ReconstructOptions
): Promise<MissingJournalPlan> {
  const updates: MissingJournalPatch[] = [];
  const notices: string[] = [];
  const reasons: string[] = [];
  let generated = 0;
  let review = 0;
  let omitted = 0;

  for (const draft of drafts) {
    const one = await reconstructOne(draft, options);
    if (one.kind === 'omitted') {
      omitted += 1;
      continue;
    }
    if (one.kind === 'closed') {
      notices.push(one.notice);
      continue;
    }
    if (one.kind === 'review') {
      review += 1;
      reasons.push(one.reason);
      notices.push(one.notice);
      updates.push({
        id: one.id,
        payload: { status: 'revisión', policy_review_reason: one.notice },
      });
      continue;
    }
    generated += 1;
    updates.push({
      id: one.id,
      payload: {
        asiento_devengo: one.entry,
        ...(one.account
          ? {
              account_code: one.account.code,
              account_name: one.account.name,
              account_source: one.account.source,
            }
          : {}),
      },
    });
  }

  return { updates, generated, review, omitted, notices, reasons };
}

export function formatMissingJournalResult(
  plan: Pick<MissingJournalPlan, 'generated' | 'review' | 'omitted' | 'notices'>,
  truncated: boolean
): string {
  const generatedLabel =
    plan.generated === 1 ? 'Se generó 1 asiento.' : `Se generaron ${plan.generated} asientos.`;
  const reviewLabel =
    plan.review === 1 ? '1 quedó en revisión.' : `${plan.review} quedaron en revisión.`;
  const omittedLabel =
    plan.omitted === 1
      ? '1 ya tenía asiento y no se modificó.'
      : plan.omitted > 1
        ? `${plan.omitted} ya tenían asiento y no se modificaron.`
        : '';
  return [truncated ? TRIAL_BALANCE_TRUNCATED_HINT : '', generatedLabel, reviewLabel, omittedLabel, ...plan.notices.slice(0, 8)]
    .filter((line) => line !== '')
    .join('\n');
}

export async function recordMissingJournalRun(summary: {
  organizationId: string;
  periodKey: string;
  generated: number;
  review: number;
  omitted: number;
}): Promise<void> {
  await logAuditEntry('ASIENTOS_FALTANTES_GENERADOS', 'transactions', {
    organization_id: summary.organizationId,
    periodo: summary.periodKey,
    generados: summary.generated,
    revision: summary.review,
    omitidos: summary.omitted,
  });
}
