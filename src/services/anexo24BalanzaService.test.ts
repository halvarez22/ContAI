import { describe, expect, it } from 'vitest';
import type { ReportRow, TrialBalanceReport } from '../types/financialReports';
import type { Anexo24BalanzaInput } from '../types/anexo24Balanza';
import { buildAnexo24Balanza } from './anexo24BalanzaService';
import { balanzaToXml } from './anexo24BalanzaXml';

const RFC = 'AAA010101AAA';

function row(partial: Partial<ReportRow> & Pick<ReportRow, 'account_code'>): ReportRow {
  return {
    account_name: 'Cuenta',
    naturaleza: 'activo',
    saldo_inicial: 0,
    cargos: 0,
    abonos: 0,
    saldo_final: 0,
    ...partial,
  };
}

function report(rows: ReportRow[]): TrialBalanceReport {
  return {
    periodKey: '2026-01',
    rows,
    anomalies: [],
    total_cargos: 0,
    total_abonos: 0,
    is_balanced: true,
    truncated: false,
    sin_devengo: 0,
  };
}

function input(rows: ReportRow[]): Anexo24BalanzaInput {
  return { organizationRfc: RFC, year: 2026, monthIndex: 0, trialBalance: report(rows) };
}

describe('buildAnexo24Balanza', () => {
  it('detiene el archivo si la cuenta con saldo no tiene agrupador', () => {
    const result = buildAnexo24Balanza(
      input([row({ account_code: '601.99', cargos: 100, abonos: 100 })])
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cuentas).toEqual([]);
    expect(result.blocked[0]?.reason).toBe(
      'La cuenta 601.99 no tiene código agrupador válido del SAT.'
    );
  });

  it('omite la cuenta en cero y escribe 1000 como 1000.00', () => {
    const result = buildAnexo24Balanza(
      input([
        row({ account_code: '401.01', naturaleza: 'ingreso' }),
        row({ account_code: '102.01', cargos: 1000, saldo_final: 1000 }),
        row({
          account_code: '105.01',
          abonos: 1000,
          saldo_final: -1000,
          naturaleza: 'activo',
        }),
      ])
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cuentas.map((cuenta) => cuenta.numCta)).toEqual(['102.01', '105.01']);
    const xml = balanzaToXml(result).text;
    expect(xml).toContain('Debe="1000.00"');
    expect(xml).not.toContain('NumCta="401.01"');
    expect(xml).not.toContain('CodAgrup');
    expect(xml).toContain('TipoEnvio="N"');
  });

  it('no modifica el reporte congelado', () => {
    const trialBalance = report([
      row({ account_code: '102.01', cargos: 50, saldo_final: 50 }),
      row({ account_code: '201.01', naturaleza: 'pasivo', abonos: 50, saldo_final: -50 }),
    ]);
    const before = structuredClone(trialBalance);
    Object.freeze(trialBalance);
    Object.freeze(trialBalance.rows);
    for (const item of trialBalance.rows) Object.freeze(item);
    const result = buildAnexo24Balanza({
      organizationRfc: RFC,
      year: 2026,
      monthIndex: 0,
      trialBalance,
    });
    expect(trialBalance).toEqual(before);
    expect(result.ok).toBe(true);
  });

  it('detiene el archivo si los cargos no igualan los abonos', () => {
    const result = buildAnexo24Balanza(
      input([row({ account_code: '102.01', cargos: 100, abonos: 90, saldo_final: 10 })])
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('La balanza no cuadra. Diferencia: 10.00.');
    expect(result.cuentas).toEqual([]);
  });
});
