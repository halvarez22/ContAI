/**
 * Qué XML de una carpeta o de una selección entran a la carga.
 * El sufijo .xml no es tasa, cuenta ni modelo: vive aquí, no en src/config.
 */

const CFDI_FILE_EXTENSION = '.xml';

export type SelectedCfdiFile = {
  file: File;
  displayName: string;
};

export type CfdiSelectionRoute = 'empty' | 'preview' | 'batch';

export const EMPTY_CFDI_FOLDER_MESSAGE =
  'Esta carpeta no tiene XML. Elige la carpeta donde están los CFDI.';

export const FOLDER_PICKER_UNAVAILABLE_MESSAGE =
  'Elegir carpeta no está disponible en este navegador. Usa Cargar archivo(s) XML y marca varios.';

export const WAIT_FOR_CURRENT_LOAD_MESSAGE =
  'Espera a que termine la carga actual.';

export const REVIEWING_FOLDER_MESSAGE = 'Revisando carpeta…';

export function skippedNonXmlMessage(count: number): string {
  return `Se omitieron ${count} archivos que no son XML.`;
}

export function displayNameOfCfdiFile(file: File): string {
  const raw = (file.webkitRelativePath || '').trim() || file.name;
  return raw.replace(/\\/g, '/');
}

function isXmlName(name: string): boolean {
  return name.toLowerCase().endsWith(CFDI_FILE_EXTENSION);
}

export function selectCfdiXmlFiles(files: readonly File[]): {
  selected: SelectedCfdiFile[];
  skippedNonXml: number;
} {
  const selected: SelectedCfdiFile[] = [];
  let skippedNonXml = 0;
  for (const file of files) {
    const displayName = displayNameOfCfdiFile(file);
    if (!isXmlName(displayName)) {
      skippedNonXml += 1;
      continue;
    }
    selected.push({ file, displayName });
  }
  return { selected, skippedNonXml };
}

export function routeCfdiSelection(count: number): CfdiSelectionRoute {
  if (count <= 0) return 'empty';
  if (count === 1) return 'preview';
  return 'batch';
}

export function releaseXmlTexts(inputs: { xmlText: string }[]): void {
  for (const item of inputs) item.xmlText = '';
  inputs.length = 0;
}

export function canPickCfdiFolder(): boolean {
  if (typeof document === 'undefined') return false;
  const input = document.createElement('input');
  const supported = 'webkitdirectory' in input;
  if (!supported || typeof window.matchMedia !== 'function') return supported;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  return !(coarsePointer && noHover);
}
