import type { CatalogAccount } from './chartOfAccounts';

export const AUDIT_POLIZAS_ANEXO24_EXPORTADAS = 'POLIZAS_ANEXO24_EXPORTADAS';

export type Anexo24NaturalezaSat = 'D' | 'A';
export type TipoPolizaSat = '1' | '2' | '3';

export type Anexo24Movement = {
  id: string;
  fecha: string;
  status?: string | null;
  tipo?: string | null;
  monto?: number | null;
  moneda?: string | null;
  concepto?: string | null;
  cfdi_uuid?: string | null;
  cfdi_tipo_comprobante?: string | null;
  importado_cfdi?: boolean | null;
  rfc_contraparte?: string | null;
  asiento_devengo?: unknown;
  asiento_liquidacion?: unknown;
};

export type Anexo24Application = {
  id: string;
  source_id: string;
  target_transaction_id: string;
  amount: number;
  cfdi_uuid_relacionado?: string | null;
};

export type Anexo24CompNal = {
  uuid: string;
  rfc: string;
  montoTotal: number;
  moneda: 'MXN';
  tipCamb: '1';
};

export type Anexo24Transaccion = {
  numCta: string;
  desCta: string;
  concepto: string;
  debe: number;
  haber: number;
  comprobantes: Anexo24CompNal[];
};

export type Anexo24Poliza = {
  tipo: TipoPolizaSat;
  numUnIdenPol: string;
  fecha: string;
  concepto: string;
  transactionId: string;
  transacciones: Anexo24Transaccion[];
};

export type Anexo24Block = {
  transactionId: string;
  accountCode: string;
  reason: string;
};

export type Anexo24Notice = {
  transactionId: string;
  reason: string;
};

export type Anexo24Excluded = {
  transactionId: string;
  reason: string;
};

export type Anexo24PolizaInput = {
  organizationRfc: string;
  year: number;
  monthIndex: number;
  chart: readonly CatalogAccount[];
  movements: readonly Anexo24Movement[];
  applications: readonly Anexo24Application[];
};

export type Anexo24PolizaSuccess = {
  ok: true;
  rfc: string;
  year: number;
  monthIndex: number;
  tipoSolicitud: 'AF';
  periodKey: string;
  polizas: Anexo24Poliza[];
  blocked: [];
  notices: Anexo24Notice[];
  excluded: Anexo24Excluded[];
};

export type Anexo24PolizaBlocked = {
  ok: false;
  periodKey: string;
  reason: string;
  polizas: [];
  blocked: Anexo24Block[];
  notices: Anexo24Notice[];
  excluded: Anexo24Excluded[];
};

export type Anexo24PolizaResult = Anexo24PolizaSuccess | Anexo24PolizaBlocked;
