/**
 * Contratos exportación póliza diario ContAI (E10.x MVP).
 * Un formato .txt delimitado `;`. Sin XML ERP.
 */

export const POLIZA_CONTRA_CUENTA_DEFAULT = 'Bancos';
export const POLIZA_CONCEPTO_MAX = 40;
export const POLIZA_CUENTA_MAX = 40;
export const POLIZA_FIELD_SEP = ';';

export const AUDIT_POLIZA_EXPORTED = 'POLIZA_EXPORTED';

export const POLIZA_EXPORT_DISABLED_HINT =
  'No hay transacciones conciliadas y clasificadas en este periodo para exportar';

export type PolizaTxInput = {
  id: string;
  fecha: string | Date;
  tipo: string;
  monto: number | string;
  concepto?: string | null;
  proveedor?: string | null;
  account_name?: string | null;
  bank_reconciled?: boolean | null;
  bank_reconcile_status?: 'none' | 'partial' | 'full' | string | null;
  /** E13.2 — metadatos nómina (solo exportación póliza) */
  is_nomina?: boolean;
  nomina_isr_retained?: number;
  nomina_imss_retained?: number;
  nomina_total_percepciones?: number;
};

export type PolizaSkipReason =
  | 'sin_cuenta'
  | 'sin_conciliacion_bancaria'
  | 'tipo_desconocido'
  | 'monto_invalido';

export type PolizaSkipped = {
  id: string;
  reason: PolizaSkipReason;
};

export type PolizaLine = {
  fecha: string;
  tipo: 'CARGO' | 'ABONO';
  cuenta: string;
  concepto: string;
  cargo: number;
  abono: number;
  txId: string;
};

export type PolizaExportOk = {
  ok: true;
  text: string;
  lines: PolizaLine[];
  eligibleCount: number;
  skipped: PolizaSkipped[];
  totalCargos: number;
  totalAbonos: number;
  fileName: string;
};

export type PolizaExportErr = {
  ok: false;
  reason: string;
  eligibleCount: number;
  skipped: PolizaSkipped[];
};

export type PolizaExportResult = PolizaExportOk | PolizaExportErr;

export type BuildPolizaDiarioParams = {
  transactions: ReadonlyArray<PolizaTxInput>;
  organizationId: string;
  periodKey: string; // YYYY-MM
  generatedAt?: Date;
  contraCuenta?: string;
  /** E13.2 — override cuentas pasivo nómina (default en nominaDefaults.ts) */
  nominaIsrCuenta?: string;
  nominaImssCuenta?: string;
};
