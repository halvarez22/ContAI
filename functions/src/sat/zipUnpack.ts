/**
 * Desempaquetado de paquetes SAT → SatCfdiPackage[].
 * Soporta: JSON mock-bundle, ZIP real (jszip).
 * La callable/worker que lo invoca debe correr con memory ≥ 512MiB.
 */

import JSZip from 'jszip';
import type { SatCfdiPackage } from '../contracts';

export async function unpackSatPackageBuffer(
  buf: Buffer
): Promise<SatCfdiPackage[]> {
  const asText = buf.toString('utf8');
  if (asText.trimStart().startsWith('{')) {
    const parsed = JSON.parse(asText) as {
      mockZip?: boolean;
      xmls?: SatCfdiPackage[];
    };
    if (parsed.mockZip && Array.isArray(parsed.xmls)) {
      return parsed.xmls;
    }
  }

  const zip = await JSZip.loadAsync(buf);
  const out: SatCfdiPackage[] = [];
  const names = Object.keys(zip.files);
  for (const name of names) {
    const f = zip.files[name];
    if (f.dir) continue;
    if (!/\.xml$/i.test(name)) continue;
    const xmlText = await f.async('string');
    const uuidMatch = xmlText.match(/UUID="([^"]+)"/i);
    out.push({
      fileName: name.split('/').pop() || name,
      xmlText,
      uuid: uuidMatch?.[1],
    });
  }
  return out;
}

/** Crea un ZIP real en memoria (tests). */
export async function buildTestZip(
  packages: SatCfdiPackage[]
): Promise<Buffer> {
  const zip = new JSZip();
  for (const p of packages) {
    zip.file(p.fileName, p.xmlText);
  }
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}
