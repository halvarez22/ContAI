/** Contratos E14.0 Demo Seed. */

export type DemoSeedStatus = 'idle' | 'loading' | 'success' | 'error';

export type DemoSeedTxDraft = {
  organization_id: string;
  usuario_id: string;
  source: 'demo_seed';
  demo_period_key: string;
  demo_batch_id: string;
  tipo: 'ingreso' | 'egreso' | string;
  monto: number;
  moneda?: string;
  concepto: string;
  proveedor?: string;
  fecha: string;
  status?: string;
  account_name?: string;
  account_source?: string;
  tags?: string[];
  iva_tasa?: string | number;
  egreso_acredita_iva?: boolean;
  deducible?: boolean;
  fiscal_subtotal?: number;
  fiscal_iva?: number;
  rfc_contraparte?: string;
  importado_cfdi?: boolean;
  confidence_score?: number;
  agente_ia_decision?: string;
  policy_review_reason?: string | null;
  bank_reconciled?: boolean;
  bank_reconcile_status?: 'none' | 'partial' | 'full';
  bank_reconciled_amount?: number;
  is_nomina?: boolean;
  nomina_isr_retained?: number;
  nomina_imss_retained?: number;
  nomina_total_percepciones?: number;
  nomina_total_deducciones?: number;
};

export type DemoSeedBundle = {
  periodKey: string;
  demoBatchId: string;
  organizationId: string;
  usuarioId: string;
  transactions: DemoSeedTxDraft[];
  /** CSV texto listo para descarga / parseBankCsv */
  bankCsvText: string;
  bankCsvFileName: string;
};

export type DemoSeedCommitOk = {
  ok: true;
  purgedCount: number;
  createdCount: number;
  periodKey: string;
  demoBatchId: string;
  bankCsvText: string;
  bankCsvFileName: string;
};

export type DemoSeedCommitErr = {
  ok: false;
  reason: string;
};

export type DemoSeedCommitResult = DemoSeedCommitOk | DemoSeedCommitErr;

/** Documento mínimo para filtrar candidatos a purge (tests + service). */
export type DemoSeedPurgeCandidate = {
  id: string;
  organization_id?: string;
  source?: string;
  demo_period_key?: string;
};
