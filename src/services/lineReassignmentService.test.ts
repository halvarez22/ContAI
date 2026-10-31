import { describe, expect, it } from 'vitest';
import { NOMINA_REASSIGN_BLOCKED } from '../config/nominaDefaults';
import type { CatalogAccount } from '../types/chartOfAccounts';
import { LIQUIDACION_REASSIGN_BLOCKED } from '../types/journalEntry';
import type { JournalEntry } from '../types/journalEntry';
import type { LineAccountChangeRequest } from '../types/lineReassignment';
import { journalEntryBalances } from './journalEntryService';
import { validateLineAccountChange } from './lineReassignmentService';

const gasto: CatalogAccount = {
  code: '601.84',
  name: 'Gastos Operativos',
  naturaleza: 'gasto',
  activa: true,
};
const viaticos: CatalogAccount = {
  code: '601.49',
  name: 'Viáticos y Viajes',
  naturaleza: 'gasto',
  activa: true,
};
const ventas: CatalogAccount = {
  code: '401.01',
  name: 'Ingresos por Ventas',
  naturaleza: 'ingreso',
  activa: true,
};
const inactiva: CatalogAccount = {
  code: '601.61',
  name: 'Marketing y Publicidad',
  naturaleza: 'gasto',
  activa: false,
};

function entry(): JournalEntry {
  return {
    transaction_id: 'tx-1',
    tipo: 'egreso',
    fecha: '2026-01-15',
    atajo_pue_bancos: false,
    lines: [
      {
        account_code: '601.84',
        account_name: 'Gastos Operativos',
        tipo: 'cargo',
        monto: 100,
        concepto: 'Servicio',
      },
      {
        account_code: '201.01',
        account_name: 'Proveedores',
        tipo: 'abono',
        monto: 100,
        concepto: 'Servicio',
      },
    ],
  };
}

function request(partial: Partial<LineAccountChangeRequest> = {}): LineAccountChangeRequest {
  return {
    transaction_id: 'tx-1',
    line_index: 0,
    new_account_code: '601.49',
    current_entry: entry(),
    status: 'revisión',
    fecha: '2026-01-15T12:00:00.000Z',
    is_nomina: false,
    cfdi_tipo_comprobante: 'I',
    periodosCerrados: [],
    chart: [gasto, viaticos, ventas, inactiva],
    ...partial,
  };
}

describe('validateLineAccountChange', () => {
  it('no modifica el asiento recibido', () => {
    const current = entry();
    const before = structuredClone(current);
    const linesRef = current.lines;
    const firstLine = current.lines[0];
    Object.freeze(current);
    Object.freeze(current.lines);
    for (const line of current.lines) Object.freeze(line);

    const result = validateLineAccountChange(request({ current_entry: current }));

    expect(result.ok).toBe(true);
    expect(current.lines).toBe(linesRef);
    expect(current.lines[0]).toBe(firstLine);
    expect(current).toEqual(before);
  });

  it('rechaza un índice negativo y uno fuera de rango', () => {
    const negative = validateLineAccountChange(request({ line_index: -1 }));
    const past = validateLineAccountChange(request({ line_index: 2 }));

    expect(negative).toEqual({ ok: false, reason: 'Índice de línea inválido' });
    expect(past).toEqual({ ok: false, reason: 'Índice de línea inválido' });
  });

  it('acepta cambiar una cuenta de gasto por una de ingreso activa', () => {
    const result = validateLineAccountChange(request({ new_account_code: '401.01' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines[0]).toMatchObject({
      account_code: '401.01',
      account_name: 'Ingresos por Ventas',
      tipo: 'cargo',
      monto: 100,
      concepto: 'Servicio',
    });
    expect(result.entry.lines[1]?.account_code).toBe('201.01');
    expect(journalEntryBalances(result.entry)).toBe(true);
  });

  it('mantiene el cuadre al cambiar un gasto por otro gasto', () => {
    const result = validateLineAccountChange(request());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines[0]?.account_code).toBe('601.49');
    expect(result.entry.lines[0]?.account_name).toBe('Viáticos y Viajes');
    expect(journalEntryBalances(result.entry)).toBe(true);
  });

  it('rechaza una cuenta inactiva', () => {
    const result = validateLineAccountChange(request({ new_account_code: '601.61' }));
    expect(result).toEqual({ ok: false, reason: 'La cuenta no está en el catálogo activo.' });
  });

  it('bloquea la nómina y el tipo P con el mensaje ya existente', () => {
    const nomina = validateLineAccountChange(request({ is_nomina: true }));
    const tipoP = validateLineAccountChange(request({ cfdi_tipo_comprobante: 'P' }));

    expect(nomina).toEqual({ ok: false, reason: NOMINA_REASSIGN_BLOCKED });
    expect(tipoP).toEqual({ ok: false, reason: LIQUIDACION_REASSIGN_BLOCKED });
    expect(NOMINA_REASSIGN_BLOCKED).toBe(
      'La clasificación de nómina es automática y no puede modificarse manualmente'
    );
    expect(LIQUIDACION_REASSIGN_BLOCKED).toBe(
      'La liquidación del complemento de pago no puede reclasificarse a una cuenta de resultados'
    );
  });

  it('no permite corregir un movimiento conciliado', () => {
    const result = validateLineAccountChange(request({ status: 'conciliado' }));
    expect(result).toEqual({ ok: false, reason: 'No está en revisión' });
  });
});
