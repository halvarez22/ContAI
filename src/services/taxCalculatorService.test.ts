import { describe, expect, it } from 'vitest';
import {
  buildTaxPreview,
  calculateLineIva,
  mapGroqTaxJson,
  roundMoney,
} from './taxCalculatorService';

describe('calculateLineIva', () => {
  it('calcula IVA 16% desde total con impuesto', () => {
    const r = calculateLineIva(1160, '16');
    expect(r.iva).toBe(160);
    expect(r.subtotal).toBe(1000);
    expect(r.tasa).toBe('16');
  });

  it('calcula IVA 8% desde total con impuesto', () => {
    const r = calculateLineIva(1080, '8');
    expect(r.iva).toBe(80);
    expect(r.subtotal).toBe(1000);
    expect(r.tasa).toBe('8');
  });

  it('IVA 0% deja iva en 0', () => {
    const r = calculateLineIva(1000, '0');
    expect(r.iva).toBe(0);
    expect(r.subtotal).toBe(1000);
  });

  it('exento deja iva en 0', () => {
    const r = calculateLineIva(500, 'exento');
    expect(r.iva).toBe(0);
    expect(r.subtotal).toBe(500);
  });

  it('entrada inválida / na no inventa IVA', () => {
    const r = calculateLineIva(1160, 'na');
    expect(r.iva).toBe(0);
    expect(r.tasa).toBe('na');
    expect(calculateLineIva(-10, '16').subtotal).toBe(0);
    expect(calculateLineIva(Number.NaN, '16').iva).toBe(0);
  });
});

describe('roundMoney', () => {
  it('redondea a 2 decimales', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
  });
});

describe('buildTaxPreview', () => {
  it('agrega IVA trasladado y acreditable del mes', () => {
    const preview = buildTaxPreview({
      year: 2026,
      monthIndex: 0,
      monthTransactions: [
        { tipo: 'ingreso', monto: 1160, iva_tasa: '16' },
        { tipo: 'ingreso', monto: 1080, iva_tasa: '8' },
        { tipo: 'egreso', monto: 1160, iva_tasa: '16', egreso_acredita_iva: true },
      ],
      ytdTransactions: [
        { tipo: 'ingreso', monto: 1160, iva_tasa: '16' },
        { tipo: 'egreso', monto: 1160, iva_tasa: '16', deducible: true },
      ],
    });

    expect(preview.iva.trasladado).toBe(240); // 160 + 80
    expect(preview.iva.acreditable).toBe(160);
    expect(preview.iva.saldoNeto).toBe(80);
    expect(preview.iva.porTasaIngreso['16']?.iva).toBe(160);
    expect(preview.iva.porTasaIngreso['8']?.iva).toBe(80);
    expect(preview.isr.baseGravableYtd).toBe(0); // 1000 - 1000
    expect(preview.disclaimer.length).toBeGreaterThan(10);
  });

  it('cuenta líneas na en warnings / lineasSinDesglose', () => {
    const preview = buildTaxPreview({
      year: 2026,
      monthIndex: 2,
      monthTransactions: [{ tipo: 'ingreso', monto: 100, iva_tasa: 'na' }],
      ytdTransactions: [],
    });
    expect(preview.iva.lineasSinDesglose).toBe(1);
    expect(preview.iva.trasladado).toBe(0);
    expect(preview.warnings.some((w) => /N\/A/i.test(w))).toBe(true);
  });
});

describe('mapGroqTaxJson', () => {
  it('mapea tax_deductible y reason desde AgentDecision-like', () => {
    const hints = mapGroqTaxJson({
      decision: 'clasificar',
      confidence_score: 0.9,
      reason: 'Gasto deducible de oficina',
      requires_human_approval: false,
      tax_deductible: true,
    });
    expect(hints.tax_deductible).toBe(true);
    expect(hints.notes).toContain('deducible');
  });

  it('entrada inválida no lanza y no inventa tasas', () => {
    expect(mapGroqTaxJson(null)).toEqual({});
    expect(mapGroqTaxJson('x')).toEqual({});
    expect(mapGroqTaxJson({ tax_deductible: 'yes' })).toEqual({});
  });
});
