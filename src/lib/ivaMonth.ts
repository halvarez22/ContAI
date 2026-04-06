import { buildFiscalSnapshot, parseBool, parseIvaTasa, type IvaTasaCode } from './fiscal';

export interface MonthlyIvaBreakdown {
  periodo: string;
  /** IVA causado (ingresos) */
  ivaTrasladadoTotal: number;
  /** IVA acreditable (egresos marcados) */
  ivaAcreditableTotal: number;
  /** Positivo = a favor estimado del periodo (solo informativo) */
  saldoNetoIva: number;
  porTasaIngreso: Record<string, { subtotal: number; iva: number }>;
  porTasaEgresoAcred: Record<string, { subtotal: number; iva: number }>;
  lineasSinDesglose: number;
}

function keyTasa(code: IvaTasaCode): string {
  return code;
}

export function computeMonthlyIva(
  monthTransactions: any[],
  year: number,
  monthIndex: number
): MonthlyIvaBreakdown {
  const d = new Date(year, monthIndex, 1);
  const periodo = d.toLocaleString('es-MX', { month: 'long', year: 'numeric' });

  let ivaTrasladadoTotal = 0;
  let ivaAcreditableTotal = 0;
  const porTasaIngreso: Record<string, { subtotal: number; iva: number }> = {};
  const porTasaEgresoAcred: Record<string, { subtotal: number; iva: number }> = {};
  let lineasSinDesglose = 0;

  for (const tx of monthTransactions) {
    const monto = Number(tx.monto) || 0;
    const tasa = parseIvaTasa(tx.iva_tasa);
    const acredita = parseBool(tx.egreso_acredita_iva, true);
    const snap = buildFiscalSnapshot(tx.tipo === 'ingreso' ? 'ingreso' : 'egreso', monto, tasa, acredita);

    if (tasa === 'na') {
      lineasSinDesglose += 1;
      continue;
    }

    if (tx.tipo === 'ingreso') {
      ivaTrasladadoTotal += snap.iva_trasladado;
      const k = keyTasa(tasa);
      if (!porTasaIngreso[k]) porTasaIngreso[k] = { subtotal: 0, iva: 0 };
      porTasaIngreso[k].subtotal += snap.subtotal;
      porTasaIngreso[k].iva += snap.iva_trasladado;
    } else {
      ivaAcreditableTotal += snap.iva_acreditable;
      if (snap.iva_acreditable > 0) {
        const k = keyTasa(tasa);
        if (!porTasaEgresoAcred[k]) porTasaEgresoAcred[k] = { subtotal: 0, iva: 0 };
        porTasaEgresoAcred[k].subtotal += snap.subtotal;
        porTasaEgresoAcred[k].iva += snap.iva_acreditable;
      }
    }
  }

  const saldoNetoIva = ivaTrasladadoTotal - ivaAcreditableTotal;

  return {
    periodo,
    ivaTrasladadoTotal,
    ivaAcreditableTotal,
    saldoNetoIva,
    porTasaIngreso,
    porTasaEgresoAcred,
    lineasSinDesglose,
  };
}
