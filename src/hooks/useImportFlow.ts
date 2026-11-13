import { useState, useCallback, useRef } from 'react';
import { parseCfdiXml, type CfdiExtracted } from '../lib/cfdiXml';
import {
  isNominaXmlCandidate,
  nominaToCfdiPreviewShape,
  parseNominaXml,
} from '../lib/nominaXmlParser';
import type { NominaExtracted } from '../types/nominaImport';
import { decideAccount } from '../services/accountMappingService';
import {
  createImportedNomina,
  createImportedTipoP,
  postClassifiedAccrual,
} from '../services/accrualPostingService';
import type { AccountMappingRule, CatalogAccount } from '../types/chartOfAccounts';
import { isTransactionDateInClosedPeriod } from '../lib/periodClose';
import {
  createTransaction,
  findTransactionsByCfdiUuids,
  setTransaction,
  serverTimestamp,
} from '../services/firestoreService';
import { messageIfActiveCfdiDuplicate } from '../lib/cfdiDuplicates';
import { readCfdiFiscalFace } from '../lib/cfdiFiscalFace';
import {
  buildSingleCfdiCreatePayload,
  buildSingleCfdiReplacePayload,
  singleCfdiLabels,
} from '../lib/cfdiSingleImportPayload';
import {
  EMPTY_CFDI_FOLDER_MESSAGE,
  REVIEWING_FOLDER_MESSAGE,
  releaseXmlTexts,
  routeCfdiSelection,
  selectCfdiXmlFiles,
  skippedNonXmlMessage,
} from '../lib/cfdiFileSelection';
import type { SelectedCfdiFile } from '../lib/cfdiFileSelection';
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
import type { ExcelImportResult } from '../lib/excelContaiImport';

export type { CfdiClassificationPayload };

export type ClassifyFn = (
  agentType: AgentType,
  payload: CfdiClassificationPayload
) => Promise<AgentDecision | undefined>;

export type UseImportFlowParams = {
  userId: string | undefined;
  organizationId: string | undefined;
  periodosCerrados: string[];
  classify: ClassifyFn;
  highAmountReviewThreshold: number;
  accounts: readonly CatalogAccount[];
  rules: readonly AccountMappingRule[];
  atajoPueBancos: boolean;
  organizationRfc?: string;
};

export function useImportFlow({
  userId,
  organizationId,
  periodosCerrados,
  classify,
  highAmountReviewThreshold,
  accounts,
  rules,
  atajoPueBancos,
  organizationRfc,
}: UseImportFlowParams) {
  const cfdiXmlTextRef = useRef('');
  const cfdiSourceFileNameRef = useRef('');
  const [isCfdiImportOpen, setIsCfdiImportOpen] = useState(false);
  const [cfdiPreview, setCfdiPreview] = useState<CfdiExtracted | null>(null);
  const [cfdiNominaPreview, setCfdiNominaPreview] = useState<NominaExtracted | null>(
    null
  );
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
    setCfdiNominaPreview(null);
    setCfdiImportError(null);
    setCfdiXsdMode(null);
    setCfdiPhase('idle');
    setCfdiBatchProgress(null);
    setCfdiBatchResults([]);
    setCfdiImporting(false);
    setCfdiXsdValidating(false);
    cfdiXmlTextRef.current = '';
    cfdiSourceFileNameRef.current = '';
  }, []);

  const closeExcelImport = useCallback(() => {
    setIsExcelImportOpen(false);
  }, []);

  /** Flujo 1 archivo: preview (sin cambio de comportamiento). */
  const handleSingleCfdiFile = useCallback((file: File) => {
    cfdiSourceFileNameRef.current = file.name;
    setCfdiImportError(null);
    setCfdiPreview(null);
    setCfdiNominaPreview(null);
    setCfdiXsdMode(null);
    setCfdiBatchResults([]);
    setCfdiBatchProgress({
      phase: 'uploading',
      current: 1,
      total: 1,
      fileName: file.name,
      message: 'Leyendo 1/1',
    });
    setCfdiPhase('uploading');
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      cfdiXmlTextRef.current = text;
      setCfdiXsdValidating(true);
      try {
        const { validateCfdiXmlAgainstXsd, formatCfdiXsdRejection } = await import(
          '../lib/cfdiXsdValidate'
        );
        const xsd = await validateCfdiXmlAgainstXsd(text);
        setCfdiXsdMode(xsd.mode);
        if (!xsd.valid) {
          setCfdiImportError(formatCfdiXsdRejection(xsd, file.name));
          setCfdiPhase('error');
          return;
        }

        if (isNominaXmlCandidate(text)) {
          const nomina = parseNominaXml(text);
          if (nomina.ok === false) {
            setCfdiImportError(nomina.errors.join(' '));
            setCfdiPhase('error');
            return;
          }
          setCfdiNominaPreview(nomina.data);
          setCfdiPreview(nominaToCfdiPreviewShape(nomina.data));
          setCfdiBatchProgress(null);
          setCfdiPhase('idle');
          return;
        }

        const r = parseCfdiXml(text);
        if (r.ok === false) {
          setCfdiImportError(r.errors.join(' '));
          setCfdiPhase('error');
          return;
        }
        setCfdiPreview(r.data);
        setCfdiBatchProgress(null);
        setCfdiPhase('idle');
      } finally {
        setCfdiXsdValidating(false);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const runCfdiBatch = useCallback(
    async (selected: SelectedCfdiFile[], skippedNotice: string | null) => {
      if (!userId || selected.length === 0) return;
      setCfdiPreview(null);
      setCfdiImportError(null);
      setCfdiXsdMode(null);
      setCfdiImporting(true);
      setCfdiPhase('uploading');
      setCfdiBatchResults([]);

      let inputs: Array<{ fileName: string; xmlText: string }> = [];
      try {
        setCfdiBatchProgress({
          phase: 'uploading',
          current: 0,
          total: selected.length,
          message: REVIEWING_FOLDER_MESSAGE,
        });
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        for (let i = 0; i < selected.length; i++) {
          const item = selected[i];
          if (!item) continue;
          setCfdiBatchProgress({
            phase: 'uploading',
            current: i + 1,
            total: selected.length,
            fileName: item.displayName,
            message: `Leyendo ${i + 1}/${selected.length}…`,
          });
          const xmlText = await item.file.text();
          inputs.push({ fileName: item.displayName, xmlText });
        }

        setCfdiPhase('processing_ai');
        if (!organizationId) {
          throw new Error('Selecciona una organización antes de importar.');
        }
        const summary = await runCfdiBatchImport({
          userId,
          organizationId,
          periodosCerrados,
          highAmountReviewThreshold,
          inputs,
          classify: async (agentType, payload) => classify(agentType, payload),
          accounts,
          rules,
          atajoPueBancos,
          organizationRfc,
          onProgress: (p) => {
            setCfdiBatchProgress(p);
            setCfdiPhase(p.phase === 'uploading' ? 'uploading' : 'processing_ai');
          },
        });

        setCfdiBatchResults(summary.results);
        if (summary.committed === 0 && summary.failed > 0) {
          setCfdiPhase('error');
          const failedText = `Ningún CFDI se importó. Revisa los errores por archivo (${summary.failed} fallido(s)).`;
          setCfdiImportError(skippedNotice ? `${failedText} ${skippedNotice}` : failedText);
        } else {
          setCfdiPhase('success');
          setCfdiImportError(skippedNotice);
        }
      } catch (e) {
        console.error(e);
        setCfdiPhase('error');
        const detail = e instanceof Error ? e.message : 'Error al importar el lote de CFDIs.';
        setCfdiImportError(skippedNotice ? `${detail} ${skippedNotice}` : detail);
      } finally {
        releaseXmlTexts(inputs);
        setCfdiImporting(false);
      }
    },
    [userId, organizationId, periodosCerrados, highAmountReviewThreshold, classify, accounts, rules]
  );

  /** Entrada del input: 1 archivo → preview; N → batch automático. */
  const handleCfdiFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const { selected, skippedNonXml } = selectCfdiXmlFiles(Array.from(fileList));
      const skippedNotice =
        skippedNonXml > 0 ? skippedNonXmlMessage(skippedNonXml) : null;
      const route = routeCfdiSelection(selected.length);
      if (route === 'empty') {
        setCfdiImportError(EMPTY_CFDI_FOLDER_MESSAGE);
        setCfdiPhase('error');
        return;
      }
      if (route === 'preview') {
        const only = selected[0];
        if (!only) return;
        handleSingleCfdiFile(only.file);
        if (skippedNotice) setCfdiImportError(skippedNotice);
        return;
      }
      void runCfdiBatch(selected, skippedNotice);
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
      if (!organizationId) {
        setExcelImportMessage('Selecciona una organización antes de importar.');
        return;
      }
      setExcelImporting(true);
      setExcelImportMessage(null);
      try {
        const { parseContaiExcelBuffer, mergeExcelResults } = await import(
          '../lib/excelContaiImportXlsx'
        );
        const { commitExcelImport } = await import('../services/excelImportService');
        const results: ExcelImportResult[] = [];
        for (const f of Array.from(fileList)) {
          const buf = await f.arrayBuffer();
          results.push(parseContaiExcelBuffer(buf, f.name));
        }
        const merged = mergeExcelResults(results);
        const { txCount, productCount, notices } = await commitExcelImport(
          userId,
          merged.transactions,
          merged.products,
          organizationId,
          {
            periodosCerrados,
            accounts,
            rules,
            atajoPueBancos,
            classify: (payload) => classify(AGENT_TYPES.CLASIFICADOR, payload),
          }
        );
        setExcelImportMessage(
          [
            `Listo: ${txCount} transacciones, ${productCount} productos.`,
            merged.warnings.length
              ? `Avisos (${merged.warnings.length}): ${merged.warnings.slice(0, 8).join(' · ')}`
              : '',
            notices.length ? notices.slice(0, 8).join('\n') : '',
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
    [userId, organizationId, periodosCerrados, accounts, rules, atajoPueBancos, classify]
  );

  const importCfdiAsTransaction = useCallback(async () => {
    if (!userId) {
      setCfdiImportError('Sesión no válida. Cierra sesión y vuelve a entrar.');
      setCfdiPhase('error');
      return;
    }
    if (!organizationId) {
      setCfdiImportError(
        'No hay empresa activa. Recarga la página o crea/elige una empresa en el selector. Si ves error de permisos Firebase en consola, el bootstrap de organización falló.'
      );
      setCfdiPhase('error');
      return;
    }
    if (!cfdiPreview) {
      setCfdiImportError('Primero carga un archivo XML.');
      setCfdiPhase('error');
      return;
    }

    if (cfdiNominaPreview) {
      const n = cfdiNominaPreview;
      let fechaIso: string;
      try {
        fechaIso = new Date(n.fechaPago || n.fecha).toISOString();
      } catch {
        setCfdiImportError('Fecha inválida en el CFDI de nómina.');
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
      setCfdiBatchProgress({
        phase: 'processing_ai',
        current: 1,
        total: 1,
        fileName: cfdiSourceFileNameRef.current || undefined,
        message: 'Guardando…',
      });
      try {
        await createImportedNomina({
          organizationId,
          userId,
          preview: n,
          fechaIso,
          chart: accounts,
        });
        setIsCfdiImportOpen(false);
        setCfdiPreview(null);
        setCfdiNominaPreview(null);
        setCfdiPhase('idle');
      } catch (err) {
        console.error(err);
        setCfdiImportError('No se pudo guardar la nómina.');
        setCfdiPhase('error');
      } finally {
        setCfdiImporting(false);
      }
      return;
    }

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
    if (String(d.tipoComprobante || '').toUpperCase() === 'P') {
      setCfdiImporting(true);
      setCfdiPhase('processing_ai');
      setCfdiBatchProgress({
        phase: 'processing_ai',
        current: 1,
        total: 1,
        fileName: cfdiSourceFileNameRef.current || undefined,
        message: 'Guardando…',
      });
      try {
        await createImportedTipoP({
          organizationId,
          userId,
          organizationRfc: organizationRfc ?? '',
          xmlText: cfdiXmlTextRef.current,
          chart: accounts,
          periodosCerrados,
        });
        setIsCfdiImportOpen(false);
        setCfdiPreview(null);
        setCfdiNominaPreview(null);
        setCfdiPhase('idle');
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Error al registrar el complemento de pago.';
        setCfdiImportError(detail);
        setCfdiPhase('error');
      } finally {
        setCfdiImporting(false);
      }
      return;
    }
    setCfdiImporting(true);
    setCfdiImportError(null);
    setCfdiPhase('processing_ai');
    setCfdiBatchProgress({
      phase: 'processing_ai',
      current: 1,
      total: 1,
      fileName: cfdiSourceFileNameRef.current || undefined,
      message: 'Guardando…',
    });
    try {
      const { tipo, proveedor, concepto } = singleCfdiLabels(d);

      const duplicateMessage = await messageIfActiveCfdiDuplicate({
        organizationId,
        uuid: d.uuid || undefined,
        fileName: cfdiSourceFileNameRef.current,
        lookup: findTransactionsByCfdiUuids,
      });
      if (duplicateMessage) {
        setCfdiImportError(duplicateMessage);
        setCfdiPhase('error');
        return;
      }

      const face = readCfdiFiscalFace(cfdiXmlTextRef.current);
      const docRef = await createTransaction(
        buildSingleCfdiCreatePayload({
          organizationId,
          userId,
          fechaIso,
          extracted: d,
          face,
        })
      );

      const assignment = await decideAccount(
        {
          tipo,
          cfdi_tipo: d.tipoComprobante,
          clave_prod_serv: d.claveProdServ,
          metodo_pago_sat: d.metodoPago,
          uso_cfdi: d.receptorUsoCfdi,
          rfc_contraparte: tipo === 'ingreso' ? d.receptorRfc : d.emisorRfc,
          monto: d.total,
          concepto,
          proveedor,
          fecha: fechaIso,
          moneda: d.moneda || 'MXN',
        },
        accounts,
        rules,
        (payload) => classify(AGENT_TYPES.CLASIFICADOR, payload)
      );

      const requiresPolicyReview = d.total > highAmountReviewThreshold;
      const persisted = await postClassifiedAccrual({
        organizationId,
        draft: {
          id: docRef.id,
          tipo,
          monto: d.total,
          fecha: fechaIso,
          fiscal_subtotal: d.subtotal,
          fiscal_iva: d.totalIvaTrasladado,
          account_code: assignment.account_code,
          metodo_pago_sat: d.metodoPago,
          concepto,
          proveedor,
        },
        chart: accounts,
        atajoPueBancos,
        proposedStatus:
          assignment.requires_human_approval || requiresPolicyReview ? 'revisión' : 'conciliado',
        proposedReason: requiresPolicyReview ? `Monto mayor a ${highAmountReviewThreshold}` : null,
        subtotal: d.subtotal,
        iva: d.totalIvaTrasladado,
        total: d.total,
      });
      await setTransaction(docRef.id, {
        ...buildSingleCfdiReplacePayload({
          organizationId,
          userId,
          fechaIso,
          extracted: d,
          face,
          assignment,
          persisted,
        }),
        creado_en: serverTimestamp(),
      });

      if (assignment.account_source === 'rule' && assignment.rule_id) {
        await logAuditEntry('ACCOUNT_MAPPED_BY_RULE', 'transactions', {
          id: docRef.id,
          account_code: assignment.account_code,
          rule_id: assignment.rule_id,
        });
      }
      await logAuditEntry('IMPORT_CFDI', 'transactions', { id: docRef.id, uuid: d.uuid });
      const periodHint = fechaIso.slice(0, 7);
      setCfdiImportError(null);
      setIsCfdiImportOpen(false);
      setCfdiPreview(null);
      setCfdiNominaPreview(null);
      setCfdiPhase('idle');
      window.alert(
        `Transacción registrada.\n\nEl CFDI es del periodo ${periodHint}. Cambia año/mes arriba a ese periodo para verla en Panel y Transacciones.`
      );
    } catch (err) {
      console.error(err);
      const detail =
        err instanceof Error && err.message
          ? err.message
          : 'Error desconocido';
      setCfdiImportError(
        `No se pudo guardar la transacción. ${detail}`.slice(0, 400)
      );
      setCfdiPhase('error');
    } finally {
      setCfdiImporting(false);
    }
  }, [
    userId,
    organizationId,
    cfdiPreview,
    cfdiNominaPreview,
    periodosCerrados,
    classify,
    highAmountReviewThreshold,
    accounts,
    rules,
    atajoPueBancos,
    organizationRfc,
  ]);

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
