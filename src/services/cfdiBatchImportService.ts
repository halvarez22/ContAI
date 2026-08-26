/**
 * Orquestación batch de CFDI: parse → filtro periodo → writeBatch → Groq secuencial.
 * E9.2 F2: ramificación tipo P / global / PPD.
 * Sin React. Firestore solo vía firestoreService.
 */

import type { CfdiExtracted } from '../lib/cfdiXml';
import {
  mapTipoComprobanteToTxTipo,
  inferIvaTasaFromAmounts,
} from '../lib/cfdiXml';
import {
  parseCfdiWithSatExtensions,
  type CfdiExtractedExtended,
} from '../lib/cfdiPagosParser';
import {
  isNominaXmlCandidate,
  parseNominaXml,
} from '../lib/nominaXmlParser';
import {
  DEFAULT_NOMINA_ACCOUNT_NAME,
  NOMINA_ACCOUNT_SOURCE,
} from '../config/nominaDefaults';
import type { NominaExtracted } from '../types/nominaImport';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import {
  commitCfdiTransactionBatch,
  commitTransactionUpdatesBatch,
  serverTimestamp,
  BATCH_CHUNK,
} from './firestoreService';
import { logAuditEntry } from './auditService';
import {
  buildGlobalSatFields,
  deriveInvoicePaymentState,
  detectEsAnticipo,
  normalizeCfdiTipo,
  processTipoPPaymentImport,
  sumTipoPPaymentAmount,
  type PaymentImportStore,
} from './cfdiPaymentImportService';
import { createFirestorePaymentImportStore } from './cfdiPaymentImportStore';
import type {
  CfdiBatchFileResult,
  CfdiBatchImportSummary,
  CfdiBatchProgress,
  CfdiClassificationPayload,
  CfdiTransactionDraft,
} from '../types/cfdiBatch';
import type { AgentDecision } from '../types/agentDecision';
import { AGENT_TYPES } from '../types/agentDecision';
import { roundMoney } from '../types/paymentApplication';

export type ClassifyBatchFn = (
  agentType: typeof AGENT_TYPES.CLASIFICADOR,
  payload: CfdiClassificationPayload
) => Promise<AgentDecision | undefined>;

export function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const n = size > 0 ? size : BATCH_CHUNK;
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n));
  }
  return out;
}

export function buildCfdiTransactionDraft(
  userId: string,
  organizationId: string,
  fileName: string,
  d: CfdiExtracted
): { ok: true; draft: CfdiTransactionDraft } | { ok: false; error: string } {
  return buildCfdiTransactionDraftExtended(
    userId,
    organizationId,
    fileName,
    {
      ...d,
      pagos: [],
    }
  );
}

export function buildCfdiTransactionDraftExtended(
  userId: string,
  organizationId: string,
  fileName: string,
  d: CfdiExtractedExtended
): { ok: true; draft: CfdiTransactionDraft } | { ok: false; error: string } {
  let fechaIso: string;
  try {
    fechaIso = new Date(d.fecha).toISOString();
  } catch {
    return { ok: false, error: 'Fecha inválida en el CFDI.' };
  }

  const cfdiTipo = normalizeCfdiTipo(d.tipoComprobante);
  const isTipoP = cfdiTipo === 'P';
  const tipo = mapTipoComprobanteToTxTipo(d.tipoComprobante);
  const iva_tasa = inferIvaTasaFromAmounts(d.subtotal, d.totalIvaTrasladado);
  const proveedor =
    tipo === 'ingreso'
      ? d.receptorNombre || d.receptorRfc || 'Cliente'
      : d.emisorNombre || d.emisorRfc || 'Proveedor';

  const pagoMonto = isTipoP ? sumTipoPPaymentAmount(d.pagos) : 0;
  const monto = isTipoP ? pagoMonto : roundMoney(d.total);

  const concepto = isTipoP
    ? `CFDI Pago${d.uuid ? ` · ${d.uuid.slice(0, 8)}…` : ''}`
    : d.descripcionPrimerConcepto
      ? `CFDI: ${d.descripcionPrimerConcepto}`
      : `CFDI importado${d.uuid ? ` · ${d.uuid.slice(0, 8)}…` : ''}`;

  const invoicePayment = isTipoP
    ? {
        monto_original: monto,
        saldo_pendiente: 0,
        payment_status: 'full' as const,
        applied_payment_amount: 0,
      }
    : deriveInvoicePaymentState(d.metodoPago, monto);

  const globalFields = buildGlobalSatFields(d.informacionGlobal);
  const esAnticipo =
    !isTipoP && detectEsAnticipo(d.descripcionPrimerConcepto, d.receptorUsoCfdi);

  const draft: CfdiTransactionDraft = {
    fileName,
    payload: {
      organization_id: organizationId,
      usuario_id: userId,
      tipo,
      monto,
      moneda: d.moneda || 'MXN',
      concepto,
      proveedor,
      fecha: fechaIso,
      status: 'pendiente',
      account_name: '',
      tags: [],
      iva_tasa,
      egreso_acredita_iva: tipo === 'egreso' && !isTipoP,
      deducible: tipo === 'egreso' && !isTipoP,
      fiscal_subtotal: d.subtotal,
      fiscal_iva: d.totalIvaTrasladado,
      rfc_contraparte: tipo === 'ingreso' ? d.receptorRfc : d.emisorRfc,
      uso_cfdi: d.receptorUsoCfdi || undefined,
      forma_pago_sat: d.formaPago || undefined,
      metodo_pago_sat: isTipoP ? undefined : d.metodoPago || undefined,
      cp_expedicion: d.lugarExpedicion || undefined,
      cfdi_uuid: d.uuid || undefined,
      importado_cfdi: true,
      source_file_name: fileName,
      cfdi_tipo_comprobante: cfdiTipo,
      ...globalFields,
      es_anticipo: esAnticipo || undefined,
      monto_original: invoicePayment.monto_original,
      saldo_pendiente: invoicePayment.saldo_pendiente,
      payment_status: invoicePayment.payment_status,
      applied_payment_amount: invoicePayment.applied_payment_amount,
    },
    classification: {
      tipo,
      monto,
      concepto,
      proveedor,
      fecha: fechaIso,
      moneda: d.moneda || 'MXN',
    },
    requiresGroqClassification: !isTipoP,
    paymentPagos: isTipoP && d.pagos.length > 0 ? d.pagos : undefined,
  };

  return { ok: true, draft };
}

/** E13.1 — 1 egreso neto por recibo; sin Groq; ISR/IMSS solo metadatos. */
export function buildNominaTransactionDraft(
  userId: string,
  organizationId: string,
  fileName: string,
  n: NominaExtracted
): { ok: true; draft: CfdiTransactionDraft } | { ok: false; error: string } {
  let fechaIso: string;
  try {
    fechaIso = new Date(n.fechaPago || n.fecha).toISOString();
  } catch {
    return { ok: false, error: 'Fecha inválida en el CFDI de nómina.' };
  }

  const empleadoLabel = n.empleadoNombre.trim() || n.empleadoRfc || 'Empleado';
  const concepto = `Nómina · ${empleadoLabel}${n.fechaPago ? ` · ${n.fechaPago}` : ''}`;
  const monto = roundMoney(n.total);

  const draft: CfdiTransactionDraft = {
    fileName,
    payload: {
      organization_id: organizationId,
      usuario_id: userId,
      tipo: 'egreso',
      monto,
      moneda: n.moneda || 'MXN',
      concepto,
      proveedor: empleadoLabel,
      fecha: fechaIso,
      status: 'pendiente',
      account_name: DEFAULT_NOMINA_ACCOUNT_NAME,
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
      source_file_name: fileName,
      cfdi_tipo_comprobante: 'N',
      is_nomina: true,
      nomina_isr_retained: n.isrRetenido,
      nomina_imss_retained: n.imssRetenido,
      nomina_total_percepciones: n.totalPercepciones,
      nomina_total_deducciones: n.totalDeducciones,
      monto_original: monto,
      saldo_pendiente: 0,
      payment_status: 'full',
      applied_payment_amount: 0,
    },
    classification: {
      tipo: 'egreso',
      monto,
      concepto,
      proveedor: empleadoLabel,
      fecha: fechaIso,
      moneda: n.moneda || 'MXN',
    },
    requiresGroqClassification: false,
  };

  return { ok: true, draft };
}

export function partitionDraftsByClosedPeriod(
  drafts: CfdiTransactionDraft[],
  periodosCerrados: string[]
): {
  accepted: CfdiTransactionDraft[];
  skipped: CfdiBatchFileResult[];
} {
  const accepted: CfdiTransactionDraft[] = [];
  const skipped: CfdiBatchFileResult[] = [];
  for (const d of drafts) {
    if (isTransactionDateInClosedPeriod(d.payload.fecha, periodosCerrados)) {
      skipped.push({
        fileName: d.fileName,
        ok: false,
        error: 'Periodo cerrado para la fecha del CFDI.',
      });
    } else {
      accepted.push(d);
    }
  }
  return { accepted, skipped };
}

export type ParsedXmlInput = { fileName: string; xmlText: string };

/**
 * Parsea/valida una lista de XML ya leídos (sin FileReader).
 * Continúa ante errores por archivo.
 */
export async function parseCfdiXmlBatch(
  inputs: ParsedXmlInput[]
): Promise<{
  drafts: Array<{ fileName: string; data: CfdiExtractedExtended }>;
  errors: CfdiBatchFileResult[];
}> {
  const { validateCfdiXmlAgainstXsd } = await import('../lib/cfdiXsdValidate');
  const drafts: Array<{ fileName: string; data: CfdiExtractedExtended }> = [];
  const errors: CfdiBatchFileResult[] = [];

  for (const item of inputs) {
    try {
      const xsd = await validateCfdiXmlAgainstXsd(item.xmlText);
      if (!xsd.valid) {
        errors.push({
          fileName: item.fileName,
          ok: false,
          error: [...xsd.errors, `(esquema: ${xsd.mode})`].filter(Boolean).join(' · '),
        });
        continue;
      }

      if (isNominaXmlCandidate(item.xmlText)) {
        const nomina = parseNominaXml(item.xmlText);
        if (nomina.ok === false) {
          errors.push({
            fileName: item.fileName,
            ok: false,
            error: nomina.errors.join(' '),
          });
          continue;
        }
        drafts.push({
          fileName: item.fileName,
          data: {
            ...nominaToExtendedStub(nomina.data),
            __nomina: nomina.data,
          } as CfdiExtractedExtended & { __nomina: NominaExtracted },
        });
        continue;
      }

      const r = parseCfdiWithSatExtensions(item.xmlText);
      if (r.ok === false) {
        errors.push({
          fileName: item.fileName,
          ok: false,
          error: r.errors.join(' '),
        });
        continue;
      }
      drafts.push({ fileName: item.fileName, data: r.data });
    } catch (e) {
      errors.push({
        fileName: item.fileName,
        ok: false,
        error: e instanceof Error ? e.message : 'Error al parsear XML',
      });
    }
  }

  return { drafts, errors };
}

function nominaToExtendedStub(n: NominaExtracted): CfdiExtractedExtended {
  return {
    version: '4.0',
    fecha: n.fecha,
    tipoComprobante: 'N',
    subtotal: n.subtotal,
    total: n.total,
    moneda: n.moneda,
    metodoPago: '',
    formaPago: '',
    lugarExpedicion: '',
    emisorRfc: n.emisorRfc,
    emisorNombre: n.emisorNombre,
    emisorRegimen: '',
    receptorRfc: n.empleadoRfc,
    receptorNombre: n.empleadoNombre,
    receptorUsoCfdi: '',
    totalIvaTrasladado: 0,
    uuid: n.cfdiUuid,
    descripcionPrimerConcepto: `Nómina · ${n.empleadoNombre || n.empleadoRfc}`,
    pagos: [],
  };
}

export type RunCfdiBatchParams = {
  userId: string;
  organizationId: string;
  periodosCerrados: string[];
  highAmountReviewThreshold: number;
  inputs: ParsedXmlInput[];
  classify: ClassifyBatchFn;
  onProgress?: (p: CfdiBatchProgress) => void;
  paymentImportStore?: PaymentImportStore;
};

/**
 * Pipeline completo batch. Clasificación Groq secuencial (K=1) solo I/E.
 * Tipo P → cfdiPaymentImportService (sin Groq).
 */
export async function runCfdiBatchImport(
  params: RunCfdiBatchParams
): Promise<CfdiBatchImportSummary> {
  const {
    userId,
    organizationId,
    periodosCerrados,
    highAmountReviewThreshold,
    inputs,
    classify,
    onProgress,
    paymentImportStore = createFirestorePaymentImportStore(),
  } = params;

  if (!organizationId) {
    throw new Error('organizationId es obligatorio para importar CFDI.');
  }

  const results: CfdiBatchFileResult[] = [];
  let paymentsLinked = 0;
  let paymentsPendingReview = 0;

  onProgress?.({
    phase: 'uploading',
    current: 0,
    total: inputs.length,
    message: 'Validando XML…',
  });

  const { drafts: parsed, errors: parseErrors } = await parseCfdiXmlBatch(inputs);
  results.push(...parseErrors);

  onProgress?.({
    phase: 'uploading',
    current: inputs.length,
    total: inputs.length,
    message: 'Validación completada',
  });

  const built: CfdiTransactionDraft[] = [];
  for (const p of parsed) {
    const withNomina = p.data as CfdiExtractedExtended & {
      __nomina?: NominaExtracted;
    };
    const b = withNomina.__nomina
      ? buildNominaTransactionDraft(
          userId,
          organizationId,
          p.fileName,
          withNomina.__nomina
        )
      : buildCfdiTransactionDraftExtended(
          userId,
          organizationId,
          p.fileName,
          p.data
        );
    if (b.ok === false) {
      results.push({ fileName: p.fileName, ok: false, error: b.error });
    } else {
      built.push(b.draft);
    }
  }

  const { accepted, skipped } = partitionDraftsByClosedPeriod(built, periodosCerrados);
  results.push(...skipped);

  if (accepted.length === 0) {
    const failed = results.filter((r) => !r.ok).length;
    return {
      results,
      committed: 0,
      classified: 0,
      skippedClosed: skipped.length,
      failed,
      paymentsLinked,
      paymentsPendingReview,
    };
  }

  onProgress?.({
    phase: 'processing_ai',
    current: 0,
    total: accepted.length,
    message: 'Guardando en Firestore…',
  });

  const { ids } = await commitCfdiTransactionBatch(
    accepted.map((d) => ({ payload: d.payload }))
  );

  let classified = 0;
  const patchUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (let i = 0; i < accepted.length; i++) {
    const draft = accepted[i];
    const documentId = ids[i];
    onProgress?.({
      phase: 'processing_ai',
      current: i + 1,
      total: accepted.length,
      fileName: draft.fileName,
      message: draft.requiresGroqClassification
        ? `Clasificando ${i + 1}/${accepted.length}…`
        : draft.payload.is_nomina
          ? `Registrando nómina ${i + 1}/${accepted.length}…`
          : `Procesando pago ${i + 1}/${accepted.length}…`,
    });

    try {
      if (draft.requiresGroqClassification) {
        const decision = await classify(AGENT_TYPES.CLASIFICADOR, draft.classification);
        if (decision) {
          const requiresPolicyReview = draft.payload.monto > highAmountReviewThreshold;
          const requiresHumanApproval =
            decision.requires_human_approval || requiresPolicyReview;
          patchUpdates.push({
            id: documentId,
            payload: {
              status: requiresHumanApproval ? 'revisión' : 'conciliado',
              account_name: decision.account_name,
              agente_ia_decision: decision.decision,
              confidence_score: decision.confidence_score,
              account_source: 'ai',
              policy_review_reason: requiresPolicyReview
                ? `Monto mayor a ${highAmountReviewThreshold}`
                : null,
              actualizado_en: serverTimestamp(),
            },
          });
          classified += 1;
        }

        results.push({
          fileName: draft.fileName,
          ok: true,
          documentId,
        });
        await logAuditEntry('IMPORT_CFDI', 'transactions', {
          id: documentId,
          uuid: draft.payload.cfdi_uuid,
          batch: true,
          fileName: draft.fileName,
          cfdi_tipo: draft.payload.cfdi_tipo_comprobante,
        });
      } else if (draft.payload.is_nomina) {
        patchUpdates.push({
          id: documentId,
          payload: {
            status: 'conciliado',
            account_name: draft.payload.account_name || DEFAULT_NOMINA_ACCOUNT_NAME,
            account_source: draft.payload.account_source || NOMINA_ACCOUNT_SOURCE,
            actualizado_en: serverTimestamp(),
          },
        });
        results.push({
          fileName: draft.fileName,
          ok: true,
          documentId,
        });
        await logAuditEntry('NOMINA_IMPORTED', 'transactions', {
          id: documentId,
          uuid: draft.payload.cfdi_uuid,
          batch: true,
          fileName: draft.fileName,
          monto: draft.payload.monto,
          nomina_isr_retained: draft.payload.nomina_isr_retained,
          nomina_imss_retained: draft.payload.nomina_imss_retained,
        });
      } else if (draft.paymentPagos && draft.payload.cfdi_uuid) {
        const outcome = await processTipoPPaymentImport({
          organizationId,
          userId,
          paymentTxId: documentId,
          cfdiUuid: draft.payload.cfdi_uuid,
          pagos: draft.paymentPagos,
          periodosCerrados,
          store: paymentImportStore,
        });
        if (outcome.status === 'applied') {
          paymentsLinked += outcome.applicationsCount;
          results.push({
            fileName: draft.fileName,
            ok: true,
            documentId,
            paymentsLinked: outcome.applicationsCount,
          });
        } else if (outcome.status === 'already_processed') {
          results.push({
            fileName: draft.fileName,
            ok: true,
            documentId,
            paymentsLinked: 0,
          });
        } else {
          paymentsPendingReview += 1;
          results.push({
            fileName: draft.fileName,
            ok: true,
            documentId,
            paymentPendingReview: true,
          });
        }
        await logAuditEntry('IMPORT_CFDI', 'transactions', {
          id: documentId,
          uuid: draft.payload.cfdi_uuid,
          batch: true,
          fileName: draft.fileName,
          cfdi_tipo: draft.payload.cfdi_tipo_comprobante,
        });
      } else {
        paymentsPendingReview += 1;
        results.push({
          fileName: draft.fileName,
          ok: true,
          documentId,
          paymentPendingReview: true,
        });
        await logAuditEntry('IMPORT_CFDI', 'transactions', {
          id: documentId,
          uuid: draft.payload.cfdi_uuid,
          batch: true,
          fileName: draft.fileName,
          cfdi_tipo: draft.payload.cfdi_tipo_comprobante,
        });
      }
    } catch (e) {
      results.push({
        fileName: draft.fileName,
        ok: false,
        documentId,
        error:
          e instanceof Error
            ? e.message
            : 'Error al procesar CFDI (documento quedó pendiente).',
      });
    }
  }

  if (patchUpdates.length > 0) {
    await commitTransactionUpdatesBatch(patchUpdates);
  }

  const failed = results.filter((r) => !r.ok).length;
  return {
    results,
    committed: accepted.length,
    classified,
    skippedClosed: skipped.length,
    failed,
    paymentsLinked,
    paymentsPendingReview,
  };
}

export { BATCH_CHUNK };
