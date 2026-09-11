import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_SEED_ACCOUNT_GASTOS,
  DEMO_SEED_ANCHORS,
  DEMO_SEED_SOURCE,
} from '../config/demoSeed';
import { DEFAULT_NOMINA_ACCOUNT_NAME } from '../config/nominaDefaults';
import {
  buildDemoSeedBundle,
  commitDemoSeed,
  filterDemoSeedPurgeIds,
  isDemoSeedEnvEnabled,
} from './demoSeedService';
import { parseBankCsv } from './bankReconciliationService';
import {
  buildNominaPolizaLinesForTx,
  buildPolizaDiarioTxt,
  isPolizaEligible,
} from './polizaExportService';
import type { PolizaTxInput } from '../types/polizaExport';
import { buildTaxPreview } from './taxCalculatorService';

describe('isDemoSeedEnvEnabled', () => {
  it('solo true cuando el flag es exactamente true', () => {
    expect(isDemoSeedEnvEnabled('true')).toBe(true);
    expect(isDemoSeedEnvEnabled(true)).toBe(true);
    expect(isDemoSeedEnvEnabled('false')).toBe(false);
    expect(isDemoSeedEnvEnabled(undefined)).toBe(false);
    expect(isDemoSeedEnvEnabled('1')).toBe(false);
  });
});

describe('filterDemoSeedPurgeIds (purge safety)', () => {
  it('no incluye TX reales (source manual) del mismo periodo/org', () => {
    const docs = [
      {
        id: 'demo-1',
        organization_id: 'org_a',
        source: 'demo_seed',
        demo_period_key: '2026-09',
      },
      {
        id: 'real-manual',
        organization_id: 'org_a',
        source: 'manual',
        demo_period_key: '2026-09',
      },
      {
        id: 'demo-other-period',
        organization_id: 'org_a',
        source: 'demo_seed',
        demo_period_key: '2026-08',
      },
      {
        id: 'demo-other-org',
        organization_id: 'org_b',
        source: 'demo_seed',
        demo_period_key: '2026-09',
      },
    ];
    const ids = filterDemoSeedPurgeIds(docs, 'org_a', '2026-09');
    expect(ids).toEqual(['demo-1']);
    expect(ids).not.toContain('real-manual');
  });
});

describe('buildDemoSeedBundle', () => {
  const base = {
    organizationId: 'org_demo',
    usuarioId: 'user_1',
    periodKey: '2026-09',
    demoBatchId: 'batch-fixed-uuid',
  };

  it('genera ≥15 TX con source/period/batch y anclas', () => {
    const bundle = buildDemoSeedBundle(base);
    expect(bundle.transactions.length).toBeGreaterThanOrEqual(15);
    expect(
      bundle.transactions.every(
        (t) =>
          t.source === DEMO_SEED_SOURCE &&
          t.demo_period_key === '2026-09' &&
          t.demo_batch_id === 'batch-fixed-uuid'
      )
    ).toBe(true);

    const nomA = bundle.transactions.find(
      (t) => t.is_nomina && t.proveedor === 'Juan Pérez'
    );
    expect(nomA?.monto).toBe(DEMO_SEED_ANCHORS.nominaA.neto);
    expect(nomA?.nomina_total_percepciones).toBe(DEMO_SEED_ANCHORS.nominaA.bruto);
    expect(nomA?.nomina_isr_retained).toBe(DEMO_SEED_ANCHORS.nominaA.isr);
    expect(nomA?.nomina_imss_retained).toBe(DEMO_SEED_ANCHORS.nominaA.imss);
  });

  it('TX showcase IA: account_source ai y confidence 0.92', () => {
    const bundle = buildDemoSeedBundle(base);
    const ai = bundle.transactions.find(
      (t) => t.account_source === 'ai' && t.confidence_score === 0.92
    );
    expect(ai).toBeDefined();
    expect(ai?.account_name).toBe(DEMO_SEED_ACCOUNT_GASTOS);
    expect(ai?.status).toBe('revisión');
  });

  it('CSV gemelo parseable por parseBankCsv', () => {
    const bundle = buildDemoSeedBundle(base);
    const parsed = parseBankCsv(bundle.bankCsvText);
    expect(parsed.errors.length).toBe(0);
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it('elegibles póliza > 0 y póliza balancea; nómina 4 y 3 líneas', () => {
    const bundle = buildDemoSeedBundle(base);
    const asPoliza = (t: (typeof bundle.transactions)[number]): PolizaTxInput => ({
      id: `tmp-${t.concepto}`,
      fecha: t.fecha,
      tipo: String(t.tipo),
      monto: t.monto,
      concepto: t.concepto,
      proveedor: t.proveedor,
      account_name: t.account_name,
      bank_reconciled: t.bank_reconciled,
      bank_reconcile_status: t.bank_reconcile_status,
      is_nomina: t.is_nomina,
      nomina_isr_retained: t.nomina_isr_retained,
      nomina_imss_retained: t.nomina_imss_retained,
      nomina_total_percepciones: t.nomina_total_percepciones,
    });

    const inputs = bundle.transactions.map(asPoliza);
    const eligible = inputs.filter(isPolizaEligible);
    expect(eligible.length).toBeGreaterThan(0);

    const result = buildPolizaDiarioTxt({
      transactions: inputs,
      organizationId: 'org_demo',
      periodKey: '2026-09',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalCargos).toBe(result.totalAbonos);

    const nomA = inputs.find((t) => t.proveedor === 'Juan Pérez' && t.is_nomina);
    expect(nomA).toBeDefined();
    if (!nomA) return;
    expect(buildNominaPolizaLinesForTx(nomA)).toHaveLength(4);

    const nomB = inputs.find((t) => t.proveedor === 'Ana Ruiz' && t.is_nomina);
    expect(nomB).toBeDefined();
    if (!nomB) return;
    expect(buildNominaPolizaLinesForTx(nomB)).toHaveLength(3);
    expect(nomB.account_name).toBe(DEFAULT_NOMINA_ACCOUNT_NAME);
  });

  it('Tax Preview: IVA trasladado/acreditable coherente con anclas (±0.01)', () => {
    const bundle = buildDemoSeedBundle(base);
    const monthTransactions = bundle.transactions.map((t, i) => ({
      id: `d-${i}`,
      fecha: t.fecha,
      tipo: String(t.tipo),
      monto: t.monto,
      iva_tasa: t.iva_tasa,
      egreso_acredita_iva: t.egreso_acredita_iva,
      fiscal_subtotal: t.fiscal_subtotal,
      fiscal_iva: t.fiscal_iva,
      deducible: t.deducible,
    }));
    const preview = buildTaxPreview({
      year: 2026,
      monthIndex: 8,
      monthTransactions,
      ytdTransactions: monthTransactions,
    });
    expect(preview.iva.trasladado).toBeGreaterThanOrEqual(
      DEMO_SEED_ANCHORS.ventaIva16.iva - 0.01
    );
    expect(preview.iva.acreditable).toBeGreaterThanOrEqual(
      DEMO_SEED_ANCHORS.compraIva16.iva - 0.01
    );
  });
});

describe('commitDemoSeed', () => {
  it('rechaza si el flag de entorno está off', async () => {
    const result = await commitDemoSeed(
      { organizationId: 'o', usuarioId: 'u', periodKey: '2026-09' },
      { isEnabled: () => false }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/deshabilitado/i);
  });

  it('purge solo IDs demo y crea batch cuando enabled', async () => {
    const queryIds = vi.fn().mockResolvedValue(['demo-old', 'should-not-matter']);
    const deleteIds = vi.fn().mockImplementation(async (ids: string[]) => ids.length);
    const commitBatch = vi.fn().mockResolvedValue({ ids: ['n1', 'n2'] });

    // Simula que query devolvió ids; filter los trata todos como tríada válida
    // porque commitDemoSeed re-arma candidatos con org/source/period correctos
    const result = await commitDemoSeed(
      { organizationId: 'org_a', usuarioId: 'u1', periodKey: '2026-09' },
      {
        isEnabled: () => true,
        queryIds,
        deleteIds,
        commitBatch,
        buildBundle: () =>
          buildDemoSeedBundle({
            organizationId: 'org_a',
            usuarioId: 'u1',
            periodKey: '2026-09',
            demoBatchId: 'b1',
          }),
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(queryIds).toHaveBeenCalledWith('org_a', '2026-09', DEMO_SEED_SOURCE);
    expect(deleteIds).toHaveBeenCalled();
    const deletedArg = deleteIds.mock.calls[0]?.[0] as string[];
    expect(deletedArg).toEqual(['demo-old', 'should-not-matter']);
    expect(commitBatch).toHaveBeenCalled();
    expect(result.createdCount).toBe(2);
    expect(result.purgedCount).toBe(2);
  });
});
