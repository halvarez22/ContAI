/**
 * Constantes del Demo Seed (E14.0).
 * Datos deterministas para verificación de piloto.
 */

import type { TransactionIngestSource } from '../types/transaction';

export const DEMO_SEED_SOURCE = 'demo_seed' as const satisfies TransactionIngestSource;

export const DEMO_SEED_ENV_FLAG = 'VITE_ENABLE_DEMO_SEED';

export const DEMO_SEED_ACCOUNT_INGRESOS = 'Ingresos por Ventas';
export const DEMO_SEED_ACCOUNT_GASTOS = 'Gastos Operativos';

/** Anclas numéricas — hoja de verificación */
export const DEMO_SEED_ANCHORS = {
  nominaA: {
    neto: 8500,
    bruto: 10000,
    isr: 1200,
    imss: 300,
  },
  nominaB: {
    neto: 9700,
    isr: 1200,
    imss: 0,
  },
  ventaIva16: {
    total: 11600,
    subtotal: 10000,
    iva: 1600,
  },
  compraIva16: {
    total: 5800,
    subtotal: 5000,
    iva: 800,
  },
  aiShowcase: {
    total: 2320,
    subtotal: 2000,
    iva: 320,
    confidence: 0.92,
  },
} as const;

export const DEMO_SEED_COPY = {
  buttonLabel: 'Cargar mes demo',
  confirmMessage:
    'Se eliminarán solo movimientos previos marcados como demo de este periodo y se cargará un mes de ejemplo. No afecta Descarga SAT ni transacciones reales.',
  bannerTitle: 'Datos de demostración',
  bannerBody:
    'Este periodo incluye un mes demo. Puedes volver a cargar para resetear solo los datos demo.',
  disabledEnv:
    'Demo seed está deshabilitado por variable de entorno (VITE_ENABLE_DEMO_SEED).',
  successPrefix: 'Mes demo cargado',
} as const;
