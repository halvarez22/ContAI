import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import type { TransactionDoc } from '../types/transaction';
import type { HistoricalReconstructionDraft } from '../types/missingJournal';
import * as accountMapping from './accountMappingService';
import * as accrualPosting from './accrualPostingService';
import { buildAccrualJournalEntry, journalEntryBalances } from './journalEntryService';
import {
  MISSING_JOURNAL_ACCOUNT,
  MISSING_JOURNAL_TIPO_P,
  reconstructMissingJournals,
  toHistoricalReconstructionDraft,
  type ReconstructOptions,
} from './missingJournalService';

vi.mock('./auditService', () => ({
  logAuditEntry: vi.fn(async () => undefined),
}));

const chart = getChartOfAccountsSeed();

function options(): ReconstructOptions {
  return {
    organizationId: 'org-1',
    periodosCerrados: [],
    accounts: chart,
    rules: [],
    atajoPueBancos: false,
    classify: async () => undefined,
  };
}

function draft(over: Partial<HistoricalReconstructionDraft> = {}): HistoricalReconstructionDraft {
  return {
    id: 'tx-1',
    fecha: '2026-03-15T12:00:00.000Z',
    tipo: 'ingreso',
    monto: 1160,
    concepto: 'Venta mostrador',
    proveedor: 'Público',
    moneda: 'MXN',
    fiscal_subtotal: 1000,
    fiscal_iva: 160,
    is_nomina: false,
    total_percepciones: null,
    isr_retained: null,
    imss_retained: null,
    account_code: '401.01',
    account_name: 'Ingresos por Ventas',
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reconstructMissingJournals', () => {
  it('omite el movimiento que ya tiene un asiento que cuadra', async () => {
    const built = buildAccrualJournalEntry(
      {
        id: 'tx-1',
        tipo: 'ingreso',
        monto: 1160,
        fecha: '2026-03-15T12:00:00.000Z',
        fiscal_subtotal: 1000,
        fiscal_iva: 160,
        account_code: '401.01',
      },
      chart,
      false
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const post = vi.spyOn(accrualPosting, 'postClassifiedAccrual');
    const plan = await reconstructMissingJournals(
      [draft({ asiento_devengo: built.entry })],
      options()
    );
    expect(plan.omitted).toBe(1);
    expect(plan.generated).toBe(0);
    expect(plan.updates).toEqual([]);
    expect(post).not.toHaveBeenCalled();
    expect(journalEntryBalances(built.entry)).toBe(true);
  });

  it('no arma la liquidación de un tipo P y deja el motivo exacto', async () => {
    const post = vi.spyOn(accrualPosting, 'postClassifiedAccrual');
    const decide = vi.spyOn(accountMapping, 'decideAccount');
    const plan = await reconstructMissingJournals(
      [draft({ cfdi_tipo_comprobante: 'P', account_code: null })],
      options()
    );
    expect(plan.reasons).toEqual([MISSING_JOURNAL_TIPO_P]);
    expect(plan.reasons[0]).toBe(
      'No se puede reconstruir la liquidación: el complemento de pago no está guardado'
    );
    expect(plan.updates[0]?.payload.asiento_devengo).toBeUndefined();
    expect(plan.updates[0]?.payload.status).toBe('revisión');
    expect(plan.notices[0]).toContain('Venta mostrador');
    expect(post).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
  });

  it('no genera un asiento provisional si la cuenta es de respaldo', async () => {
    const post = vi.spyOn(accrualPosting, 'postClassifiedAccrual');
    vi.spyOn(accountMapping, 'decideAccount').mockResolvedValue({
      account_code: '401.01',
      account_name: 'Ingresos por Ventas',
      account_source: 'manual_fallback',
      confidence_score: 0,
      requires_human_approval: true,
      decision: 'approve_with_account',
      reason: 'provisional',
    });
    const plan = await reconstructMissingJournals(
      [draft({ account_code: null, account_name: null })],
      options()
    );
    expect(plan.reasons).toEqual([MISSING_JOURNAL_ACCOUNT]);
    expect(plan.updates[0]?.payload.asiento_devengo).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('no genera asiento si la clasificación pide revisión humana', async () => {
    const post = vi.spyOn(accrualPosting, 'postClassifiedAccrual');
    vi.spyOn(accountMapping, 'decideAccount').mockResolvedValue({
      account_code: '401.01',
      account_name: 'Ingresos por Ventas',
      account_source: 'ai',
      confidence_score: 0.4,
      requires_human_approval: true,
      decision: 'review',
      reason: 'duda',
    });
    const plan = await reconstructMissingJournals(
      [draft({ account_code: null, account_name: null })],
      options()
    );
    expect(plan.reasons).toEqual(['Falta clasificación de cuenta válida']);
    expect(post).not.toHaveBeenCalled();
  });

  it('no toca un movimiento de periodo cerrado', async () => {
    const post = vi.spyOn(accrualPosting, 'postClassifiedAccrual');
    const plan = await reconstructMissingJournals(
      [draft({ fecha: '2026-01-15T12:00:00.000Z' })],
      { ...options(), periodosCerrados: ['2026-01'] }
    );
    expect(plan.updates).toEqual([]);
    expect(plan.generated).toBe(0);
    expect(plan.notices[0]).toContain('Periodo cerrado');
    expect(post).not.toHaveBeenCalled();
  });

  it('arma el devengo comercial con el generador existente', async () => {
    const plan = await reconstructMissingJournals([draft()], options());
    expect(plan.generated).toBe(1);
    expect(plan.updates[0]?.payload.status).toBeUndefined();
    const entry = plan.updates[0]?.payload.asiento_devengo;
    expect(entry?.lines.map((line) => [line.tipo, line.account_code, line.monto])).toEqual([
      ['cargo', '105.01', 1160],
      ['abono', '401.01', 1000],
      ['abono', '209.01', 160],
    ]);
    if (entry) expect(journalEntryBalances(entry)).toBe(true);
  });

  it('acepta IVA en cero y arma el asiento', async () => {
    const plan = await reconstructMissingJournals(
      [draft({ monto: 500, fiscal_subtotal: 500, fiscal_iva: 0 })],
      options()
    );
    expect(plan.generated).toBe(1);
    expect(plan.updates[0]?.payload.asiento_devengo?.lines).toHaveLength(2);
  });

  it('deja en revisión la fila comercial sin subtotal ni IVA', async () => {
    const post = vi.spyOn(accrualPosting, 'postClassifiedAccrual');
    const plan = await reconstructMissingJournals(
      [draft({ fiscal_subtotal: null, fiscal_iva: null })],
      options()
    );
    expect(plan.review).toBe(1);
    expect(plan.notices[0]).toContain('Faltan el subtotal y el IVA');
    expect(post).not.toHaveBeenCalled();
  });

  it('arma la nómina con el mismo generador', async () => {
    const plan = await reconstructMissingJournals(
      [
        draft({
          tipo: 'egreso',
          monto: 8600,
          concepto: 'Nómina quincenal',
          is_nomina: true,
          account_code: null,
          total_percepciones: 10000,
          isr_retained: 1000,
          imss_retained: 400,
          fiscal_subtotal: null,
          fiscal_iva: null,
        }),
      ],
      options()
    );
    expect(plan.generated).toBe(1);
    const lines = plan.updates[0]?.payload.asiento_devengo?.lines ?? [];
    expect(lines).toHaveLength(4);
    expect(lines.some((line) => line.account_code === '601.01')).toBe(true);
  });
});

describe('toHistoricalReconstructionDraft', () => {
  it('conserva el IVA en cero y no convierte un importe ausente en cero', () => {
    const tx: TransactionDoc = {
      id: 'tx-9',
      tipo: 'ingreso',
      monto: 500,
      concepto: 'Venta',
      fecha: '2026-03-15T12:00:00.000Z',
      fiscal_subtotal: 500,
      fiscal_iva: 0,
      is_nomina: true,
      nomina_total_percepciones: 10000,
      nomina_isr_retained: 1000,
      nomina_imss_retained: 400,
    };
    const mapped = toHistoricalReconstructionDraft(tx);
    expect(mapped?.fiscal_iva).toBe(0);
    expect(mapped?.total_percepciones).toBe(10000);
    expect(mapped?.isr_retained).toBe(1000);
    expect(mapped?.imss_retained).toBe(400);

    const missing = toHistoricalReconstructionDraft({
      ...tx,
      id: 'tx-10',
      fiscal_subtotal: undefined,
      fiscal_iva: undefined,
    });
    expect(missing?.fiscal_subtotal).toBeNull();
    expect(missing?.fiscal_iva).toBeNull();
  });
});
