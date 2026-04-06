/**
 * One-off: dump sheet names and first rows from data/*.xlsx
 * Run: node scripts/inspect-excel-data.mjs
 */
import * as XLSX from 'xlsx';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const files = (await readdir(dataDir)).filter((f) => f.endsWith('.xlsx'));
for (const name of files) {
  const buf = await readFile(join(dataDir, name));
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  console.log('\n========', name, '========');
  console.log('Sheets:', wb.SheetNames.join(' | '));
  for (const sn of wb.SheetNames.slice(0, 8)) {
    const sh = wb.Sheets[sn];
    const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    const preview = rows.slice(0, 12);
    console.log('\n---', sn, `(first ${preview.length} rows) ---`);
    for (const row of preview) {
      console.log(JSON.stringify(row));
    }
  }
}
