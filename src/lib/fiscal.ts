/**
 * Campos fiscales v1 (México / SAT) — registro interno sin timbrado.
 * `monto` en transacciones = total de la operación (incluye IVA cuando aplica).
 */

export type IvaTasaCode = 'exento' | '0' | '8' | '16' | 'na';

export const IVA_TASA_OPTIONS: { value: IvaTasaCode; label: string; rate: number }[] = [
  { value: 'na', label: 'Sin desglose / N/A', rate: -1 },
  { value: 'exento', label: 'Exento', rate: 0 },
  { value: '0', label: 'Tasa 0%', rate: 0 },
  { value: '8', label: 'IVA 8%', rate: 0.08 },
  { value: '16', label: 'IVA 16%', rate: 0.16 },
];

export function ivaRateFromCode(code: IvaTasaCode): number {
  const row = IVA_TASA_OPTIONS.find((o) => o.value === code);
  if (!row || row.rate < 0) return 0;
  return row.rate;
}

/** Total incluye IVA: base = total / (1+tasa), iva = total - base */
export function splitTotalWithIva(total: number, tasaCode: IvaTasaCode): { subtotal: number; iva: number } {
  const rate = ivaRateFromCode(tasaCode);
  if (total <= 0 || tasaCode === 'na' || tasaCode === 'exento') {
    return { subtotal: total, iva: 0 };
  }
  if (rate === 0 && tasaCode === '0') {
    return { subtotal: total, iva: 0 };
  }
  const subtotal = total / (1 + rate);
  const iva = total - subtotal;
  return { subtotal, iva };
}

export interface FiscalSnapshot {
  subtotal: number;
  iva: number;
  iva_tasa: IvaTasaCode;
  /** Ingreso: IVA trasladado. Egreso acreditable: IVA que puede acreditarse */
  iva_trasladado: number;
  iva_acreditable: number;
}

export function buildFiscalSnapshot(
  tipo: 'ingreso' | 'egreso',
  monto: number,
  iva_tasa: IvaTasaCode,
  egreso_acredita_iva: boolean
): FiscalSnapshot {
  const { subtotal, iva } = splitTotalWithIva(monto, iva_tasa);
  if (tipo === 'ingreso') {
    return {
      subtotal,
      iva,
      iva_tasa,
      iva_trasladado: iva,
      iva_acreditable: 0,
    };
  }
  return {
    subtotal,
    iva,
    iva_tasa,
    iva_trasladado: 0,
    iva_acreditable: egreso_acredita_iva ? iva : 0,
  };
}

export function parseIvaTasa(raw: string | null | undefined): IvaTasaCode {
  const s = String(raw || 'na').toLowerCase();
  if (s === 'exento' || s === '0' || s === '8' || s === '16' || s === 'na') return s as IvaTasaCode;
  return 'na';
}

export function parseBool(raw: string | null | undefined, defaultTrue = true): boolean {
  if (raw === null || raw === undefined) return defaultTrue;
  const v = String(raw).toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  if (v === 'true' || v === '1' || v === 'si' || v === 'sí') return true;
  return defaultTrue;
}
