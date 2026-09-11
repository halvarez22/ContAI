/**
 * Demo Seed E14.0 — bundle determinista, purge por tríada, commit vía firestoreService.
 * Sin Groq. Kill-switch: VITE_ENABLE_DEMO_SEED === 'true'.
 */

import {
  DEMO_SEED_ACCOUNT_GASTOS,
  DEMO_SEED_ACCOUNT_INGRESOS,
  DEMO_SEED_ANCHORS,
  DEMO_SEED_COPY,
  DEMO_SEED_SOURCE,
} from '../config/demoSeed';
import { DEFAULT_NOMINA_ACCOUNT_NAME } from '../config/nominaDefaults';
import { parsePeriodKey } from '../lib/periodClose';
import type {
  DemoSeedBundle,
  DemoSeedCommitResult,
  DemoSeedPurgeCandidate,
  DemoSeedTxDraft,
} from '../types/demoSeed';
import {
  commitCfdiTransactionBatch,
  deleteTransactionDocsByIds,
  queryDemoSeedTransactionIds,
} from './firestoreService';

export function isDemoSeedEnvEnabled(
  envValue: string | boolean | undefined = import.meta.env.VITE_ENABLE_DEMO_SEED
): boolean {
  return envValue === true || envValue === 'true';
}

/**
 * Selección quirúrgica de IDs a borrar.
 * Solo docs con organization_id + source === demo_seed + demo_period_key.
 */
export function filterDemoSeedPurgeIds(
  docs: ReadonlyArray<DemoSeedPurgeCandidate>,
  organizationId: string,
  periodKey: string
): string[] {
  return docs
    .filter(
      (d) =>
        d.organization_id === organizationId &&
        d.source === DEMO_SEED_SOURCE &&
        d.demo_period_key === periodKey &&
        Boolean(d.id)
    )
    .map((d) => d.id);
}

function isoDateInPeriod(periodKey: string, day: number, hour = 12): string {
  const parsed = parsePeriodKey(periodKey);
  if (!parsed) {
    throw new Error(`periodKey inválido: ${periodKey}`);
  }
  const { year, monthIndex } = parsed;
  const safeDay = Math.min(Math.max(day, 1), 28);
  const d = new Date(Date.UTC(year, monthIndex, safeDay, hour, 0, 0));
  return d.toISOString();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function baseMeta(
  organizationId: string,
  usuarioId: string,
  periodKey: string,
  demoBatchId: string
): Pick<
  DemoSeedTxDraft,
  | 'organization_id'
  | 'usuario_id'
  | 'source'
  | 'demo_period_key'
  | 'demo_batch_id'
  | 'moneda'
  | 'tags'
> {
  return {
    organization_id: organizationId,
    usuario_id: usuarioId,
    source: DEMO_SEED_SOURCE,
    demo_period_key: periodKey,
    demo_batch_id: demoBatchId,
    moneda: 'MXN',
    tags: ['demo'],
  };
}

function withBankFull<T extends { monto: number }>(
  tx: T,
  reconciled: boolean
): T & {
  bank_reconciled: boolean;
  bank_reconcile_status: 'full' | 'none';
  bank_reconciled_amount?: number;
} {
  if (!reconciled) {
    return {
      ...tx,
      bank_reconciled: false,
      bank_reconcile_status: 'none',
    };
  }
  return {
    ...tx,
    bank_reconciled: true,
    bank_reconcile_status: 'full',
    bank_reconciled_amount: tx.monto,
  };
}

export function buildDemoSeedBundle(params: {
  organizationId: string;
  usuarioId: string;
  periodKey: string;
  demoBatchId?: string;
}): DemoSeedBundle {
  const { organizationId, usuarioId, periodKey } = params;
  if (!organizationId.trim()) {
    throw new Error('organizationId requerido');
  }
  if (!usuarioId.trim()) {
    throw new Error('usuarioId requerido');
  }
  if (!parsePeriodKey(periodKey)) {
    throw new Error(`periodKey inválido: ${periodKey}`);
  }

  const demoBatchId =
    params.demoBatchId ??
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `demo-${Date.now()}`);

  const meta = baseMeta(organizationId, usuarioId, periodKey, demoBatchId);
  const A = DEMO_SEED_ANCHORS;
  const txs: DemoSeedTxDraft[] = [];

  // 1–3 ingresos ventas IVA 16%
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'ingreso',
        monto: A.ventaIva16.total,
        fiscal_subtotal: A.ventaIva16.subtotal,
        fiscal_iva: A.ventaIva16.iva,
        iva_tasa: '16',
        concepto: 'Venta demo ContAI · Factura A',
        proveedor: 'Cliente Demo Alpha',
        rfc_contraparte: 'CDA010101AAA',
        fecha: isoDateInPeriod(periodKey, 5),
        status: 'conciliado',
        account_name: DEMO_SEED_ACCOUNT_INGRESOS,
        account_source: 'manual',
        importado_cfdi: true,
        egreso_acredita_iva: false,
        deducible: false,
      },
      true
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'ingreso',
        monto: 5800,
        fiscal_subtotal: 5000,
        fiscal_iva: 800,
        iva_tasa: '16',
        concepto: 'Venta demo ContAI · Factura B',
        proveedor: 'Cliente Demo Beta',
        rfc_contraparte: 'CDB020202BBB',
        fecha: isoDateInPeriod(periodKey, 8),
        status: 'conciliado',
        account_name: DEMO_SEED_ACCOUNT_INGRESOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      true
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'ingreso',
        monto: 3480,
        fiscal_subtotal: 3000,
        fiscal_iva: 480,
        iva_tasa: '16',
        concepto: 'Venta demo ContAI · Factura C (sin conciliar)',
        proveedor: 'Cliente Demo Gamma',
        rfc_contraparte: 'CDG030303CCC',
        fecha: isoDateInPeriod(periodKey, 22),
        status: 'pendiente',
        account_name: DEMO_SEED_ACCOUNT_INGRESOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      false
    )
  );

  // 4–6 egresos gastos IVA acreditable
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: A.compraIva16.total,
        fiscal_subtotal: A.compraIva16.subtotal,
        fiscal_iva: A.compraIva16.iva,
        iva_tasa: '16',
        egreso_acredita_iva: true,
        deducible: true,
        concepto: 'Compra demo · Suministros',
        proveedor: 'Proveedor Demo Suministros',
        rfc_contraparte: 'PDS040404DDD',
        fecha: isoDateInPeriod(periodKey, 6),
        status: 'conciliado',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      true
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: 1160,
        fiscal_subtotal: 1000,
        fiscal_iva: 160,
        iva_tasa: '16',
        egreso_acredita_iva: true,
        deducible: true,
        concepto: 'Compra demo · Papelería',
        proveedor: 'Papelería Demo',
        rfc_contraparte: 'PAD050505EEE',
        fecha: isoDateInPeriod(periodKey, 9),
        status: 'conciliado',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      true
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: 2320,
        fiscal_subtotal: 2000,
        fiscal_iva: 320,
        iva_tasa: '16',
        egreso_acredita_iva: true,
        deducible: true,
        concepto: 'Compra demo · Servicios (sin conciliar)',
        proveedor: 'Servicios Demo SA',
        rfc_contraparte: 'SDS060606FFF',
        fecha: isoDateInPeriod(periodKey, 24),
        status: 'pendiente',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      false
    )
  );

  // 7 — Showcase IA (sin Groq)
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: A.aiShowcase.total,
        fiscal_subtotal: A.aiShowcase.subtotal,
        fiscal_iva: A.aiShowcase.iva,
        iva_tasa: '16',
        egreso_acredita_iva: true,
        deducible: true,
        concepto: 'Gasto demo · sugerido por IA (aprobar)',
        proveedor: 'Café y Consumibles Demo',
        rfc_contraparte: 'CCD070707GGG',
        fecha: isoDateInPeriod(periodKey, 12),
        status: 'revisión',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'ai',
        confidence_score: A.aiShowcase.confidence,
        agente_ia_decision: 'approve_with_account',
        policy_review_reason: 'Sugerencia demo: gasto operativo recurrente',
        importado_cfdi: true,
      },
      false
    )
  );

  // 8 — revisión humana (baja confianza / pendiente aprobación)
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: 1500,
        fiscal_subtotal: 1500,
        fiscal_iva: 0,
        iva_tasa: '0',
        egreso_acredita_iva: false,
        deducible: true,
        concepto: 'Gasto demo · requiere revisión humana',
        proveedor: 'Proveedor Ambiguo Demo',
        rfc_contraparte: 'PAD080808HHH',
        fecha: isoDateInPeriod(periodKey, 14),
        status: 'revisión',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'ai',
        confidence_score: 0.55,
        agente_ia_decision: 'needs_human_review',
        importado_cfdi: true,
      },
      false
    )
  );

  // 9–10 nómina 4 líneas
  const nomA = A.nominaA;
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: nomA.neto,
        concepto: `Nómina · Juan Pérez · ${periodKey}-15`,
        proveedor: 'Juan Pérez',
        rfc_contraparte: 'PEXJ850101ABC',
        fecha: isoDateInPeriod(periodKey, 15),
        status: 'conciliado',
        account_name: DEFAULT_NOMINA_ACCOUNT_NAME,
        account_source: 'nomina_default',
        is_nomina: true,
        nomina_isr_retained: nomA.isr,
        nomina_imss_retained: nomA.imss,
        nomina_total_percepciones: nomA.bruto,
        nomina_total_deducciones: round2(nomA.isr + nomA.imss),
        iva_tasa: 'na',
        egreso_acredita_iva: false,
        deducible: true,
        importado_cfdi: true,
      },
      true
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: 7200,
        concepto: `Nómina · María López · ${periodKey}-15`,
        proveedor: 'María López',
        rfc_contraparte: 'LOLM900202XYZ',
        fecha: isoDateInPeriod(periodKey, 15),
        status: 'conciliado',
        account_name: DEFAULT_NOMINA_ACCOUNT_NAME,
        account_source: 'nomina_default',
        is_nomina: true,
        nomina_isr_retained: 900,
        nomina_imss_retained: 200,
        nomina_total_percepciones: 8300,
        nomina_total_deducciones: 1100,
        iva_tasa: 'na',
        egreso_acredita_iva: false,
        deducible: true,
        importado_cfdi: true,
      },
      true
    )
  );

  // 11 nómina sin IMSS → 3 líneas
  const nomB = A.nominaB;
  const brutoB = round2(nomB.neto + nomB.isr + nomB.imss);
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: nomB.neto,
        concepto: `Nómina · Ana Ruiz · ${periodKey}-28`,
        proveedor: 'Ana Ruiz',
        rfc_contraparte: 'RUIA880303LMN',
        fecha: isoDateInPeriod(periodKey, 28),
        status: 'conciliado',
        account_name: DEFAULT_NOMINA_ACCOUNT_NAME,
        account_source: 'nomina_default',
        is_nomina: true,
        nomina_isr_retained: nomB.isr,
        nomina_imss_retained: nomB.imss,
        nomina_total_percepciones: brutoB,
        nomina_total_deducciones: nomB.isr,
        iva_tasa: 'na',
        egreso_acredita_iva: false,
        deducible: true,
        importado_cfdi: true,
      },
      true
    )
  );

  // 12–14 mix bank partial / none
  txs.push({
    ...meta,
    tipo: 'egreso',
    monto: 4000,
    fiscal_subtotal: 4000,
    fiscal_iva: 0,
    iva_tasa: '0',
    egreso_acredita_iva: false,
    deducible: true,
    concepto: 'Renta demo · parcial',
    proveedor: 'Inmobiliaria Demo',
    rfc_contraparte: 'IND090909III',
    fecha: isoDateInPeriod(periodKey, 3),
    status: 'pendiente',
    account_name: DEMO_SEED_ACCOUNT_GASTOS,
    account_source: 'manual',
    bank_reconciled: false,
    bank_reconcile_status: 'partial',
    bank_reconciled_amount: 2000,
    importado_cfdi: true,
  });
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'ingreso',
        monto: 2000,
        fiscal_subtotal: 2000,
        fiscal_iva: 0,
        iva_tasa: '0',
        concepto: 'Anticipo demo · sin conciliar',
        proveedor: 'Cliente Anticipo',
        rfc_contraparte: 'CAN101010JJJ',
        fecha: isoDateInPeriod(periodKey, 18),
        status: 'pendiente',
        account_name: DEMO_SEED_ACCOUNT_INGRESOS,
        account_source: 'manual',
      },
      false
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: 750,
        fiscal_subtotal: 750,
        fiscal_iva: 0,
        iva_tasa: 'exento',
        egreso_acredita_iva: false,
        deducible: true,
        concepto: 'Comisión bancaria demo',
        proveedor: 'Banco Demo',
        rfc_contraparte: 'BDE111111KKK',
        fecha: isoDateInPeriod(periodKey, 20),
        status: 'pendiente',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'manual',
      },
      false
    )
  );

  // 15–16 IVA 0 / exento conciliados
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: 3000,
        fiscal_subtotal: 3000,
        fiscal_iva: 0,
        iva_tasa: '0',
        egreso_acredita_iva: false,
        deducible: true,
        concepto: 'Compra tasa 0% demo',
        proveedor: 'Agro Demo',
        rfc_contraparte: 'AGD121212LLL',
        fecha: isoDateInPeriod(periodKey, 11),
        status: 'conciliado',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      true
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'egreso',
        monto: 500,
        fiscal_subtotal: 500,
        fiscal_iva: 0,
        iva_tasa: 'exento',
        egreso_acredita_iva: false,
        deducible: true,
        concepto: 'Gasto exento demo',
        proveedor: 'Educación Demo',
        rfc_contraparte: 'EDD131313MMM',
        fecha: isoDateInPeriod(periodKey, 16),
        status: 'conciliado',
        account_name: DEMO_SEED_ACCOUNT_GASTOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      true
    )
  );

  // 17–18 ingresos diversidad
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'ingreso',
        monto: 9280,
        fiscal_subtotal: 8000,
        fiscal_iva: 1280,
        iva_tasa: '16',
        concepto: 'Venta demo · Cliente Delta',
        proveedor: 'Cliente Demo Delta',
        rfc_contraparte: 'CDD141414NNN',
        fecha: isoDateInPeriod(periodKey, 7),
        status: 'conciliado',
        account_name: DEMO_SEED_ACCOUNT_INGRESOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      true
    )
  );
  txs.push(
    withBankFull(
      {
        ...meta,
        tipo: 'ingreso',
        monto: 1740,
        fiscal_subtotal: 1500,
        fiscal_iva: 240,
        iva_tasa: '16',
        concepto: 'Venta demo · Cliente Épsilon',
        proveedor: 'Cliente Demo Épsilon',
        rfc_contraparte: 'CDE151515OOO',
        fecha: isoDateInPeriod(periodKey, 25),
        status: 'pendiente',
        account_name: DEMO_SEED_ACCOUNT_INGRESOS,
        account_source: 'manual',
        importado_cfdi: true,
      },
      false
    )
  );

  const bankCsvText = buildDemoBankCsv(txs, periodKey);
  const bankCsvFileName = `banco_demo_${periodKey}.csv`;

  return {
    periodKey,
    demoBatchId,
    organizationId,
    usuarioId,
    transactions: txs,
    bankCsvText,
    bankCsvFileName,
  };
}

/** CSV gemelo: filas 1:1 de TX conciliadas full + 1 split (suma de 2 egresos no-nómina). */
export function buildDemoBankCsv(
  transactions: ReadonlyArray<DemoSeedTxDraft>,
  periodKey: string
): string {
  const lines = ['fecha,monto,descripción'];
  const full = transactions.filter(
    (t) => t.bank_reconcile_status === 'full' && t.bank_reconciled === true
  );
  for (const t of full) {
    const fecha = String(t.fecha).slice(0, 10);
    const desc = String(t.concepto || 'movimiento demo').replace(/,/g, ' ');
    lines.push(`${fecha},${Number(t.monto) || 0},${desc}`);
  }

  // Split 1↔N: abono agregado = suma de dos egresos demo sin conciliar con cuenta
  const splitCandidates = transactions.filter(
    (t) =>
      t.tipo === 'egreso' &&
      t.bank_reconcile_status === 'none' &&
      !t.is_nomina &&
      Boolean(t.account_name)
  );
  if (splitCandidates.length >= 2) {
    const a = splitCandidates[0];
    const b = splitCandidates[1];
    const sum = round2((Number(a.monto) || 0) + (Number(b.monto) || 0));
    const fecha = isoDateInPeriod(periodKey, 24).slice(0, 10);
    lines.push(`${fecha},${sum},SPEI nomina/gastos agregados demo`);
  }

  return lines.join('\n') + '\n';
}

export type CommitDemoSeedDeps = {
  isEnabled?: () => boolean;
  queryIds?: typeof queryDemoSeedTransactionIds;
  deleteIds?: typeof deleteTransactionDocsByIds;
  commitBatch?: typeof commitCfdiTransactionBatch;
  buildBundle?: typeof buildDemoSeedBundle;
};

export async function commitDemoSeed(
  params: {
    organizationId: string;
    usuarioId: string;
    periodKey: string;
  },
  deps: CommitDemoSeedDeps = {}
): Promise<DemoSeedCommitResult> {
  const isEnabled = deps.isEnabled ?? isDemoSeedEnvEnabled;
  if (!isEnabled()) {
    return { ok: false, reason: DEMO_SEED_COPY.disabledEnv };
  }

  try {
    const buildBundle = deps.buildBundle ?? buildDemoSeedBundle;
    const queryIds = deps.queryIds ?? queryDemoSeedTransactionIds;
    const deleteIds = deps.deleteIds ?? deleteTransactionDocsByIds;
    const commitBatch = deps.commitBatch ?? commitCfdiTransactionBatch;

    const bundle = buildBundle({
      organizationId: params.organizationId,
      usuarioId: params.usuarioId,
      periodKey: params.periodKey,
    });

    const toDelete = await queryIds(
      params.organizationId,
      params.periodKey,
      DEMO_SEED_SOURCE
    );
    // Defensa en profundidad: filtrar de nuevo por tríada (por si el backend devolviera más)
    const safeIds = filterDemoSeedPurgeIds(
      toDelete.map((id) => ({
        id,
        organization_id: params.organizationId,
        source: DEMO_SEED_SOURCE,
        demo_period_key: params.periodKey,
      })),
      params.organizationId,
      params.periodKey
    );
    const purgedCount = await deleteIds(safeIds);

    const { ids } = await commitBatch(
      bundle.transactions.map((payload) => ({ payload }))
    );

    return {
      ok: true,
      purgedCount,
      createdCount: ids.length,
      periodKey: bundle.periodKey,
      demoBatchId: bundle.demoBatchId,
      bankCsvText: bundle.bankCsvText,
      bankCsvFileName: bundle.bankCsvFileName,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error al cargar mes demo';
    return { ok: false, reason: message };
  }
}
