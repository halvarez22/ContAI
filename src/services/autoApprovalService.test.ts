import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../types/journalEntry';
import type { AutoApprovalTransaction } from '../types/autoApproval';
import {
  assertApprovalThreshold,
  resolveApprovalThreshold,
  selectAutoApprovableTransactions,
  toAutoApprovalFields,
} from './autoApprovalService';

function balanced(id: string, cargo = 100, abono = 100): JournalEntry {
  return {
    transaction_id: id,
    tipo: 'egreso',
    fecha: '2026-01-15',
    atajo_pue_bancos: false,
    lines: [
      { account_code: '601.84', account_name: 'Gastos', tipo: 'cargo', monto: cargo, concepto: 'Gasto' },
      { account_code: '201.01', account_name: 'Proveedores', tipo: 'abono', monto: abono, concepto: 'Gasto' },
    ],
  };
}

function row(
  partial: Partial<AutoApprovalTransaction> & Pick<AutoApprovalTransaction, 'id'>
): AutoApprovalTransaction {
  return {
    fecha: '2026-01-15T12:00:00.000Z',
    status: 'revisión',
    confidence_score: 0.9,
    asiento_devengo: balanced(partial.id),
    ...partial,
  };
}

describe('selectAutoApprovableTransactions', () => {
  it('aprueba 0.90 y rechaza 0.89', () => {
    const report = selectAutoApprovableTransactions(
      [
        row({ id: 'exacta', confidence_score: 0.9 }),
        row({ id: 'baja', confidence_score: 0.89 }),
      ],
      0.9,
      []
    );

    expect(report.approved.map((item) => item.id)).toEqual(['exacta']);
    expect(report.result.approvedCount).toBe(1);
    expect(report.result.rejected.map((item) => item.id)).toEqual(['baja']);
    expect(report.result.rejected[0]?.reason).toBe('Confianza por debajo del umbral');
  });

  it('no aprueba una confianza nula', () => {
    const report = selectAutoApprovableTransactions(
      [row({ id: 'nula', confidence_score: null })],
      0.9,
      []
    );

    expect(report.approved).toEqual([]);
    expect(report.result.approvedCount).toBe(0);
    expect(report.result.rejected).toEqual([
      { id: 'nula', reason: 'Confianza por debajo del umbral' },
    ]);
  });

  it('rechaza un asiento que no cuadra', () => {
    const report = selectAutoApprovableTransactions(
      [
        row({
          id: 'descuadrado',
          confidence_score: 0.95,
          asiento_devengo: balanced('descuadrado', 100, 40),
        }),
      ],
      0.9,
      []
    );

    expect(report.result.approvedCount).toBe(0);
    expect(report.result.rejected).toEqual([{ id: 'descuadrado', reason: 'Asiento no cuadra' }]);
  });

  it('rechaza un periodo cerrado', () => {
    const report = selectAutoApprovableTransactions(
      [row({ id: 'cerrado', confidence_score: 0.95 })],
      0.9,
      ['2026-01']
    );

    expect(report.result.approvedCount).toBe(0);
    expect(report.result.rejected).toEqual([{ id: 'cerrado', reason: 'Periodo cerrado' }]);
  });

  it('aprueba nómina y tipo P cuando el asiento ya cuadra', () => {
    const report = selectAutoApprovableTransactions(
      [
        row({
          id: 'nomina',
          confidence_score: 0.95,
          is_nomina: true,
        }),
        row({
          id: 'tipo-p',
          confidence_score: 0.92,
          is_nomina: false,
          cfdi_tipo_comprobante: 'P',
          asiento_devengo: undefined,
          asiento_liquidacion: balanced('tipo-p'),
        }),
      ],
      0.9,
      []
    );

    expect(report.approved.map((item) => item.id)).toEqual(['nomina', 'tipo-p']);
    expect(report.result.approvedCount).toBe(2);
    const fields = toAutoApprovalFields();
    expect(fields).toEqual({ status: 'conciliado', aprobado_por: 'auto_confidence' });
    expect(Object.keys(fields).sort()).toEqual(['aprobado_por', 'status']);
    expect(fields).not.toHaveProperty('account_code');
    expect(fields).not.toHaveProperty('asiento_devengo');
  });

  it('el umbral 0 aprueba la confianza en cero y el umbral 1 solo la confianza exacta', () => {
    const open = selectAutoApprovableTransactions(
      [
        row({ id: 'cero', confidence_score: 0 }),
        row({ id: 'media', confidence_score: 0.2 }),
        row({ id: 'nula', confidence_score: null }),
      ],
      0,
      []
    );
    expect(open.approved.map((item) => item.id)).toEqual(['cero', 'media']);

    const strict = selectAutoApprovableTransactions(
      [
        row({ id: 'plena', confidence_score: 1 }),
        row({ id: 'casi', confidence_score: 0.99 }),
      ],
      1,
      []
    );
    expect(strict.approved.map((item) => item.id)).toEqual(['plena']);
    expect(strict.result.rejected).toEqual([
      { id: 'casi', reason: 'Confianza por debajo del umbral' },
    ]);
  });

  it('no aprueba nada cuando no hay elegibles', () => {
    const report = selectAutoApprovableTransactions([], 0.9, []);
    expect(report.result).toEqual({ approvedCount: 0, rejectedCount: 0, rejected: [] });
    expect(report.approved).toEqual([]);
  });
});

describe('assertApprovalThreshold', () => {
  it('acepta 0 y 1 y rechaza lo que queda fuera', () => {
    expect(() => assertApprovalThreshold(0)).not.toThrow();
    expect(() => assertApprovalThreshold(1)).not.toThrow();
    expect(() => assertApprovalThreshold(0.9)).not.toThrow();
    expect(() => assertApprovalThreshold(1.1)).toThrow('El umbral debe estar entre 0 y 1.');
    expect(() => assertApprovalThreshold(-0.01)).toThrow('El umbral debe estar entre 0 y 1.');
    expect(resolveApprovalThreshold(undefined)).toBe(0.9);
    expect(resolveApprovalThreshold(1.5)).toBe(0.9);
    expect(resolveApprovalThreshold(0.85)).toBe(0.85);
  });
});
