/**
 * Copia packages/sat-contracts → functions/src/contracts (una sola fuente de verdad).
 * Uso: node scripts/sync-sat-contracts.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'packages/sat-contracts/src/index.ts');
const dest = join(root, 'functions/src/contracts/index.ts');
const body = readFileSync(src, 'utf8');
const banner = `/**
 * AUTO-GENERADO desde packages/sat-contracts/src/index.ts
 * No editar a mano. Ejecutar: npm run sync:sat-contracts
 */

`;
writeFileSync(dest, banner + body, 'utf8');
console.log('Synced sat-contracts → functions/src/contracts/index.ts');
