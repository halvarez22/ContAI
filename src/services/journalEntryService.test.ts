import { describe, expect, it } from 'vitest';
import { activeSeedAccount, getChartOfAccountsSeed } from '../config/chartOfAccounts';
import {
  DEFAULT_NOMINA_ACCOUNT_CODE,
  DEFAULT_NOMINA_BANCOS_CODE,
  DEFAULT_NOMINA_IMSS_CODE,
  DEFAULT_NOMINA_ISR_CODE,
  NOMINA_LINE_CONCEPTO,
} from '../config/nominaDefaults';
import { isPolizaEligible } from './polizaExportService';
import {
  accrualPersistence,
  buildAccrualJournalEntry,
  buildPaymentApplicationEntry,
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

  it('la nómina de cuatro líneas cuadra con los códigos de la semilla', () => {
    const result = buildAccrualJournalEntry(
      draft({
        id: 'nom',
        tipo: 'egreso',
        monto: 8600,
        is_nomina: true,
        nomina: { total_percepciones: 10000, isr_retained: 1000, imss_retained: 400 },
      }),
      chart,
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines).toHaveLength(4);
    expect(result.entry.lines.map((item) => [item.tipo, item.account_code, item.monto])).toEqual([
      ['cargo', DEFAULT_NOMINA_ACCOUNT_CODE, 10000],
      ['abono', DEFAULT_NOMINA_ISR_CODE, 1000],
      ['abono', DEFAULT_NOMINA_IMSS_CODE, 400],
      ['abono', DEFAULT_NOMINA_BANCOS_CODE, 8600],
    ]);
    expect(result.entry.lines.every((item) => item.concepto === NOMINA_LINE_CONCEPTO)).toBe(true);
    expect(journalEntryBalances(result.entry)).toBe(true);
  });

  it('omite la línea de ISR cuando la retención es cero', () => {
    const result = buildAccrualJournalEntry(
      draft({
        id: 'nom0',
        tipo: 'egreso',
        monto: 9600,
        is_nomina: true,
        nomina: { total_percepciones: 10000, isr_retained: 0, imss_retained: 400 },
      }),
      chart,
      false
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines).toHaveLength(3);
    expect(result.entry.lines.some((item) => item.account_code === DEFAULT_NOMINA_ISR_CODE)).toBe(false);
    expect(result.entry.lines.some((item) => item.monto === 0)).toBe(false);
    expect(journalEntryBalances(result.entry)).toBe(true);
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

describe('buildPaymentApplicationEntry', () => {
  const bancos = activeSeedAccount(chart, 'Bancos');
  const clientes = activeSeedAccount(chart, 'Clientes');
  const proveedores = activeSeedAccount(chart, 'Proveedores');

  function naturalezaOf(code: string, accounts = chart) {
    return accounts.find((account) => account.code === code)?.naturaleza;
  }

  it('un cobro carga bancos y abona clientes', () => {
    const result = buildPaymentApplicationEntry(
      {
        id: 'cobro',
        monto_total: 1160,
        tipo_operacion: 'cobro',
        account_code: clientes?.code ?? '',
        fecha: '2026-03-01',
        moneda: 'MXN',
      },
      chart
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines).toEqual([
      expect.objectContaining({ tipo: 'cargo', account_code: bancos?.code, monto: 1160 }),
      expect.objectContaining({ tipo: 'abono', account_code: clientes?.code, monto: 1160 }),
    ]);
    expect(result.entry.lines).toHaveLength(2);
    expect(journalEntryBalances(result.entry)).toBe(true);
    for (const item of result.entry.lines) {
      const naturaleza = naturalezaOf(item.account_code);
      expect(naturaleza === 'ingreso' || naturaleza === 'gasto' || naturaleza === 'iva').toBe(false);
    }
  });

  it('un pago carga proveedores y abona bancos', () => {
    const result = buildPaymentApplicationEntry(
      {
        id: 'pago',
        monto_total: 580,
        tipo_operacion: 'pago',
        account_code: proveedores?.code ?? '',
        fecha: '2026-03-01',
        moneda: 'MXN',
      },
      chart
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines.map((item) => [item.tipo, item.account_code, item.monto])).toEqual([
      ['cargo', proveedores?.code, 580],
      ['abono', bancos?.code, 580],
    ]);
    expect(journalEntryBalances(result.entry)).toBe(true);
  });

  it('rechaza una cuenta de gasto', () => {
    const result = buildPaymentApplicationEntry(
      {
        id: 'gasto',
        monto_total: 100,
        tipo_operacion: 'pago',
        account_code: '601.84',
        fecha: '2026-03-01',
        moneda: 'MXN',
      },
      chart
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result).not.toHaveProperty('entry');
  });

  it('usa el código vigente del catálogo cuando la semilla ya no coincide', () => {
    const shifted = chart.map((account) => {
      if (account.name === 'Bancos') return { ...account, code: '102.99' };
      if (account.name === 'Clientes') return { ...account, code: '105.99' };
      return account;
    });
    const result = buildPaymentApplicationEntry(
      {
        id: 'shift',
        monto_total: 1160,
        tipo_operacion: 'cobro',
        account_code: '105.99',
        fecha: '2026-03-01',
        moneda: 'MXN',
      },
      shifted
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.lines.map((item) => item.account_code)).toEqual(['102.99', '105.99']);
    expect(result.entry.lines.some((item) => item.account_code === '102.01')).toBe(false);
  });
});
