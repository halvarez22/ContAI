import { describe, expect, it } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import { isPolizaEligible } from './polizaExportService';
import {
  accrualPersistence,
  buildAccrualJournalEntry,
  formatAccrualJournalToTxt,
  journalEntryBalances,
} from './journalEntryService';
import { ATAJO_PUE_CONCEPTO } from '../types/journalEntry';
import type { AccrualDraft } from './journalEntryService';
import type { CatalogAccount } from '../types/chartOfAccounts';

const chart = getChartOfAccountsSeed();

function draft(over: Partial<AccrualDraft> & Pick<AccrualDraft, 'id' | 'tipo'>): AccrualDraft {
  return {
    monto: 1160,
    fecha: '2026-08-15T12:00:00.000Z',
    fiscal_subtotal: 1000,
    fiscal_iva: 160,
    account_code: over.tipo === 'egreso' ? '601.84' : '401.01',
    metodo_pago_sat: 'PPD',
    concepto: 'Servicio',
    proveedor: 'Acme',
    ...over,
  };
}

describe('buildAccrualJournalEntry', () => {
  it('ingreso IVA 16 %: clientes, ingreso e IVA no cobrado', () => {
    const result = buildAccrualJournalEntry(draft({ id: 'i16', tipo: 'ingreso' }), chart, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines.map((line) => [line.tipo, line.account_code, line.monto])).toEqual([
      ['cargo', '105.01', 1160],
      ['abono', '401.01', 1000],
      ['abono', '209.01', 160],
    ]);
    expect(journalEntryBalances(result.entry)).toBe(true);
  });

  it('egreso IVA 8 %: gasto, IVA pendiente y proveedores', () => {
    const result = buildAccrualJournalEntry(
      draft({
        id: 'e8',
        tipo: 'egreso',
        monto: 1080,
        fiscal_subtotal: 1000,
        fiscal_iva: 80,
        account_code: '601.84',
      }),
      chart,
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines.map((line) => [line.tipo, line.account_code, line.monto])).toEqual([
      ['cargo', '601.84', 1000],
      ['cargo', '119.01', 80],
      ['abono', '201.01', 1080],
    ]);
  });

  it('IVA 0 % no genera línea de IVA', () => {
    const result = buildAccrualJournalEntry(
      draft({
        id: 'i0',
        tipo: 'ingreso',
        monto: 1000,
        fiscal_subtotal: 1000,
        fiscal_iva: 0,
      }),
      chart,
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines).toHaveLength(2);
    expect(result.entry.lines.some((line) => line.account_code.startsWith('209'))).toBe(false);
    expect(journalEntryBalances(result.entry)).toBe(true);
  });

  it('descuadre o falta de desglose no produce asiento', () => {
    const broken = buildAccrualJournalEntry(
      draft({ id: 'bad', tipo: 'ingreso', monto: 1000, fiscal_subtotal: 1000, fiscal_iva: 160 }),
      chart,
      false
    );
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    expect(broken.reason).toMatch(/no iguala el total/);

    const missing = buildAccrualJournalEntry(
      draft({ id: 'miss', tipo: 'egreso', fiscal_subtotal: undefined, fiscal_iva: undefined }),
      chart,
      false
    );
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(accrualPersistence(missing, 'conciliado', null).status).toBe('revisión');
  });

  it('el atajo PUE usa Bancos y el PPD no', () => {
    const pue = buildAccrualJournalEntry(
      draft({ id: 'pue', tipo: 'ingreso', metodo_pago_sat: 'PUE' }),
      chart,
      true
    );
    expect(pue.ok).toBe(true);
    if (!pue.ok) return;
    expect(pue.entry.lines[0]).toMatchObject({
      account_code: '102.01',
      tipo: 'cargo',
      concepto: ATAJO_PUE_CONCEPTO,
    });
    expect(pue.entry.atajo_pue_bancos).toBe(true);

    const ppd = buildAccrualJournalEntry(
      draft({ id: 'ppd', tipo: 'egreso', metodo_pago_sat: 'PPD' }),
      chart,
      true
    );
    expect(ppd.ok).toBe(true);
    if (!ppd.ok) return;
    expect(ppd.entry.lines.at(-1)?.account_code).toBe('201.01');
    expect(ppd.entry.atajo_pue_bancos).toBe(false);
  });

  it('cuenta inactiva impide el asiento', () => {
    const withoutClientes: CatalogAccount[] = chart.map((account) =>
      account.code === '105.01' ? { ...account, activa: false } : account
    );
    const result = buildAccrualJournalEntry(draft({ id: 'off', tipo: 'ingreso' }), withoutClientes, false);
    expect(result.ok).toBe(false);
  });

  it('la nómina no arma devengo', () => {
    const result = buildAccrualJournalEntry(
      draft({ id: 'nom', tipo: 'egreso', is_nomina: true, account_code: '601.01' }),
      chart,
      false
    );
    expect(result.ok).toBe(false);
  });

  it('un asiento guardado es elegible de devengo aunque no esté conciliado', () => {
    const result = buildAccrualJournalEntry(draft({ id: 'tx-1', tipo: 'ingreso' }), chart, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tx = {
      id: 'tx-1',
      fecha: '2026-08-15',
      tipo: 'ingreso',
      monto: 1160,
      account_name: 'Ingresos por Ventas',
      bank_reconciled: false,
      asiento_devengo: result.entry,
    };
    expect(isPolizaEligible(tx)).toBe(false);
    const text = formatAccrualJournalToTxt([result.entry], {
      organizationId: 'org1',
      periodKey: '2026-08',
      generatedAt: new Date('2026-08-31T00:00:00.000Z'),
      eligibleCount: 1,
      skippedCount: 0,
    });
    expect(text).toContain('# tipo=devengo');
    expect(text).toContain('105.01');
    expect(text).not.toContain('XAXX');
  });
});
