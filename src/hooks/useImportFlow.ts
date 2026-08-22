import { useState, useCallback } from 'react';
import type { CfdiExtracted } from '../lib/cfdiXml';
import {
  parseCfdiXml,
  mapTipoComprobanteToTxTipo,
  inferIvaTasaFromAmounts,
} from '../lib/cfdiXml';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import {
  createTransaction,
  setTransaction,
  serverTimestamp,
} from '../services/firestoreService';
import { logAuditEntry } from '../services/auditService';
import { runCfdiBatchImport } from '../services/cfdiBatchImportService';
import type { AgentDecision, AgentType } from '../types/agentDecision';
import { AGENT_TYPES } from '../types/agentDecision';
import type {
  CfdiBatchFileResult,
  CfdiBatchProgress,
  CfdiClassificationPayload,
  CfdiImportPhase,
} from '../types/cfdiBatch';

export type { CfdiClassificationPayload };

export type ClassifyFn = (
  agentType: AgentType,
  payload: CfdiClassificationPayload
) => Promise<AgentDecision | undefined>;

export type UseImportFlowParams = {
  userId: string | undefined;
  periodosCerrados: string[];
  classify: ClassifyFn;
  highAmountReviewThreshold: number;
};

export function useImportFlow({
  userId,
  periodosCerrados,
  classify,
  highAmountReviewThreshold,
}: UseImportFlowParams) {
  const [isCfdiImportOpen, setIsCfdiImportOpen] = useState(false);
  const [cfdiPreview, setCfdiPreview] = useState<CfdiExtracted | null>(null);
  const [cfdiImportError, setCfdiImportError] = useState<string | null>(null);
  const [cfdiImporting, setCfdiImporting] = useState(false);
  const [cfdiXsdMode, setCfdiXsdMode] = useState<string | null>(null);
  const [cfdiXsdValidating, setCfdiXsdValidating] = useState(false);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [excelImportMessage, setExcelImportMessage] = useState<string | null>(null);
  const [excelImporting, setExcelImporting] = useState(false);

  const [cfdiPhase, setCfdiPhase] = useState<CfdiImportPhase>('idle');
  const [cfdiBatchProgress, setCfdiBatchProgress] = useState<CfdiBatchProgress | null>(null);
  const [cfdiBatchResults, setCfdiBatchResults] = useState<CfdiBatchFileResult[]>([]);

  const openCfdiImport = useCallback(() => {
    setIsCfdiImportOpen(true);
    setCfdiPhase('idle');
    setCfdiBatchProgress(null);
    setCfdiBatchResults([]);
  }, []);

  const openExcelImport = useCallback(() => {
    setExcelImportMessage(null);
    setIsExcelImportOpen(true);
  }, []);

  const closeCfdiImport = useCallback(() => {
    setIsCfdiImportOpen(false);
    setCfdiPreview(null);
    setCfdiImportError(null);
    setCfdiXsdMode(null);
    setCfdiPhase('idle');
    setCfdiBatchProgress(null);
    setCfdiBatchResults([]);
    setCfdiImporting(false);
    setCfdiXsdValidating(false);
  }, []);

  const closeExcelImport = useCallback(() => {
    setIsExcelImportOpen(false);
  }, []);

  /** Flujo 1 archivo: preview (sin cambio de comportamiento). */
  const handleSingleCfdiFile = useCallback((file: File) => {
    setCfdiImportError(null);
    setCfdiPreview(null);
    setCfdiXsdMode(null);
    setCfdiBatchResults([]);
    setCfdiPhase('uploading');
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      setCfdiXsdValidating(true);
      try {
        const { validateCfdiXmlAgainstXsd } = await import('../lib/cfdiXsdValidate');
        const xsd = await validateCfdiXmlAgainstXsd(text);
        setCfdiXsdMode(xsd.mode);
        if (!xsd.valid) {
          setCfdiImportError(
            [...xsd.errors, `(esquema: ${xsd.mode})`].filter(Boolean).join(' · ')
          );
          setCfdiPhase('error');
          return;
        }
        const r = parseCfdiXml(text);
        if (r.ok === false) {
          setCfdiImportError(r.errors.join(' '));
          setCfdiPhase('error');
          return;
        }
        setCfdiPreview(r.data);
        setCfdiPhase('idle');
      } finally {
        setCfdiXsdValidating(false);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const runCfdiBatch = useCallback(
    async (files: File[]) => {
      if (!userId || files.length === 0) return;
      setCfdiPreview(null);
      setCfdiImportError(null);
      setCfdiXsdMode(null);
      setCfdiImporting(true);
      setCfdiPhase('uploading');
      setCfdiBatchResults([]);

      try {
        const inputs: Array<{ fileName: string; xmlText: string }> = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setCfdiBatchProgress({
            phase: 'uploading',
            current: i + 1,
            total: files.length,
            fileName: f.name,
            message: `Leyendo ${i + 1}/${files.length}…`,
          });
          const xmlText = await f.text();
          inputs.push({ fileName: f.name, xmlText });
        }

        setCfdiPhase('processing_ai');
        const summary = await runCfdiBatchImport({
          userId,
          periodosCerrados,
          highAmountReviewThreshold,
          inputs,
          classify: async (agentType, payload) => classify(agentType, payload),
          onProgress: (p) => {
            setCfdiBatchProgress(p);
            setCfdiPhase(p.phase === 'uploading' ? 'uploading' : 'processing_ai');
          },
        });

        setCfdiBatchResults(summary.results);
        if (summary.committed === 0 && summary.failed > 0) {
          setCfdiPhase('error');
          setCfdiImportError(
            `Ningún CFDI se importó. Revisa los errores por archivo (${summary.failed} fallido(s)).`
          );
        } else {
          setCfdiPhase('success');
          setCfdiImportError(null);
        }
      } catch (e) {
        console.error(e);
        setCfdiPhase('error');
        setCfdiImportError(
          e instanceof Error ? e.message : 'Error al importar el lote de CFDIs.'
        );
      } finally {
        setCfdiImporting(false);
      }
    },
    [userId, periodosCerrados, highAmountReviewThreshold, classify]
  );

  /** Entrada del input: 1 archivo → preview; N → batch automático. */
  const handleCfdiFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const files = Array.from(fileList);
      if (files.length === 1) {
        handleSingleCfdiFile(files[0]);
        return;
      }
      void runCfdiBatch(files);
    },
    [handleSingleCfdiFile, runCfdiBatch]
  );

  /** Compat: un solo File | null (tests / callers antiguos). */
  const handleCfdiFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      handleSingleCfdiFile(file);
    },
    [handleSingleCfdiFile]
  );

  const runExcelImport = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || !userId) return;
      setExcelImporting(true);
      setExcelImportMessage(null);
      try {
        const { parseContaiExcelBuffer, mergeExcelResults } = await import(
          '../lib/excelContaiImportXlsx'
        );
        const { commitExcelImport } = await import('../services/excelImportService');
        const results = [];
        for (const f of Array.from(fileList)) {
          const buf = await f.arrayBuffer();
          results.push(parseContaiExcelBuffer(buf, f.name));
        }
        const merged = mergeExcelResults(results);
        const skippedClosed: string[] = [];
        const txs = merged.transactions.filter((t) => {
          if (isTransactionDateInClosedPeriod(t.fecha, periodosCerrados)) {
            skippedClosed.push(t.concepto.slice(0, 40));
            return false;
          }
          return true;
        });
        const { txCount, productCount } = await commitExcelImport(userId, txs, merged.products);
        setExcelImportMessage(
          [
            `Listo: ${txCount} transacciones, ${productCount} productos.`,
            merged.warnings.length
              ? `Avisos (${merged.warnings.length}): ${merged.warnings.slice(0, 8).join(' · ')}`
              : '',
            skippedClosed.length ? `Omitidas por periodo cerrado: ${skippedClosed.length}.` : '',
          ]
            .filter(Boolean)
            .join('\n')
        );
      } catch (e) {
        console.error(e);
        setExcelImportMessage('Error al importar. Revisa la consola o el formato de los archivos.');
      } finally {
        setExcelImporting(false);
      }
    },
    [userId, periodosCerrados]
  );

  const importCfdiAsTransaction = useCallback(async () => {
    if (!userId || !cfdiPreview) return;
    const d = cfdiPreview;
    let fechaIso: string;
    try {
      fechaIso = new Date(d.fecha).toISOString();
    } catch {
      setCfdiImportError('Fecha inválida en el CFDI.');
      setCfdiPhase('error');
      return;
    }
    if (isTransactionDateInClosedPeriod(fechaIso, periodosCerrados)) {
      alert('El periodo de la fecha del CFDI está cerrado.');
      return;
    }
    setCfdiImporting(true);
    setCfdiImportError(null);
    setCfdiPhase('processing_ai');
    try {
      const tipo = mapTipoComprobanteToTxTipo(d.tipoComprobante);
      const iva_tasa = inferIvaTasaFromAmounts(d.subtotal, d.totalIvaTrasladado);
      const proveedor =
        tipo === 'ingreso'
          ? d.receptorNombre || d.receptorRfc || 'Cliente'
          : d.emisorNombre || d.emisorRfc || 'Proveedor';
      const concepto = d.descripcionPrimerConcepto
        ? `CFDI: ${d.descripcionPrimerConcepto}`
        : `CFDI importado${d.uuid ? ` · ${d.uuid.slice(0, 8)}…` : ''}`;

      const docRef = await createTransaction({
        organization_id: 'org_main',
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
      });

      const classificationPayload: CfdiClassificationPayload = {
        tipo,
        monto: d.total,
        concepto,
        proveedor,
        fecha: fechaIso,
        moneda: d.moneda || 'MXN',
      };

      const decision = await classify(AGENT_TYPES.CLASIFICADOR, classificationPayload);
      if (decision) {
        const requiresPolicyReview = d.total > highAmountReviewThreshold;
        const requiresHumanApproval = decision.requires_human_approval || requiresPolicyReview;
        await setTransaction(docRef.id, {
          tipo,
          monto: d.total,
          moneda: d.moneda || 'MXN',
          concepto,
          proveedor,
          fecha: fechaIso,
          status: requiresHumanApproval ? 'revisión' : 'conciliado',
          account_name: decision.account_name,
          agente_ia_decision: decision.decision,
          confidence_score: decision.confidence_score,
          account_source: 'ai',
          policy_review_reason: requiresPolicyReview
            ? `Monto mayor a ${highAmountReviewThreshold}`
            : null,
          organization_id: 'org_main',
          usuario_id: userId,
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
          creado_en: serverTimestamp(),
        });
      }

      await logAuditEntry('IMPORT_CFDI', 'transactions', { id: docRef.id, uuid: d.uuid });
      setIsCfdiImportOpen(false);
      setCfdiPreview(null);
      setCfdiPhase('idle');
    } catch (err) {
      console.error(err);
      setCfdiImportError('No se pudo guardar la transacción.');
      setCfdiPhase('error');
    } finally {
      setCfdiImporting(false);
    }
  }, [userId, cfdiPreview, periodosCerrados, classify, highAmountReviewThreshold]);

  return {
    isCfdiImportOpen,
    cfdiPreview,
    cfdiImportError,
    cfdiImporting,
    cfdiXsdMode,
    cfdiXsdValidating,
    cfdiPhase,
    cfdiBatchProgress,
    cfdiBatchResults,
    isExcelImportOpen,
    excelImportMessage,
    excelImporting,
    openCfdiImport,
    openExcelImport,
    closeCfdiImport,
    closeExcelImport,
    handleCfdiFile,
    handleCfdiFiles,
    runExcelImport,
    importCfdiAsTransaction,
  };
}
