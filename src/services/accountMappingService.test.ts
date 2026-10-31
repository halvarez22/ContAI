import { describe, expect, it, vi } from 'vitest';
import { ANEXO24_SEED_CODES, getChartOfAccountsSeed } from '../config/chartOfAccounts';
import type { AgentDecision } from '../types/agentDecision';
import type {
  AccountMappingRule,
  AccountSignals,
  CatalogAccount,
} from '../types/chartOfAccounts';
import {
  assertAccount,
  assertCatalog,
  decideAccount,
  mappingRuleIssue,
  mergeMissingSeedAccounts,
  migrateLegacyNames,
  resolveEffectiveChart,
} from './accountMappingService';

const base: CatalogAccount = {
  code: '601.84',
  name: 'Gastos Operativos',
  naturaleza: 'gasto',
  activa: true,
};

function rule(
  partial: Partial<AccountMappingRule> & Pick<AccountMappingRule, 'id' | 'account_code'>
): AccountMappingRule {
  return {
    organization_id: 'org',
    priority: 10,
    enabled: true,
    match: { tipo: 'egreso' },
    ...partial,
  };
}

const signals: AccountSignals = {
  tipo: 'egreso',
  clave_prod_serv: '01010101',
  rfc_contraparte: 'XAXX010101000',
  monto: 100,
  concepto: 'Servicio',
};

describe('assertCatalog', () => {
  it('rechaza IVA sin tipo, tipo en gasto y código duplicado', () => {
    expect(
      assertAccount({ ...base, code: '119.01', naturaleza: 'iva', name: 'IVA' }).ok
    ).toBe(false);
    expect(assertAccount({ ...base, tipo_iva: 'acreditable' }).ok).toBe(false);
    const dup = assertCatalog([base, { ...base }]);
    expect(dup.ok).toBe(false);
  });
});

describe('migrateLegacyNames', () => {
  it('solo mapea nombres de la semilla', () => {
    const migrated = migrateLegacyNames([
      'Gastos Operativos',
      'Impuestos',
      'Nómina y Honorarios',
    ]);
    expect(migrated.accounts.map((a) => a.name)).toEqual(['Gastos Operativos']);
    expect(migrated.accounts[0]?.naturaleza).toBe('gasto');
    expect(migrated.pendientes).toEqual(['Impuestos', 'Nómina y Honorarios']);
  });
});

describe('match de reglas', () => {
  const chart = getChartOfAccountsSeed();

  it('gana la menor prioridad y, en empate, el id menor', async () => {
    const classify = vi.fn();
    const won = await decideAccount(
      signals,
      chart,
      [
        rule({ id: 'b', priority: 2, account_code: '601.49' }),
        rule({ id: 'a', priority: 1, account_code: '601.84' }),
        rule({ id: 'z', priority: 5, account_code: '601.61', enabled: false }),
      ],
      classify
    );
    expect(won.account_code).toBe('601.84');
    expect(won.account_source).toBe('rule');
    expect(classify).not.toHaveBeenCalled();

    const tie = await decideAccount(
      signals,
      chart,
      [
        rule({ id: 'm', priority: 1, account_code: '601.49' }),
        rule({ id: 'a', priority: 1, account_code: '601.61' }),
      ],
      classify
    );
    expect(tie.account_code).toBe('601.61');
  });

  it('el AND falla si la clave de producto no coincide', async () => {
    const classify = vi.fn(async () => undefined);
    const result = await decideAccount(
      signals,
      chart,
      [
        rule({
          id: 'k',
          account_code: '601.84',
          match: { tipo: 'egreso', clave_prod_serv: '99999999' },
        }),
      ],
      classify
    );
    expect(result.account_source).toBe('manual_fallback');
    expect(classify).toHaveBeenCalledOnce();
  });
});

describe('decideAccount', () => {
  const chart = getChartOfAccountsSeed();

  it('no manda el RFC a Groq y usa el nombre del catálogo', async () => {
    let sent: Record<string, unknown> | undefined;
    const classify = vi.fn(async (payload: Record<string, unknown>): Promise<AgentDecision> => {
      sent = payload;
      return {
        decision: 'ok',
        confidence_score: 0.8,
        reason: 'catálogo',
        requires_human_approval: false,
        account_code: '601.49',
        account_name: 'Nombre inventado por el modelo',
      };
    });
    const result = await decideAccount(signals, chart, [], classify);
    expect(result.account_source).toBe('ai');
    expect(result.account_name).toBe('Viáticos y Viajes');
    expect(sent).not.toHaveProperty('rfc_contraparte');
    expect(sent?.catalog).toEqual(expect.any(Array));
  });

  it('un código inventado cae en la provisional de egreso', async () => {
    const result = await decideAccount(
      signals,
      chart,
      [],
      async () => ({
        decision: 'mal',
        confidence_score: 0.9,
        reason: 'x',
        requires_human_approval: false,
        account_code: '999.99',
      })
    );
    expect(result.account_code).toBe('601.84');
    expect(result.account_source).toBe('manual_fallback');
    expect(result.requires_human_approval).toBe(true);
  });

  it('si Groq lanza, conserva la provisional y no pierde el movimiento', async () => {
    const result = await decideAccount(signals, chart, [], async () => {
      throw new Error('Groq caído');
    });
    expect(result.account_code).toBe('601.84');
    expect(result.account_source).toBe('manual_fallback');
  });

  it('el ingreso provisional es 401.01', async () => {
    const result = await decideAccount(
      { tipo: 'ingreso' },
      chart,
      [],
      async () => undefined
    );
    expect(result.account_code).toBe('401.01');
    expect(result.account_name).toBe('Ingresos por Ventas');
  });
});

describe('resolveEffectiveChart', () => {
  it('con org vacía devuelve la semilla', () => {
    const resolved = resolveEffectiveChart({});
    const codes = resolved.accounts.map((a) => a.code);
    expect(codes).toEqual(expect.arrayContaining([
      '102.01',
      '105.01',
      '201.01',
      '119.01',
      '118.01',
      '209.01',
      '208.01',
      '401.01',
      '601.01',
    ]));
    expect(resolved.pendientes).toEqual([]);
  });
});

describe('mappingRuleIssue', () => {
  const rule = (match: AccountMappingRule['match']): AccountMappingRule => ({
    id: 'r1',
    organization_id: 'org',
    priority: 10,
    enabled: true,
    account_code: '601.84',
    match,
  });

  it('pide al menos un filtro y rechaza clave o RFC mal formados', () => {
    expect(mappingRuleIssue(rule({}))).toBe('La regla necesita al menos un filtro.');
    expect(mappingRuleIssue(rule({ clave_prod_serv: '123' }))).toContain('8 dígitos');
    expect(mappingRuleIssue(rule({ rfc_contraparte: 'CORTO' }))).toContain('12 o 13');
    expect(mappingRuleIssue(rule({ tipo: 'egreso', clave_prod_serv: '01010101' }))).toBeNull();
  });
});

describe('semilla Anexo 24', () => {
  it('debe validar que todos los códigos de la semilla existan en el catálogo SAT y el IVA de devengo use las cuentas correctas', () => {
    const semilla = getChartOfAccountsSeed();
    semilla.forEach((c) => expect(c.code).toMatch(/^[0-9]+(\.[0-9]+)*$/));
    expect(semilla.map((c) => c.code).sort()).toEqual([...ANEXO24_SEED_CODES].sort());

    const ivaAcreditableDevengo = semilla.find(
      (c) => c.name === 'IVA acreditable' && c.tipo_iva === 'acreditable'
    );
    expect(ivaAcreditableDevengo?.code).toBe('119.01');

    const ivaTrasladadoDevengo = semilla.find(
      (c) => c.name === 'IVA trasladado' && c.tipo_iva === 'trasladado'
    );
    expect(ivaTrasladadoDevengo?.code).toBe('209.01');
  });
});

describe('mergeMissingSeedAccounts', () => {
  it('un catálogo vacío recibe la semilla completa', () => {
    const seed = getChartOfAccountsSeed();
    const result = mergeMissingSeedAccounts([]);
    expect(result.addedCount).toBe(seed.length);
    expect(result.accounts).toEqual(seed);
    expect(result.addedAccounts).toEqual(seed);
  });

  it('no modifica el arreglo ni las cuentas que recibió', () => {
    const current = getChartOfAccountsSeed().slice(0, 2).map((account) => ({ ...account }));
    const before = current.map((account) => ({ ...account }));
    const result = mergeMissingSeedAccounts(current);
    result.accounts[0].name = 'Nombre mutado';
    expect(current).toEqual(before);
    expect(current).toHaveLength(2);
  });

  it('no reescribe una cuenta que ya existe aunque el nombre sea distinto', () => {
    const current = getChartOfAccountsSeed().map((account) =>
      account.code === '105.01' ? { ...account, name: 'Clientes del despacho' } : account
    );
    const before = current.map((account) => ({ ...account }));
    const result = mergeMissingSeedAccounts(current);
    expect(result.addedCount).toBe(0);
    expect(result.accounts.find((account) => account.code === '105.01')?.name).toBe(
      'Clientes del despacho'
    );
    expect(current).toEqual(before);
  });

  it('agrega solo 301.01 y 601.49 y conserva el nombre de 105.01', () => {
    const current = getChartOfAccountsSeed()
      .filter((account) => account.code !== '301.01' && account.code !== '601.49')
      .map((account) =>
        account.code === '105.01' ? { ...account, name: 'Clientes del despacho' } : { ...account }
      );
    const result = mergeMissingSeedAccounts(current);
    expect(result.addedCount).toBe(2);
    expect(result.addedAccounts.map((account) => account.code).sort()).toEqual(['301.01', '601.49']);
    expect(result.addedAccounts.find((account) => account.code === '301.01')).toMatchObject({
      name: 'Capital Social',
      naturaleza: 'capital',
      activa: true,
    });
    expect(result.addedAccounts.find((account) => account.code === '601.49')?.name).toBe(
      'Viáticos y Viajes'
    );
    expect(result.accounts.find((account) => account.code === '105.01')?.name).toBe(
      'Clientes del despacho'
    );
  });
});
