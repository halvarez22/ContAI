/** Contratos de la vista ejecutiva (E7.1). Sin any. */

export type ExecutiveTxInput = {
  fecha: string | Date;
  tipo: string;
  monto: number | string;
  bank_reconciled?: boolean | null;
};

export type ExecutiveKpis = {
  periodoLabel: string;
  ivaSaldoNeto: number;
  flujoCajaNeto: number;
  pctBankReconciled: number;
  isrEstimadoYtd: number;
  txCount: number;
  bankReconciledCount: number;
  ingresosPeriodo: number;
  egresosPeriodo: number;
  warnings: string[];
  isEmpty: boolean;
};

export type ExecutiveTrendPoint = {
  mes: string;
  ingresos: number;
  egresos: number;
};

export type ExecutiveTaxSlice = {
  periodoLabel: string;
  ivaSaldoNeto: number;
  isrEstimadoYtd: number;
  lineasSinDesglose: number;
  disclaimer: string;
  warnings: string[];
};

export type ExecutiveSnapshot = {
  kpis: ExecutiveKpis;
  trend: ExecutiveTrendPoint[];
};
