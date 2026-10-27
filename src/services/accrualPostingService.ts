/**
 * Publica la auditoría del devengo. El asiento lo calcula journalEntryService.
 */

import { activeSeedAccount } from '../config/chartOfAccounts';
import {
  DEFAULT_NOMINA_ACCOUNT_CODE,
  DEFAULT_NOMINA_ACCOUNT_NAME,
  NOMINA_ACCOUNT_SOURCE,
} from '../config/nominaDefaults';
import type { PagoExtracted } from '../lib/cfdiPagosParser';
import { parseCfdiWithSatExtensions } from '../lib/cfdiPagosParser';
import type { CatalogAccount } from '../types/chartOfAccounts';
import type { NominaExtracted } from '../types/nominaImport';
import { logAuditEntry } from './auditService';
import {
  AUDIT_ASIENTO_LIQUIDACION_GENERADO,
  AUDIT_POLIZA_DEVENGO_GENERADA,
  ATAJO_PUE_CONCEPTO,
} from '../types/journalEntry';
import type { JournalEntry, LiquidationDraft } from '../types/journalEntry';
import {
  evaluateTipoPLiquidacion,
  processTipoPPaymentImport,
  sumTipoPPaymentAmount,
  type TipoPLiquidacionEvaluation,
} from './cfdiPaymentImportService';
import { createFirestorePaymentImportStore } from './cfdiPaymentImportStore';
import { commitTransactionUpdatesBatch, createTransaction, serverTimestamp } from './firestoreService';
import {
  accrualPersistence,
  buildAccrualJournalEntry,
  buildPaymentApplicationEntry,
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

export type LiquidationPatch = {
  status: 'conciliado' | 'revisión';
  policy_review_reason: string | null;
  asiento_liquidacion?: JournalEntry;
  account_code?: string;
  account_name?: string;
};

export async function postLiquidacion(params: {
  organizationId: string;
  draft: LiquidationDraft;
  chart: readonly CatalogAccount[];
}): Promise<LiquidationPatch> {
  const result = buildPaymentApplicationEntry(params.draft, params.chart);
  if (result.ok === false) {
    return { status: 'revisión', policy_review_reason: result.reason };
  }
  const contra = result.entry.lines.find((item) => item.account_code === params.draft.account_code);
  await logAuditEntry(AUDIT_ASIENTO_LIQUIDACION_GENERADO, 'transactions', {
    organization_id: params.organizationId,
    transaction_id: result.entry.transaction_id,
    monto: params.draft.monto_total,
    cuenta_contraparte: params.draft.account_code,
  });
  return {
    status: 'conciliado',
    policy_review_reason: null,
    asiento_liquidacion: result.entry,
    account_code: params.draft.account_code,
    account_name: contra?.account_name,
  };
}

export async function liquidationPatchForTipoP(input: {
  organizationId: string;
  documentId: string;
  fecha: string;
  organizationRfc: string;
  emisorRfc: string;
  receptorRfc: string;
  pagos: readonly PagoExtracted[];
  chart: readonly CatalogAccount[];
}): Promise<LiquidationPatch> {
  const evaluated: TipoPLiquidacionEvaluation = evaluateTipoPLiquidacion({
    orgRfc: input.organizationRfc,
    emisorRfc: input.emisorRfc,
    receptorRfc: input.receptorRfc,
    pagos: input.pagos,
  });
  if (evaluated.ok === false) {
    return { status: 'revisión', policy_review_reason: evaluated.reason };
  }
  const contra = activeSeedAccount(
    input.chart,
    evaluated.tipo_operacion === 'cobro' ? 'Clientes' : 'Proveedores'
  );
  if (!contra) {
    const name = evaluated.tipo_operacion === 'cobro' ? 'Clientes' : 'Proveedores';
    return {
      status: 'revisión',
      policy_review_reason: `La cuenta ${name} no está activa en el catálogo.`,
    };
  }
  return postLiquidacion({
    organizationId: input.organizationId,
    chart: input.chart,
    draft: {
      id: input.documentId,
      monto_total: evaluated.monto_total,
      tipo_operacion: evaluated.tipo_operacion,
      account_code: contra.code,
      fecha: input.fecha,
      moneda: evaluated.moneda,
    },
  });
}

export async function createImportedTipoP(input: {
  organizationId: string;
  userId: string;
  organizationRfc: string;
  xmlText: string;
  chart: readonly CatalogAccount[];
  periodosCerrados: readonly string[];
}): Promise<void> {
  const parsed = parseCfdiWithSatExtensions(input.xmlText);
  if (parsed.ok === false) {
    throw new Error(parsed.errors.join(' '));
  }
  const d = parsed.data;
  const parsedDate = new Date(d.fecha);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Fecha inválida en el CFDI.');
  }
  const fechaIso = parsedDate.toISOString();
  const evaluated = evaluateTipoPLiquidacion({
    orgRfc: input.organizationRfc,
    emisorRfc: d.emisorRfc,
    receptorRfc: d.receptorRfc,
    pagos: d.pagos,
  });
  const created = await createTransaction({
    organization_id: input.organizationId,
    usuario_id: input.userId,
    tipo: 'ingreso',
    monto: evaluated.ok ? evaluated.monto_total : sumTipoPPaymentAmount(d.pagos),
    moneda: 'MXN',
    concepto: `CFDI Pago${d.uuid ? ` · ${d.uuid.slice(0, 8)}…` : ''}`,
    proveedor: d.receptorNombre || d.receptorRfc || 'Cliente',
    fecha: fechaIso,
    status: 'pendiente',
    account_name: '',
    tags: [],
    iva_tasa: 'na',
    egreso_acredita_iva: false,
    deducible: false,
    fiscal_subtotal: 0,
    fiscal_iva: 0,
    rfc_contraparte: d.receptorRfc || undefined,
    cfdi_uuid: d.uuid || undefined,
    importado_cfdi: true,
    cfdi_tipo_comprobante: 'P',
  });
  if (d.uuid && d.pagos.length > 0) {
    await processTipoPPaymentImport({
      organizationId: input.organizationId,
      userId: input.userId,
      paymentTxId: created.id,
      cfdiUuid: d.uuid,
      pagos: d.pagos,
      periodosCerrados: input.periodosCerrados,
      store: createFirestorePaymentImportStore(),
    });
  }
  const liquidacion = await liquidationPatchForTipoP({
    organizationId: input.organizationId,
    documentId: created.id,
    fecha: fechaIso,
    organizationRfc: input.organizationRfc,
    emisorRfc: d.emisorRfc,
    receptorRfc: d.receptorRfc,
    pagos: d.pagos,
    chart: input.chart,
  });
  await commitTransactionUpdatesBatch([
    {
      id: created.id,
      payload: {
        status: liquidacion.status,
        policy_review_reason: liquidacion.policy_review_reason,
        ...(liquidacion.asiento_liquidacion
          ? { asiento_liquidacion: liquidacion.asiento_liquidacion }
          : {}),
        ...(liquidacion.account_code
          ? { account_code: liquidacion.account_code, account_name: liquidacion.account_name }
          : {}),
        actualizado_en: serverTimestamp(),
      },
    },
  ]);
}
