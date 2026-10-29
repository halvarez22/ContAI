import { describe, expect, it } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import type { TransactionDraft } from '../lib/excelContaiImport';
import { buildAccrualJournalEntry, journalEntryBalances } from './journalEntryService';
import {
  assessExcelRow,
  excelRowReason,
  toAccrualDraft,
  toExcelRowDraft,
} from './excelImportService';

const chart = getChartOfAccountsSeed();

function source(over: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    tipo: 'ingreso',
    monto: 1160,
    moneda: 'MXN',
    concepto: 'Venta',
    proveedor: 'Cliente',
    fecha: '2026-03-15T12:00:00.000Z',
    status: 'conciliado',
    rowIndex: 15,
    tags: ['import-excel'],
    fiscal_subtotal: 1000,
    fiscal_iva: 160,
    ...over,
  };
}

describe('assessExcelRow', () => {
  it('omite la fila de un periodo cerrado antes de armar el asiento', () => {
    const row = toExcelRowDraft(source({ fecha: '2026-01-15T12:00:00.000Z', rowIndex: 8 }));
    const assessment = assessExcelRow(row, ['2026-01']);
    expect(assessment.outcome).toBe('closed');
    if (assessment.outcome !== 'closed') return;
    expect(assessment.reason).toBe('Fila 8: Periodo cerrado');
    expect(assessment.reason).toBe(excelRowReason(8, 'Periodo cerrado'));
  });

  it('exige subtotal e IVA y nombra la fila 15', () => {
    const row = toExcelRowDraft(source({ fiscal_subtotal: undefined, fiscal_iva: undefined }));
    const assessment = assessExcelRow(row, []);
    expect(assessment.outcome).toBe('missing_fiscal');
    if (assessment.outcome !== 'missing_fiscal') return;
    expect(assessment.reason).toBe('Fila 15: Faltan subtotal e IVA para generar el devengo');
  });

  it('el periodo cerrado gana aunque falten subtotal e IVA', () => {
    const row = toExcelRowDraft(
      source({
        fecha: '2026-01-15T12:00:00.000Z',
        rowIndex: 4,
        fiscal_subtotal: undefined,
        fiscal_iva: undefined,
      })
    );
    const assessment = assessExcelRow(row, ['2026-01']);
    expect(assessment).toEqual({ outcome: 'closed', reason: 'Fila 4: Periodo cerrado' });
  });

  it('acepta IVA en cero cuando el importe está presente', () => {
    const row = toExcelRowDraft(source({ fiscal_subtotal: 500, fiscal_iva: 0, monto: 500 }));
    expect(assessExcelRow(row, [])).toEqual({ outcome: 'ready' });
  });

  it('deja lista la fila cuando el periodo está abierto y hay importes', () => {
    const row = toExcelRowDraft(source());
    expect(assessExcelRow(row, ['2026-01'])).toEqual({ outcome: 'ready' });
  });
});

describe('toAccrualDraft', () => {
  it('el devengo de la fila lo arma el mismo generador del CFDI', () => {
    const row = toExcelRowDraft(source());
    const draft = toAccrualDraft(row, 'tx-excel', '401.01');
    const result = buildAccrualJournalEntry(draft, chart, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines.map((line) => [line.tipo, line.account_code, line.monto])).toEqual([
      ['cargo', '105.01', 1160],
      ['abono', '401.01', 1000],
      ['abono', '209.01', 160],
    ]);
    expect(journalEntryBalances(result.entry)).toBe(true);
  });

  it('rechaza un índice de fila que no es base 1', () => {
    expect(() => toExcelRowDraft(source({ rowIndex: 0 }))).toThrow(/índice/);
  });
});
