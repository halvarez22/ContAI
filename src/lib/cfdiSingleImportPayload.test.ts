import { describe, expect, it } from 'vitest';
import type { CfdiExtracted } from './cfdiXml';
import {
  buildSingleCfdiCreatePayload,
  buildSingleCfdiReplacePayload,
} from './cfdiSingleImportPayload';
import type { AccountAssignment } from '../types/chartOfAccounts';
import type { CfdiFiscalFace } from '../types/cfdiFiscalFace';

const extracted: CfdiExtracted = {
  version: '4.0',
  fecha: '2026-08-01T12:00:00',
  tipoComprobante: 'I',
  subtotal: 1000,
  total: 1160,
  moneda: 'MXN',
  metodoPago: 'PUE',
  formaPago: '03',
  lugarExpedicion: '64000',
  emisorRfc: 'AAA010101AAA',
  emisorNombre: 'Emisor SA',
  emisorRegimen: '601',
  receptorRfc: 'BBB010101BBB',
  receptorNombre: 'Receptor SA',
  receptorUsoCfdi: 'G03',
  totalIvaTrasladado: 160,
  uuid: '11111111-1111-1111-1111-111111111111',
  descripcionPrimerConcepto: 'Servicio',
  claveProdServ: '01010101',
};

const face: CfdiFiscalFace = {
  clase: 'ingreso',
  serie: 'A',
  folio: '100',
  folioFiscal: '11111111-1111-1111-1111-111111111111',
  descuento: 0,
  impuestos: [
    {
      nombre: 'IVA',
      naturaleza: 'traslado',
      tipoFactor: 'Tasa',
      tasa: 0.16,
      importe: 160,
    },
  ],
};

const assignment: AccountAssignment = {
  account_code: '601.01',
  account_name: 'Gastos',
  account_source: 'ai',
  confidence_score: 0.9,
  requires_human_approval: false,
  decision: 'clasificado',
  reason: 'cuenta de gasto',
};

describe('payloads del CFDI suelto', () => {
  it('el alta y el reemplazo guardan la misma ficha', () => {
    const create = buildSingleCfdiCreatePayload({
      organizationId: 'org',
      userId: 'user',
      fechaIso: '2026-08-01T18:00:00.000Z',
      extracted,
      face,
    });
    const replace = buildSingleCfdiReplacePayload({
      organizationId: 'org',
      userId: 'user',
      fechaIso: '2026-08-01T18:00:00.000Z',
      extracted,
      face,
      assignment,
      persisted: { status: 'conciliado', policy_review_reason: null },
    });
    expect(create.cfdi_fiscal_face).toEqual(replace.cfdi_fiscal_face);
    expect(create.cfdi_fiscal_face).toEqual(face);
    expect(replace.account_name).toBe('Gastos');
    expect(replace.status).toBe('conciliado');
  });

  it('sin ficha, ni el alta ni el reemplazo traen la llave', () => {
    const create = buildSingleCfdiCreatePayload({
      organizationId: 'org',
      userId: 'user',
      fechaIso: '2026-08-01T18:00:00.000Z',
      extracted,
      face: null,
    });
    const replace = buildSingleCfdiReplacePayload({
      organizationId: 'org',
      userId: 'user',
      fechaIso: '2026-08-01T18:00:00.000Z',
      extracted,
      face: null,
      assignment,
      persisted: { status: 'revisión', policy_review_reason: null },
    });
    expect(create).not.toHaveProperty('cfdi_fiscal_face');
    expect(replace).not.toHaveProperty('cfdi_fiscal_face');
  });
});
