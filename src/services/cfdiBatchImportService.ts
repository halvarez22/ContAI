/**
 * Orquestación batch de CFDI: parse → filtro periodo → writeBatch → Groq secuencial.
 * Sin React. Firestore solo vía firestoreService.
 */

import type { CfdiExtracted } from '../lib/cfdiXml';
import {
  parseCfdiXml,
  mapTipoComprobanteToTxTipo,
  inferIvaTasaFromAmounts,
} from '../lib/cfdiXml';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import {
  commitCfdiTransactionBatch,
  commitTransactionUpdatesBatch,
  serverTimestamp,
  BATCH_CHUNK,
  orgMain,
} from './firestoreService';
import { logAuditEntry } from './auditService';
import type {
  CfdiBatchFileResult,
  CfdiBatchImportSummary,
  CfdiBatchProgress,
  CfdiClassificationPayload,
  CfdiTransactionDraft,
} from '../types/cfdiBatch';
import type { AgentDecision } from '../types/agentDecision';
import { AGENT_TYPES } from '../types/agentDecision';

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
  fileName: string,
  d: CfdiExtracted
): { ok: true; draft: CfdiTransactionDraft } | { ok: false; error: string } {
  let fechaIso: string;
  try {
    fechaIso = new Date(d.fecha).toISOString();
  } catch {
    return { ok: false, error: 'Fecha inválida en el CFDI.' };
  }

  const tipo = mapTipoComprobanteToTxTipo(d.tipoComprobante);
  const iva_tasa = inferIvaTasaFromAmounts(d.subtotal, d.totalIvaTrasladado);
  const proveedor =
    tipo === 'ingreso'
      ? d.receptorNombre || d.receptorRfc || 'Cliente'
      : d.emisorNombre || d.emisorRfc || 'Proveedor';
  const concepto = d.descripcionPrimerConcepto
    ? `CFDI: ${d.descripcionPrimerConcepto}`
    : `CFDI importado${d.uuid ? ` · ${d.uuid.slice(0, 8)}…` : ''}`;

  const draft: CfdiTransactionDraft = {
    fileName,
    payload: {
      organization_id: orgMain(),
      usuario_id: userId,
      tipo,
      monto: d.total,
      moneda: d.moneda || 'MXN',
      concepto,
      proveedor,
      fecha: fechaIso,
      status: 'pendiente',
      account_name: '',
      tags: [],
      iva_tasa,
      egreso_acredita_iva: tipo === 'egreso',
      deducible: tipo === 'egreso',
      fiscal_subtotal: d.subtotal,
      fiscal_iva: d.totalIvaTrasladado,
      rfc_contraparte: tipo === 'ingreso' ? d.receptorRfc : d.emisorRfc,
      uso_cfdi: d.receptorUsoCfdi || undefined,
      forma_pago_sat: d.formaPago || undefined,
      metodo_pago_sat: d.metodoPago || undefined,
      cp_expedicion: d.lugarExpedicion || undefined,
      cfdi_uuid: d.uuid || undefined,
      importado_cfdi: true,
      source_file_name: fileName,
    },
    classification: {
      tipo,
      monto: d.total,
      concepto,
      proveedor,
      fecha: fechaIso,
      moneda: d.moneda || 'MXN',
    },
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
  drafts: Array<{ fileName: string; data: CfdiExtracted }>;
  errors: CfdiBatchFileResult[];
}> {
  const { validateCfdiXmlAgainstXsd } = await import('../lib/cfdiXsdValidate');
  const drafts: Array<{ fileName: string; data: CfdiExtracted }> = [];
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
      const r = parseCfdiXml(item.xmlText);
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

export type RunCfdiBatchParams = {
  userId: string;
  periodosCerrados: string[];
  highAmountReviewThreshold: number;
  inputs: ParsedXmlInput[];
  classify: ClassifyBatchFn;
  onProgress?: (p: CfdiBatchProgress) => void;
};

/**
 * Pipeline completo batch. Clasificación Groq secuencial (K=1).
 * Fallos parciales: continúa el lote.
 */
export async function runCfdiBatchImport(
  params: RunCfdiBatchParams
): Promise<CfdiBatchImportSummary> {
  const {
    userId,
    periodosCerrados,
    highAmountReviewThreshold,
    inputs,
    classify,
    onProgress,
  } = params;

  const results: CfdiBatchFileResult[] = [];
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
    const b = buildCfdiTransactionDraft(userId, p.fileName, p.data);
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
      message: `Clasificando ${i + 1}/${accepted.length}…`,
    });

    try {
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

      await logAuditEntry('IMPORT_CFDI', 'transactions', {
        id: documentId,
        uuid: draft.payload.cfdi_uuid,
        batch: true,
        fileName: draft.fileName,
      });

      results.push({
        fileName: draft.fileName,
        ok: true,
        documentId,
      });
    } catch (e) {
      results.push({
        fileName: draft.fileName,
        ok: false,
        documentId,
        error:
          e instanceof Error
            ? e.message
            : 'Error al clasificar con Groq (documento quedó pendiente).',
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
  };
}

export { BATCH_CHUNK };
