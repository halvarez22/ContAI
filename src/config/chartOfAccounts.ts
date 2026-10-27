/**
 * Semilla v1 autorizada (Anexo 24 RMF 2026).
 * Los nombres de ContAI no cambian: el demo y la nómina los persisten así.
 */

import type { CatalogAccount } from '../types/chartOfAccounts';

export const PROVISIONAL_INGRESO_CODE = '401.01';
export const PROVISIONAL_EGRESO_CODE = '601.84';

/** Contrapartidas y IVA del devengo (Anexo 24). El nombre sale del catálogo activo. */
export const ACCRUAL_CLIENTES_CODE = '105.01';
export const ACCRUAL_PROVEEDORES_CODE = '201.01';
export const ACCRUAL_BANCOS_CODE = '102.01';
export const ACCRUAL_IVA_TRASLADADO_CODE = '209.01';
export const ACCRUAL_IVA_ACREDITABLE_CODE = '119.01';

const SEED: readonly CatalogAccount[] = [
  { code: '102.01', name: 'Bancos', sat_name: 'Bancos nacionales', naturaleza: 'activo', activa: true },
  { code: '105.01', name: 'Clientes', sat_name: 'Clientes nacionales', naturaleza: 'activo', activa: true },
  {
    code: '119.01',
    name: 'IVA acreditable',
    sat_name: 'IVA pendiente de pago',
    naturaleza: 'iva',
    tipo_iva: 'acreditable',
    activa: true,
  },
  {
    code: '118.01',
    name: 'IVA acreditable pagado',
    sat_name: 'IVA acreditable pagado',
    naturaleza: 'iva',
    tipo_iva: 'acreditable',
    activa: true,
  },
  { code: '201.01', name: 'Proveedores', sat_name: 'Proveedores nacionales', naturaleza: 'pasivo', activa: true },
  {
    code: '209.01',
    name: 'IVA trasladado',
    sat_name: 'IVA trasladado no cobrado',
    naturaleza: 'iva',
    tipo_iva: 'trasladado',
    activa: true,
  },
  {
    code: '208.01',
    name: 'IVA trasladado cobrado',
    sat_name: 'IVA trasladado cobrado',
    naturaleza: 'iva',
    tipo_iva: 'trasladado',
    activa: true,
  },
  {
    code: '216.01',
    name: 'ISR por Pagar',
    sat_name: 'ISR retenido por sueldos y salarios',
    naturaleza: 'pasivo',
    activa: true,
  },
  {
    code: '216.11',
    name: 'IMSS por Pagar',
    sat_name: 'Retenciones de IMSS a los trabajadores',
    naturaleza: 'pasivo',
    activa: true,
  },
  {
    code: '301.01',
    name: 'Capital Social',
    sat_name: 'Capital social',
    naturaleza: 'capital',
    activa: true,
  },
  {
    code: '401.01',
    name: 'Ingresos por Ventas',
    sat_name: 'Ventas y/o servicios gravados a la tasa general',
    naturaleza: 'ingreso',
    activa: true,
  },
  {
    code: '115.02',
    name: 'Insumos y Mercancías',
    sat_name: 'Materia prima y materiales',
    naturaleza: 'activo',
    activa: true,
  },
  {
    code: '601.84',
    name: 'Gastos Operativos',
    sat_name: 'Otros gastos generales',
    naturaleza: 'gasto',
    activa: true,
  },
  {
    code: '601.49',
    name: 'Viáticos y Viajes',
    sat_name: 'Viáticos y gastos de viaje',
    naturaleza: 'gasto',
    activa: true,
  },
  {
    code: '601.61',
    name: 'Marketing y Publicidad',
    sat_name: 'Propaganda y publicidad',
    naturaleza: 'gasto',
    activa: true,
  },
  {
    code: '601.34',
    name: 'Servicios Profesionales',
    sat_name: 'Honorarios a PF nacionales',
    naturaleza: 'gasto',
    activa: true,
  },
  {
    code: '601.01',
    name: 'Gastos de Nómina',
    sat_name: 'Sueldos y salarios',
    naturaleza: 'gasto',
    activa: true,
  },
];

/** Códigos de la semilla. Cualquier desviación es hallazgo crítico. */
export const ANEXO24_SEED_CODES: readonly string[] = SEED.map((a) => a.code);

export function getChartOfAccountsSeed(): CatalogAccount[] {
  return SEED.map((a) => ({ ...a }));
}

export function seedAccountByContaiName(name: string): CatalogAccount {
  const found = SEED.find((a) => a.name === name);
  if (!found) {
    throw new Error(`La semilla no tiene la cuenta «${name}».`);
  }
  return { ...found };
}

/** Cuenta activa del catálogo que conserva el nombre y la naturaleza de la semilla. */
export function activeSeedAccount(
  chart: readonly CatalogAccount[],
  seedName: string
): CatalogAccount | undefined {
  const seed = seedAccountByContaiName(seedName);
  return chart.find(
    (account) =>
      account.activa !== false &&
      account.name === seed.name &&
      account.naturaleza === seed.naturaleza
  );
}
