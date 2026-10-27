/**
 * Pasada de cada CFDI ya guardado en el lote: regla o Groq, nómina, complemento P.
 * Vive aparte para que la orquestación de importación no acumule esta lógica.
 */

import {
  DEFAULT_NOMINA_ACCOUNT_CODE,
  DEFAULT_NOMINA_ACCOUNT_NAME,
  NOMINA_ACCOUNT_SOURCE,
} from '../config/nominaDefaults';
import type { AgentDecision } from '../types/agentDecision';
import { AGENT_TYPES } from '../types/agentDecision';
import type {
  CfdiBatchFileResult,
  CfdiBatchProgress,
  CfdiClassificationPayload,
  CfdiTransactionDraft,
} from '../types/cfdiBatch';
import type { AccountMappingRule, CatalogAccount } from '../types/chartOfAccounts';
import { logAuditEntry } from './auditService';
import { decideAccount } from './accountMappingService';
import { liquidationPatchForTipoP, postClassifiedAccrual } from './accrualPostingService';
import {
  processTipoPPaymentImport,
  type PaymentImportStore,
} from './cfdiPaymentImportService';
import { serverTimestamp } from './firestoreService';

export type ClassifyBatchFn = (
  agentType: typeof AGENT_TYPES.CLASIFICADOR,
  payload: CfdiClassificationPayload
) => Promise<AgentDecision | undefined>;

export type BatchClassificationResult = {
  results: CfdiBatchFileResult[];
  patchUpdates: Array<{ id: string; payload: Record<string, unknown> }>;
  classified: number;
  paymentsLinked: number;
  paymentsPendingReview: number;
};

export async function classifyBatchTransactions(params: {
  accepted: CfdiTransactionDraft[];
  documentIds: string[];
  classify: ClassifyBatchFn;
  accounts: readonly CatalogAccount[];
  rules: readonly AccountMappingRule[];
  atajoPueBancos?: boolean;
  highAmountReviewThreshold: number;
  organizationId: string;
  organizationRfc?: string;
  userId: string;
  periodosCerrados: string[];
  paymentImportStore: PaymentImportStore;
  onProgress?: (p: CfdiBatchProgress) => void;
}): Promise<BatchClassificationResult> {
  const {
    accepted,
    documentIds,
    classify,
    accounts,
    rules,
    atajoPueBancos = false,
    highAmountReviewThreshold,
    organizationId,
    organizationRfc = '',
    userId,
    periodosCerrados,
    paymentImportStore,
    onProgress,
  } = params;

  const results: CfdiBatchFileResult[] = [];
  const patchUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];
  let classified = 0;
  let paymentsLinked = 0;
  let paymentsPendingReview = 0;

  for (let i = 0; i < accepted.length; i++) {
    const draft = accepted[i];
    const documentId = documentIds[i];
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
        const assignment = await decideAccount(
          {
            tipo: draft.payload.tipo,
            cfdi_tipo: draft.payload.cfdi_tipo_comprobante,
            clave_prod_serv: draft.payload.clave_prod_serv,
            metodo_pago_sat: draft.payload.metodo_pago_sat,
            uso_cfdi: draft.payload.uso_cfdi,
            rfc_contraparte: draft.payload.rfc_contraparte,
            monto: draft.payload.monto,
            concepto: draft.classification.concepto,
            proveedor: draft.classification.proveedor,
            fecha: draft.classification.fecha,
            moneda: draft.classification.moneda,
          },
          accounts,
          rules,
          (payload) => classify(AGENT_TYPES.CLASIFICADOR, payload)
        );
        const requiresPolicyReview = draft.payload.monto > highAmountReviewThreshold;
        const requiresHumanApproval =
          assignment.requires_human_approval || requiresPolicyReview;
        const persisted = await postClassifiedAccrual({
          organizationId,
          draft: {
            id: documentId,
            tipo: draft.payload.tipo,
            monto: draft.payload.monto,
            fecha: draft.payload.fecha,
            fiscal_subtotal: draft.payload.fiscal_subtotal,
            fiscal_iva: draft.payload.fiscal_iva,
            account_code: assignment.account_code,
            metodo_pago_sat: draft.payload.metodo_pago_sat,
            concepto: draft.classification.concepto,
            proveedor: draft.classification.proveedor,
            is_nomina: false,
          },
          chart: accounts,
          atajoPueBancos,
          proposedStatus: requiresHumanApproval ? 'revisión' : 'conciliado',
          proposedReason: requiresPolicyReview
            ? `Monto mayor a ${highAmountReviewThreshold}`
            : null,
          subtotal: draft.payload.fiscal_subtotal,
          iva: draft.payload.fiscal_iva,
          total: draft.payload.monto,
        });
        patchUpdates.push({
          id: documentId,
          payload: {
            status: persisted.status,
            account_name: assignment.account_name,
            account_code: assignment.account_code,
            agente_ia_decision: assignment.decision,
            confidence_score: assignment.confidence_score,
            account_source: assignment.account_source,
            policy_review_reason: persisted.policy_review_reason,
            ...(persisted.asiento_devengo
              ? { asiento_devengo: persisted.asiento_devengo }
              : {}),
            actualizado_en: serverTimestamp(),
          },
        });
        classified += 1;
        if (assignment.account_source === 'rule' && assignment.rule_id) {
          await logAuditEntry('ACCOUNT_MAPPED_BY_RULE', 'transactions', {
            id: documentId,
            account_code: assignment.account_code,
            rule_id: assignment.rule_id,
          });
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
        const percepciones = draft.payload.nomina_total_percepciones;
        const isr = draft.payload.nomina_isr_retained;
        const imss = draft.payload.nomina_imss_retained;
        const persisted = await postClassifiedAccrual({
          organizationId,
          draft: {
            id: documentId,
            tipo: 'egreso',
            monto: Number(draft.payload.monto) || 0,
            fecha: String(draft.payload.fecha ?? ''),
            is_nomina: true,
            nomina: {
              total_percepciones: typeof percepciones === 'number' ? percepciones : Number.NaN,
              isr_retained: typeof isr === 'number' ? isr : Number.NaN,
              imss_retained: typeof imss === 'number' ? imss : Number.NaN,
            },
          },
          chart: accounts,
          atajoPueBancos: false,
          proposedStatus: 'conciliado',
          proposedReason: null,
          subtotal: typeof percepciones === 'number' ? percepciones : 0,
          iva: 0,
          total: Number(draft.payload.monto) || 0,
        });
        patchUpdates.push({
          id: documentId,
          payload: {
            status: persisted.status,
            account_name: draft.payload.account_name || DEFAULT_NOMINA_ACCOUNT_NAME,
            account_code: draft.payload.account_code || DEFAULT_NOMINA_ACCOUNT_CODE,
            account_source: draft.payload.account_source || NOMINA_ACCOUNT_SOURCE,
            policy_review_reason: persisted.policy_review_reason,
            ...(persisted.asiento_devengo ? { asiento_devengo: persisted.asiento_devengo } : {}),
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
      } else {
        if (draft.paymentPagos && draft.payload.cfdi_uuid) {
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
        } else {
          paymentsPendingReview += 1;
          results.push({
            fileName: draft.fileName,
            ok: true,
            documentId,
            paymentPendingReview: true,
          });
        }
        const liquidacion = await liquidationPatchForTipoP({
          organizationId,
          documentId,
          fecha: String(draft.payload.fecha ?? ''),
          organizationRfc,
          emisorRfc: draft.emisorRfc ?? '',
          receptorRfc: draft.receptorRfc ?? '',
          pagos: draft.paymentPagos ?? [],
          chart: accounts,
        });
        patchUpdates.push({
          id: documentId,
          payload: {
            status: liquidacion.status,
            policy_review_reason: liquidacion.policy_review_reason,
            ...(liquidacion.asiento_liquidacion
              ? { asiento_liquidacion: liquidacion.asiento_liquidacion }
              : {}),
            ...(liquidacion.account_code
              ? {
                  account_code: liquidacion.account_code,
                  account_name: liquidacion.account_name,
                }
              : {}),
            actualizado_en: serverTimestamp(),
          },
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

  return {
    results,
    patchUpdates,
    classified,
    paymentsLinked,
    paymentsPendingReview,
  };
}
