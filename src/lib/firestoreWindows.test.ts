import { describe, it, expect } from 'vitest';
import {
  TRANSACTIONS_YTD_LIMIT,
  AUDIT_LOGS_LIMIT,
  ytdStartIso,
} from './firestoreWindows';
import {
  filterTransactionsByMonth,
  filterTransactionsYtdThroughMonth,
} from './monthlyAnalysis';
import { buildTaxPreview } from '../services/taxCalculatorService';

describe('firestoreWindows', () => {
  it('ytdStartIso es 1 ene del periodYear en ISO', () => {
    expect(ytdStartIso(2026)).toBe('2026-01-01T00:00:00.000Z');
    expect(ytdStartIso(2025)).toBe('2025-01-01T00:00:00.000Z');
  });

  it('constantes de límite de seguridad', () => {
    expect(TRANSACTIONS_YTD_LIMIT).toBe(5000);
    expect(AUDIT_LOGS_LIMIT).toBe(100);
  });
});

describe('regresión ISR YTD con ventana anual en memoria', () => {
  it('enero–mes incluye TX de meses previos del mismo año (no solo mes activo)', () => {
    const txs = [
      {
        id: 'jan',
        fecha: '2026-01-15T12:00:00.000Z',
        tipo: 'ingreso',
        monto: 1160,
        iva_tasa: '16',
        deducible: true,
      },
      {
        id: 'aug',
        fecha: '2026-08-10T12:00:00.000Z',
        tipo: 'egreso',
        monto: 1160,
        iva_tasa: '16',
        egreso_acredita_iva: true,
        deducible: true,
      },
      {
        id: 'prev-year',
        fecha: '2025-12-01T12:00:00.000Z',
        tipo: 'ingreso',
        monto: 1160,
        iva_tasa: '16',
      },
    ];

    // Simula listener YTD: solo docs con fecha >= 2026-01-01
    const ytdWindow = txs.filter((t) => t.fecha >= ytdStartIso(2026));
    expect(ytdWindow).toHaveLength(2);

    const monthOnly = filterTransactionsByMonth(ytdWindow, 2026, 7);
    expect(monthOnly.map((t) => t.id)).toEqual(['aug']);

    const ytdThroughAug = filterTransactionsYtdThroughMonth(ytdWindow, 2026, 7);
    expect(ytdThroughAug.map((t) => t.id).sort()).toEqual(['aug', 'jan']);

    const preview = buildTaxPreview({
      year: 2026,
      monthIndex: 7,
      monthTransactions: monthOnly,
      ytdTransactions: ytdThroughAug,
    });
    // IVA mes: solo aug egreso acreditable
    expect(preview.iva.acreditable).toBe(160);
    // ISR YTD: ingreso ene + egreso ago (ambos en ventana)
    expect(preview.isr.ingresosAcumulablesYtd).toBeGreaterThan(0);
    expect(ytdThroughAug.some((t) => t.id === 'jan')).toBe(true);
  });
});
