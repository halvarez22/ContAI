/**
 * Payloads estrictos del CFDI suelto (ingreso o egreso).
 * createTransaction y setTransaction reciben DocumentData.
 * El tipado se pierde en esa frontera. Lo sostienen tsc y las pruebas de este archivo.
 * creado_en no entra aquí: es un valor de Firestore y se agrega en la llamada.
 */

import type { CfdiExtracted } from './cfdiXml';
import { inferIvaTasaFromAmounts, mapTipoComprobanteToTxTipo } from './cfdiXml';
import type { AccountAssignment } from '../types/chartOfAccounts';
import type { CfdiFiscalFace } from '../types/cfdiFiscalFace';
import type { IvaTasaCode } from '../lib/fiscal';
import type { JournalEntry } from '../types/journalEntry';

export type SingleCfdiCreatePayload = {
  organization_id: string;
  usuario_id: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  moneda: string;
  concepto: string;
  proveedor: string;
  fecha: string;
  status: 'pendiente';
  account_name: '';
  clave_prod_serv?: string;
  tags: string[];
  iva_tasa: IvaTasaCode;
  egreso_acredita_iva: boolean;
  deducible: boolean;
  fiscal_subtotal: number;
  fiscal_iva: number;
  rfc_contraparte: string;
  uso_cfdi?: string;
  forma_pago_sat?: string;
  metodo_pago_sat?: string;
  cp_expedicion?: string;
  cfdi_uuid?: string;
  importado_cfdi: true;
  cfdi_fiscal_face?: CfdiFiscalFace;
};

export type SingleCfdiReplacePayload = {
  tipo: 'ingreso' | 'egreso';
  monto: number;
  moneda: string;
  concepto: string;
  proveedor: string;
  fecha: string;
  status: 'revisión' | 'conciliado';
  account_name: string;
  account_code: string;
  agente_ia_decision: string;
  confidence_score: number;
  account_source: AccountAssignment['account_source'];
  policy_review_reason: string | null;
  asiento_devengo?: JournalEntry;
  organization_id: string;
  usuario_id: string;
  iva_tasa: IvaTasaCode;
  egreso_acredita_iva: boolean;
  deducible: boolean;
  fiscal_subtotal: number;
  fiscal_iva: number;
  rfc_contraparte: string;
  uso_cfdi?: string;
  forma_pago_sat?: string;
  metodo_pago_sat?: string;
  cp_expedicion?: string;
  cfdi_uuid?: string;
  clave_prod_serv?: string;
  importado_cfdi: true;
  cfdi_fiscal_face?: CfdiFiscalFace;
};

export type SingleCfdiPersisted = {
  status: 'revisión' | 'conciliado';
  asiento_devengo?: JournalEntry;
  policy_review_reason: string | null;
};

function blankToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : undefined;
}

export function singleCfdiLabels(extracted: CfdiExtracted): {
  tipo: 'ingreso' | 'egreso';
  iva_tasa: IvaTasaCode;
  proveedor: string;
  concepto: string;
} {
  const tipo = mapTipoComprobanteToTxTipo(extracted.tipoComprobante);
  const proveedor =
    tipo === 'ingreso'
      ? extracted.receptorNombre || extracted.receptorRfc || 'Cliente'
      : extracted.emisorNombre || extracted.emisorRfc || 'Proveedor';
  const concepto = extracted.descripcionPrimerConcepto
    ? `CFDI: ${extracted.descripcionPrimerConcepto}`
    : `CFDI importado${extracted.uuid ? ` · ${extracted.uuid.slice(0, 8)}…` : ''}`;
  return {
    tipo,
    iva_tasa: inferIvaTasaFromAmounts(extracted.subtotal, extracted.totalIvaTrasladado),
    proveedor,
    concepto,
  };
}

function sharedFields(extracted: CfdiExtracted, fechaIso: string) {
  const labels = singleCfdiLabels(extracted);
  return {
    ...labels,
    monto: extracted.total,
    moneda: extracted.moneda || 'MXN',
    fecha: fechaIso,
    egreso_acredita_iva: labels.tipo === 'egreso',
    deducible: labels.tipo === 'egreso',
    fiscal_subtotal: extracted.subtotal,
    fiscal_iva: extracted.totalIvaTrasladado,
    rfc_contraparte: labels.tipo === 'ingreso' ? extracted.receptorRfc : extracted.emisorRfc,
    uso_cfdi: blankToUndefined(extracted.receptorUsoCfdi),
    forma_pago_sat: blankToUndefined(extracted.formaPago),
    metodo_pago_sat: blankToUndefined(extracted.metodoPago),
    cp_expedicion: blankToUndefined(extracted.lugarExpedicion),
    cfdi_uuid: blankToUndefined(extracted.uuid),
    clave_prod_serv: blankToUndefined(extracted.claveProdServ),
    importado_cfdi: true as const,
  };
}

export function buildSingleCfdiCreatePayload(input: {
  organizationId: string;
  userId: string;
  fechaIso: string;
  extracted: CfdiExtracted;
  face: CfdiFiscalFace | null;
}): SingleCfdiCreatePayload {
  const shared = sharedFields(input.extracted, input.fechaIso);
  const payload: SingleCfdiCreatePayload = {
    organization_id: input.organizationId,
    usuario_id: input.userId,
    tipo: shared.tipo,
    monto: shared.monto,
    moneda: shared.moneda,
    concepto: shared.concepto,
    proveedor: shared.proveedor,
    fecha: shared.fecha,
    status: 'pendiente',
    account_name: '',
    clave_prod_serv: shared.clave_prod_serv,
    tags: [],
    iva_tasa: shared.iva_tasa,
    egreso_acredita_iva: shared.egreso_acredita_iva,
    deducible: shared.deducible,
    fiscal_subtotal: shared.fiscal_subtotal,
    fiscal_iva: shared.fiscal_iva,
    rfc_contraparte: shared.rfc_contraparte,
    uso_cfdi: shared.uso_cfdi,
    forma_pago_sat: shared.forma_pago_sat,
    metodo_pago_sat: shared.metodo_pago_sat,
    cp_expedicion: shared.cp_expedicion,
    cfdi_uuid: shared.cfdi_uuid,
    importado_cfdi: true,
  };
  if (input.face) payload.cfdi_fiscal_face = input.face;
  return payload;
}

export function buildSingleCfdiReplacePayload(input: {
  organizationId: string;
  userId: string;
  fechaIso: string;
  extracted: CfdiExtracted;
  face: CfdiFiscalFace | null;
  assignment: AccountAssignment;
  persisted: SingleCfdiPersisted;
}): SingleCfdiReplacePayload {
  const shared = sharedFields(input.extracted, input.fechaIso);
  const payload: SingleCfdiReplacePayload = {
    tipo: shared.tipo,
    monto: shared.monto,
    moneda: shared.moneda,
    concepto: shared.concepto,
    proveedor: shared.proveedor,
    fecha: shared.fecha,
    status: input.persisted.status,
    account_name: input.assignment.account_name,
    account_code: input.assignment.account_code,
    agente_ia_decision: input.assignment.decision,
    confidence_score: input.assignment.confidence_score,
    account_source: input.assignment.account_source,
    policy_review_reason:
      input.persisted.policy_review_reason ??
      (input.assignment.confidence_score === 0 ? input.assignment.reason : null),
    organization_id: input.organizationId,
    usuario_id: input.userId,
    iva_tasa: shared.iva_tasa,
    egreso_acredita_iva: shared.egreso_acredita_iva,
    deducible: shared.deducible,
    fiscal_subtotal: shared.fiscal_subtotal,
    fiscal_iva: shared.fiscal_iva,
    rfc_contraparte: shared.rfc_contraparte,
    uso_cfdi: shared.uso_cfdi,
    forma_pago_sat: shared.forma_pago_sat,
    metodo_pago_sat: shared.metodo_pago_sat,
    cp_expedicion: shared.cp_expedicion,
    cfdi_uuid: shared.cfdi_uuid,
    clave_prod_serv: shared.clave_prod_serv,
    importado_cfdi: true,
  };
  if (input.persisted.asiento_devengo) {
    payload.asiento_devengo = input.persisted.asiento_devengo;
  }
  if (input.face) payload.cfdi_fiscal_face = input.face;
  return payload;
}
