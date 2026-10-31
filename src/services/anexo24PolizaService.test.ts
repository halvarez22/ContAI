import { describe, expect, it } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import {
  ANEXO24_BOTH_ENTRIES_REASON,
  ANEXO24_NO_CFDI_NOTICE,
  ANEXO24_RFC_INVALID_REASON,
} from '../config/anexo24';
import type { JournalEntry, JournalLine } from '../types/journalEntry';
import type { Anexo24Application, Anexo24Movement, Anexo24PolizaInput } from '../types/anexo24Polizas';
import { buildAnexo24Polizas, naturalezaSat } from './anexo24PolizaService';
import { polizasToXml } from './anexo24PolizaXml';

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const UUID_P = '33333333-3333-3333-3333-333333333333';
const RFC_ORG = 'AAA010101AAA';
const RFC_TERCERO = 'XAXX010101000';

function line(code: string, name: string, tipo: 'cargo' | 'abono', monto: number): JournalLine {
  return { account_code: code, account_name: name, tipo, monto, concepto: 'Operación' };
}

function entry(
  id: string,
  tipo: 'ingreso' | 'egreso',
  lines: JournalLine[],
  atajo = false
): JournalEntry {
  return {
    transaction_id: id,
    tipo,
    fecha: '2026-01-15',
    atajo_pue_bancos: atajo,
    lines,
  };
}

function baseInput(partial: Partial<Anexo24PolizaInput> = {}): Anexo24PolizaInput {
  return {
    organizationRfc: RFC_ORG,
    year: 2026,
    monthIndex: 0,
    chart: getChartOfAccountsSeed(),
    movements: [],
    applications: [],
    ...partial,
  };
}

describe('naturalezaSat', () => {
  it('trata el IVA acreditable como deudor y el trasladado como acreedor', () => {
    const chart = getChartOfAccountsSeed();
    const acreditable = chart.find((account) => account.code === '119.01');
    const trasladado = chart.find((account) => account.code === '209.01');
    expect(acreditable).toBeTruthy();
    expect(trasladado).toBeTruthy();
    if (!acreditable || !trasladado) return;
    expect(naturalezaSat(acreditable)).toBe('D');
    expect(naturalezaSat(trasladado)).toBe('A');
  });
});

describe('buildAnexo24Polizas', () => {
  it('no modifica los movimientos congelados y arma un diario con un solo UUID', () => {
    const movement: Anexo24Movement = {
      id: 'tx-ppd',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      tipo: 'ingreso',
      monto: 1160,
      moneda: 'MXN',
      cfdi_uuid: UUID_A,
      cfdi_tipo_comprobante: 'I',
      rfc_contraparte: RFC_TERCERO,
      asiento_devengo: entry('tx-ppd', 'ingreso', [
        line('105.01', 'Clientes', 'cargo', 1160),
        line('401.01', 'Ingresos por Ventas', 'abono', 1000),
        line('209.01', 'IVA trasladado', 'abono', 160),
      ]),
    };
    const input = baseInput({ movements: [movement] });
    const before = structuredClone(input);
    Object.freeze(input);
    Object.freeze(input.movements);
    Object.freeze(movement);
    Object.freeze(movement.asiento_devengo);
    const devengo = movement.asiento_devengo as JournalEntry;
    Object.freeze(devengo.lines);
    for (const item of devengo.lines) Object.freeze(item);

    const result = buildAnexo24Polizas(input);

    expect(input).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.polizas).toHaveLength(1);
    expect(result.polizas[0]?.tipo).toBe('3');
    expect(result.polizas[0]?.transacciones[0]?.comprobantes).toEqual([
      { uuid: UUID_A, rfc: RFC_TERCERO, montoTotal: 1160, moneda: 'MXN', tipCamb: '1' },
    ]);
    expect(result.polizas[0]?.transacciones[1]?.comprobantes).toEqual([]);
    expect(result.polizas[0]?.transacciones[2]?.comprobantes).toEqual([]);
  });

  it('bloquea cuando el mismo movimiento tiene devengo y liquidación válidos', () => {
    const movement: Anexo24Movement = {
      id: 'tx-ambos',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      moneda: 'MXN',
      asiento_devengo: entry('tx-ambos', 'ingreso', [
        line('105.01', 'Clientes', 'cargo', 100),
        line('401.01', 'Ingresos por Ventas', 'abono', 100),
      ]),
      asiento_liquidacion: entry('tx-ambos', 'ingreso', [
        line('102.01', 'Bancos', 'cargo', 100),
        line('105.01', 'Clientes', 'abono', 100),
      ]),
    };
    const result = buildAnexo24Polizas(baseInput({ movements: [movement] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.polizas).toEqual([]);
    expect(result.blocked[0]?.reason).toBe(ANEXO24_BOTH_ENTRIES_REASON);
  });

  it('detiene el archivo si las aplicaciones no igualan la partida', () => {
    const movement: Anexo24Movement = {
      id: 'tx-p',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      monto: 1160,
      moneda: 'MXN',
      cfdi_uuid: UUID_P,
      cfdi_tipo_comprobante: 'P',
      rfc_contraparte: RFC_TERCERO,
      asiento_liquidacion: entry('tx-p', 'ingreso', [
        line('102.01', 'Bancos', 'cargo', 1160),
        line('105.01', 'Clientes', 'abono', 1160),
      ]),
    };
    const applications: Anexo24Application[] = [
      {
        id: 'app-1',
        source_id: 'tx-p',
        target_transaction_id: 'fac-1',
        amount: 400,
        cfdi_uuid_relacionado: UUID_A,
      },
      {
        id: 'app-2',
        source_id: 'tx-p',
        target_transaction_id: 'fac-2',
        amount: 759,
        cfdi_uuid_relacionado: UUID_B,
      },
    ];
    const targets: Anexo24Movement[] = [
      { id: 'fac-1', fecha: '2025-12-15T12:00:00.000Z', rfc_contraparte: RFC_TERCERO, cfdi_uuid: UUID_A },
      { id: 'fac-2', fecha: '2025-12-16T12:00:00.000Z', rfc_contraparte: RFC_TERCERO, cfdi_uuid: UUID_B },
    ];
    const result = buildAnexo24Polizas(
      baseInput({ movements: [movement, ...targets], applications })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.polizas).toEqual([]);
    expect(result.blocked[0]?.reason).toBe(
      'Las aplicaciones no igualan la partida del movimiento tx-p. Diferencia: 1.00.'
    );
  });

  it('cuelga cada tramo del pago sin partir la partida de bancos', () => {
    const movement: Anexo24Movement = {
      id: 'tx-p',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      monto: 1160,
      moneda: 'MXN',
      cfdi_uuid: UUID_P,
      cfdi_tipo_comprobante: 'P',
      rfc_contraparte: RFC_TERCERO,
      asiento_liquidacion: entry('tx-p', 'ingreso', [
        line('102.01', 'Bancos', 'cargo', 1160),
        line('105.01', 'Clientes', 'abono', 1160),
      ]),
    };
    const applications: Anexo24Application[] = [
      {
        id: 'app-1',
        source_id: 'tx-p',
        target_transaction_id: 'fac-1',
        amount: 400,
        cfdi_uuid_relacionado: UUID_A,
      },
      {
        id: 'app-2',
        source_id: 'tx-p',
        target_transaction_id: 'fac-2',
        amount: 760,
        cfdi_uuid_relacionado: null,
      },
    ];
    const targets: Anexo24Movement[] = [
      { id: 'fac-1', fecha: '2025-12-15T12:00:00.000Z', rfc_contraparte: RFC_TERCERO, cfdi_uuid: UUID_A },
      { id: 'fac-2', fecha: '2025-12-16T12:00:00.000Z', rfc_contraparte: RFC_TERCERO, cfdi_uuid: UUID_B },
    ];
    const result = buildAnexo24Polizas(
      baseInput({ movements: [movement, ...targets], applications })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.polizas[0]?.tipo).toBe('1');
    expect(result.polizas[0]?.transacciones[0]?.debe).toBe(1160);
    expect(result.polizas[0]?.transacciones[0]?.comprobantes[0]?.montoTotal).toBe(1160);
    expect(result.polizas[0]?.transacciones[1]?.comprobantes.map((item) => item.montoTotal)).toEqual([
      400, 760,
    ]);
  });

  it('bloquea la aplicación que no tiene UUID', () => {
    const movement: Anexo24Movement = {
      id: 'tx-p',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      monto: 400,
      moneda: 'MXN',
      cfdi_uuid: UUID_P,
      cfdi_tipo_comprobante: 'P',
      rfc_contraparte: RFC_TERCERO,
      asiento_liquidacion: entry('tx-p', 'ingreso', [
        line('102.01', 'Bancos', 'cargo', 400),
        line('105.01', 'Clientes', 'abono', 400),
      ]),
    };
    const result = buildAnexo24Polizas(
      baseInput({
        movements: [movement, { id: 'fac-1', fecha: '2025-12-15T12:00:00.000Z', rfc_contraparte: RFC_TERCERO }],
        applications: [
          {
            id: 'app-vacia',
            source_id: 'tx-p',
            target_transaction_id: 'fac-1',
            amount: 400,
            cfdi_uuid_relacionado: '',
          },
        ],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocked.map((item) => item.reason)).toContain(
      'Falta el UUID de la aplicación app-vacia en el movimiento tx-p.'
    );
  });

  it('rechaza un RFC de organización con formato inválido', () => {
    const result = buildAnexo24Polizas(baseInput({ organizationRfc: 'ABC123' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(ANEXO24_RFC_INVALID_REASON);
    expect(result.polizas).toEqual([]);
  });

  it('incluye el egreso de Excel sin comprobante y lo avisa', () => {
    const movement: Anexo24Movement = {
      id: 'tx-xl',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      tipo: 'egreso',
      monto: 100,
      moneda: 'MXN',
      asiento_devengo: entry('tx-xl', 'egreso', [
        line('601.84', 'Gastos Operativos', 'cargo', 100),
        line('201.01', 'Proveedores', 'abono', 100),
      ]),
    };
    const result = buildAnexo24Polizas(baseInput({ movements: [movement] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notices[0]?.reason).toBe(ANEXO24_NO_CFDI_NOTICE);
    expect(result.polizas[0]?.tipo).toBe('3');
    const xml = polizasToXml(result).text;
    expect(xml).not.toContain('CompNal');
    expect(xml).toContain('TipoPoliza="3"');
  });

  it('clasifica la nómina conciliada como egreso', () => {
    const movement: Anexo24Movement = {
      id: 'tx-nom',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      monto: 850,
      moneda: 'MXN',
      cfdi_uuid: UUID_A,
      cfdi_tipo_comprobante: 'N',
      rfc_contraparte: RFC_TERCERO,
      asiento_devengo: entry('tx-nom', 'egreso', [
        line('601.01', 'Gastos de Nómina', 'cargo', 1000),
        line('216.01', 'ISR por Pagar', 'abono', 100),
        line('216.11', 'IMSS por Pagar', 'abono', 50),
        line('102.01', 'Bancos', 'abono', 850),
      ]),
    };
    const result = buildAnexo24Polizas(baseInput({ movements: [movement] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.polizas[0]?.tipo).toBe('2');
  });

  it('bloquea una cuenta activa que no está en la semilla', () => {
    const movement: Anexo24Movement = {
      id: 'tx-custom',
      fecha: '2026-01-15T12:00:00.000Z',
      status: 'conciliado',
      monto: 100,
      moneda: 'MXN',
      asiento_devengo: entry('tx-custom', 'egreso', [
        line('601.99', 'Otra', 'cargo', 100),
        line('201.01', 'Proveedores', 'abono', 100),
      ]),
    };
    const result = buildAnexo24Polizas(
      baseInput({
        chart: [
          ...getChartOfAccountsSeed(),
          { code: '601.99', name: 'Otra', naturaleza: 'gasto', activa: true },
        ],
        movements: [movement],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocked[0]?.reason).toBe('La cuenta no tiene código agrupador del SAT.');
    expect(result.blocked[0]?.accountCode).toBe('601.99');
  });
});
