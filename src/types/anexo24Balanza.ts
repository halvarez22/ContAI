import type { TrialBalanceReport } from './financialReports';

export const AUDIT_BALANZA_ANEXO24_EXPORTADA = 'BALANZA_ANEXO24_EXPORTADA';

export type Anexo24BalanzaCuenta = {
  numCta: string;
  saldoIni: number;
  debe: number;
  haber: number;
  saldoFin: number;
};

export type Anexo24BalanzaBlock = {
  accountCode: string;
  reason: string;
};

export type Anexo24BalanzaInput = {
  organizationRfc: string;
  year: number;
  monthIndex: number;
  trialBalance: TrialBalanceReport;
};

export type Anexo24BalanzaSuccess = {
  ok: true;
  rfc: string;
  year: number;
  monthIndex: number;
  periodo: string;
  tipoEnvio: 'N';
  cuentas: Anexo24BalanzaCuenta[];
  blocked: [];
};

export type Anexo24BalanzaBlocked = {
  ok: false;
  periodo: string;
  reason: string;
  cuentas: [];
  blocked: Anexo24BalanzaBlock[];
};

export type Anexo24BalanzaResult = Anexo24BalanzaSuccess | Anexo24BalanzaBlocked;
