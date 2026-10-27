/**
 * Publica la auditoría del devengo. El asiento lo calcula journalEntryService.
 */

import {
  DEFAULT_NOMINA_ACCOUNT_CODE,
  DEFAULT_NOMINA_ACCOUNT_NAME,
  NOMINA_ACCOUNT_SOURCE,
} from '../config/nominaDefaults';
import type { CatalogAccount } from '../types/chartOfAccounts';
import type { NominaExtracted } from '../types/nominaImport';
import { logAuditEntry } from './auditService';
import { AUDIT_POLIZA_DEVENGO_GENERADA, ATAJO_PUE_CONCEPTO } from '../types/journalEntry';
import type { JournalEntry } from '../types/journalEntry';
import { commitTransactionUpdatesBatch, createTransaction } from './firestoreService';
import {
  accrualPersistence,
  buildAccrualJournalEntry,
  type AccrualDraft,
} from './journalEntryService';

export async function auditPolizaDevengo(params: {
  organizationId: string;
  entry: JournalEntry;
  subtotal: number;
  iva: number;
  total: number;
  isNomina?: boolean;
}): Promise<void> {
  await logAuditEntry(AUDIT_POLIZA_DEVENGO_GENERADA, 'transactions', {
    organization_id: params.organizationId,
    transaction_id: params.entry.transaction_id,
    account_codes: params.entry.lines.map((line) => line.account_code),
    subtotal: params.subtotal,
    iva: params.iva,
    total: params.total,
    atajo_pue_bancos: params.entry.atajo_pue_bancos,
    ...(params.entry.atajo_pue_bancos ? { nota: ATAJO_PUE_CONCEPTO } : {}),
    ...(params.isNomina ? { is_nomina: true } : {}),
  });
}

export async function postClassifiedAccrual(params: {
  organizationId: string;
  draft: AccrualDraft;
  chart: readonly CatalogAccount[];
  atajoPueBancos: boolean;
  proposedStatus: 'revisión' | 'conciliado';
  proposedReason: string | null;
  subtotal: number;
  iva: number;
  total: number;
}): Promise<ReturnType<typeof accrualPersistence>> {
  const result = buildAccrualJournalEntry(params.draft, params.chart, params.atajoPueBancos);
  const persisted = accrualPersistence(result, params.proposedStatus, params.proposedReason);
  if (result.ok) {
    await auditPolizaDevengo({
      organizationId: params.organizationId,
      entry: result.entry,
      subtotal: params.subtotal,
      iva: params.iva,
      total: params.total,
      isNomina: params.draft.is_nomina === true,
    });
  }
  return persisted;
}

export async function createImportedNomina(input: {
  organizationId: string;
  userId: string;
  preview: NominaExtracted;
  fechaIso: string;
  chart: readonly CatalogAccount[];
}): Promise<void> {
  const n = input.preview;
  const empleadoLabel = n.empleadoNombre.trim() || n.empleadoRfc || 'Empleado';
  const concepto = `Nómina · ${empleadoLabel}${n.fechaPago ? ` · ${n.fechaPago}` : ''}`;
  const created = await createTransaction({
    organization_id: input.organizationId,
    usuario_id: input.userId,
    tipo: 'egreso',
    monto: n.total,
    moneda: n.moneda || 'MXN',
    concepto,
    proveedor: empleadoLabel,
    fecha: input.fechaIso,
    status: 'conciliado',
    account_name: DEFAULT_NOMINA_ACCOUNT_NAME,
    account_code: DEFAULT_NOMINA_ACCOUNT_CODE,
    account_source: NOMINA_ACCOUNT_SOURCE,
    tags: ['nomina'],
    iva_tasa: 'na',
    egreso_acredita_iva: false,
    deducible: false,
    fiscal_subtotal: n.subtotal,
    fiscal_iva: 0,
    rfc_contraparte: n.empleadoRfc || undefined,
    cfdi_uuid: n.cfdiUuid || undefined,
    importado_cfdi: true,
    cfdi_tipo_comprobante: 'N',
    is_nomina: true,
    nomina_isr_retained: n.isrRetenido,
    nomina_imss_retained: n.imssRetenido,
    nomina_total_percepciones: n.totalPercepciones,
    nomina_total_deducciones: n.totalDeducciones,
  });
  const persisted = await postClassifiedAccrual({
    organizationId: input.organizationId,
    draft: {
      id: created.id,
      tipo: 'egreso',
      monto: n.total,
      fecha: input.fechaIso,
      is_nomina: true,
      nomina: {
        total_percepciones: n.totalPercepciones,
        isr_retained: n.isrRetenido,
        imss_retained: n.imssRetenido,
      },
    },
    chart: input.chart,
    atajoPueBancos: false,
    proposedStatus: 'conciliado',
    proposedReason: null,
    subtotal: n.totalPercepciones,
    iva: 0,
    total: n.total,
  });
  await commitTransactionUpdatesBatch([
    {
      id: created.id,
      payload: {
        status: persisted.status,
        policy_review_reason: persisted.policy_review_reason,
        ...(persisted.asiento_devengo ? { asiento_devengo: persisted.asiento_devengo } : {}),
      },
    },
  ]);
  await logAuditEntry('NOMINA_IMPORTED', 'transactions', {
    id: created.id,
    uuid: n.cfdiUuid,
    monto: n.total,
    nomina_isr_retained: n.isrRetenido,
    nomina_imss_retained: n.imssRetenido,
  });
}
