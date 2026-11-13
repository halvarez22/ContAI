import type { CfdiFiscalFace } from '../../types/cfdiFiscalFace';
import { formatCfdiFiscalFace } from '../../lib/cfdiFiscalFace';

type InvoiceFiscalFactsProps = {
  face: CfdiFiscalFace | null | undefined;
};

/** Solo pinta el texto que devuelve el lib. No lee el XML ni calcula tasas. */
export function InvoiceFiscalFacts({ face }: InvoiceFiscalFactsProps) {
  if (!face) return null;
  const text = formatCfdiFiscalFace(face);
  if (!text) return null;
  return <p className="text-xs text-ink-muted whitespace-pre-line mt-1">{text}</p>;
}
