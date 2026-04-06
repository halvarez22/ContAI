/**
 * Validación XML contra XSD (xmllint en WebAssembly).
 * - Intenta usar cfdv40.xsd en /public/cfdi/xsd/ si existe (con imports puede requerir más archivos).
 * - Si falla o no existe, usa esquema lite embebido (subconjunto Comprobante).
 */

import { validateXML } from 'xmllint-wasm/index-browser.mjs';
import liteXsd from '../assets/cfdi/cfdi40-comprobante-lite.xsd?raw';

export type CfdiXsdMode = 'sat' | 'lite' | 'skipped';

export interface CfdiXsdValidationResult {
  valid: boolean;
  errors: string[];
  mode: CfdiXsdMode;
  /** Mensaje si no se pudo ejecutar el motor WASM */
  engineError?: string;
}

function normalizeErrors(errors: ReadonlyArray<{ message: string }>): string[] {
  return errors.map((e) => e.message).filter(Boolean);
}

/**
 * Valida el XML del CFDI contra XSD.
 * No valida sello digital ni cadena original.
 */
export async function validateCfdiXmlAgainstXsd(xmlString: string): Promise<CfdiXsdValidationResult> {
  const trimmed = xmlString.trim();
  if (!trimmed.startsWith('<?xml') && !trimmed.includes('<')) {
    return { valid: false, errors: ['Contenido no parece XML.'], mode: 'skipped' };
  }

  // 1) Intentar XSD oficial del SAT en public (usuario coloca cfdv40.xsd + dependencias)
  try {
    const satRes = await fetch('/cfdi/xsd/cfdv40.xsd', { cache: 'no-store' });
    if (satRes.ok) {
      const schemaText = await satRes.text();
      try {
        const r = await validateXML({
          xml: { fileName: 'cfdi.xml', contents: xmlString },
          schema: { fileName: 'cfdv40.xsd', contents: schemaText },
        });
        if (r.valid) {
          return { valid: true, errors: [], mode: 'sat' };
        }
        const errs = normalizeErrors(r.errors);
        const joined = errs.join(' ');
        // Imports faltantes: pasar a lite
        if (/failed to load|schemas? xml/i.test(joined) || /import/i.test(joined)) {
          /* continuar a lite */
        } else {
          return { valid: false, errors: errs.length ? errs : [r.rawOutput || 'Error de validación XSD'], mode: 'sat' };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/failed to load|I\/O|import/i.test(msg)) {
          return {
            valid: false,
            errors: [msg],
            mode: 'sat',
            engineError: msg,
          };
        }
      }
    }
  } catch {
    /* red o sin archivo */
  }

  // 2) Esquema lite embebido (siempre disponible)
  try {
    const r = await validateXML({
      xml: { fileName: 'cfdi.xml', contents: xmlString },
      schema: { fileName: 'cfdi40-comprobante-lite.xsd', contents: typeof liteXsd === 'string' ? liteXsd : String(liteXsd) },
    });
    if (r.valid) {
      return { valid: true, errors: [], mode: 'lite' };
    }
    return {
      valid: false,
      errors: normalizeErrors(r.errors).length ? normalizeErrors(r.errors) : [r.rawOutput || 'No cumple esquema lite'],
      mode: 'lite',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      errors: [`No se pudo ejecutar validación XSD: ${msg}`],
      mode: 'skipped',
      engineError: msg,
    };
  }
}
