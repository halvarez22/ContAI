import { describe, expect, it } from 'vitest';
import { getChartOfAccountsSeed } from '../config/chartOfAccounts';
import { ANEXO24_INACTIVE_NOTICE, ANEXO24_RFC_INVALID_REASON } from '../config/anexo24';
import { accountCodeToCodAgrup, isAnexo24CodAgrup } from '../config/anexo24Mapping';
import type { CatalogAccount } from '../types/chartOfAccounts';
import { buildAnexo24Catalogo } from './anexo24CatalogoService';
import { catalogoToXml } from './anexo24CatalogoXml';

const RFC_ORG = 'AAA010101AAA';

function input(chart: readonly CatalogAccount[], rfc = RFC_ORG) {
  return { organizationRfc: rfc, year: 2026, monthIndex: 0, chart };
}

describe('accountCodeToCodAgrup', () => {
  it('mapea 102.01 al código agrupador publicado por el SAT', () => {
    expect(accountCodeToCodAgrup('102.01')).toBe('102.01');
    expect(isAnexo24CodAgrup('102.01')).toBe(true);
  });

  it('rechaza un agrupador de seis dígitos sin el punto del catálogo', () => {
    expect(accountCodeToCodAgrup('102010')).toBeNull();
    expect(isAnexo24CodAgrup('102010')).toBe(false);
    const result = buildAnexo24Catalogo(
      input([{ code: '102010', name: 'Bancos', naturaleza: 'activo', activa: true }])
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cuentas).toEqual([]);
    expect(result.blocked[0]?.reason).toBe(
      'La cuenta 102010 no tiene código agrupador válido del SAT.'
    );
  });
});

describe('buildAnexo24Catalogo', () => {
  it('no modifica el catálogo congelado y escribe NumCta y CodAgrup por separado', () => {
    const chart = getChartOfAccountsSeed();
    const before = structuredClone(chart);
    Object.freeze(chart);
    for (const account of chart) Object.freeze(account);

    const result = buildAnexo24Catalogo(input(chart));

    expect(chart).toEqual(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bancos = result.cuentas.find((cuenta) => cuenta.numCta === '102.01');
    const acreditable = result.cuentas.find((cuenta) => cuenta.numCta === '119.01');
    const trasladado = result.cuentas.find((cuenta) => cuenta.numCta === '209.01');
    expect(bancos).toMatchObject({ codAgrup: '102.01', numCta: '102.01', nivel: 1, natur: 'D' });
    expect(acreditable?.natur).toBe('D');
    expect(trasladado?.natur).toBe('A');

    const xml = catalogoToXml(result).text;
    expect(xml).toContain('CodAgrup="102.01"');
    expect(xml).toContain('NumCta="102.01"');
    expect(xml).not.toContain('SubCtaDe');
    expect(xml).not.toContain('102010');
  });

  it('detiene el archivo si una cuenta activa no tiene agrupador válido', () => {
    const chart: CatalogAccount[] = [
      ...getChartOfAccountsSeed(),
      { code: '601.99', name: 'Otra', naturaleza: 'gasto', activa: true },
    ];
    const result = buildAnexo24Catalogo(input(chart));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cuentas).toEqual([]);
    expect(result.blocked[0]?.reason).toBe('La cuenta 601.99 no tiene código agrupador válido del SAT.');
  });

  it('deja fuera la cuenta inactiva y conserva el aviso', () => {
    const chart = getChartOfAccountsSeed().map((account) =>
      account.code === '105.01' ? { ...account, activa: false } : account
    );
    const result = buildAnexo24Catalogo(input(chart));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cuentas.some((cuenta) => cuenta.numCta === '105.01')).toBe(false);
    expect(result.notices).toEqual([{ accountCode: '105.01', reason: ANEXO24_INACTIVE_NOTICE }]);
  });

  it('rechaza un RFC con formato inválido', () => {
    const result = buildAnexo24Catalogo(input(getChartOfAccountsSeed(), 'ABC123'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(ANEXO24_RFC_INVALID_REASON);
    expect(result.cuentas).toEqual([]);
  });

  it('detiene el archivo si el IVA no tiene tipo', () => {
    const result = buildAnexo24Catalogo(
      input([{ code: '119.01', name: 'IVA', naturaleza: 'iva', activa: true }])
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocked[0]?.reason).toBe('La cuenta no tiene naturaleza deudora o acreedora.');
    expect(result.blocked[0]?.accountCode).toBe('119.01');
  });

  it('detiene el archivo si dos cuentas activas comparten código', () => {
    const bancos = getChartOfAccountsSeed().find((account) => account.code === '102.01');
    expect(bancos).toBeTruthy();
    if (!bancos) return;
    const result = buildAnexo24Catalogo(input([bancos, { ...bancos, name: 'Bancos sucursal' }]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.blocked[0]?.reason).toBe('El código 102.01 está repetido.');
  });
});
