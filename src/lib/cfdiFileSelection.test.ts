/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canPickCfdiFolder,
  displayNameOfCfdiFile,
  releaseXmlTexts,
  routeCfdiSelection,
  selectCfdiXmlFiles,
} from './cfdiFileSelection';

function fileWithPath(name: string, relativePath?: string): File {
  const file = new File(['<cfdi/>'], name, { type: 'text/xml' });
  if (relativePath !== undefined) {
    Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  }
  return file;
}

describe('selectCfdiXmlFiles', () => {
  it('se queda con xml y XML, omite el PDF y normaliza la ruta', () => {
    const { selected, skippedNonXml } = selectCfdiXmlFiles([
      fileWithPath('a.xml', 'mes\\ingresos\\a.xml'),
      fileWithPath('b.XML', 'mes/egresos/b.XML'),
      fileWithPath('nota.pdf', 'mes/nota.pdf'),
      fileWithPath('suelto.xml'),
    ]);
    expect(skippedNonXml).toBe(1);
    expect(selected.map((item) => item.displayName)).toEqual([
      'mes/ingresos/a.xml',
      'mes/egresos/b.XML',
      'suelto.xml',
    ]);
  });
});

describe('displayNameOfCfdiFile', () => {
  it('usa el nombre cuando no hay ruta relativa', () => {
    expect(displayNameOfCfdiFile(fileWithPath('factura.xml'))).toBe('factura.xml');
  });
});

describe('routeCfdiSelection', () => {
  it('vacío, uno y varios', () => {
    expect(routeCfdiSelection(0)).toBe('empty');
    expect(routeCfdiSelection(1)).toBe('preview');
    expect(routeCfdiSelection(8)).toBe('batch');
  });
});

describe('releaseXmlTexts', () => {
  it('deja el texto en blanco y el arreglo en cero', () => {
    const inputs = [{ xmlText: '<cfdi/>' }, { xmlText: '<otro/>' }];
    releaseXmlTexts(inputs);
    expect(inputs).toEqual([]);
  });
});

describe('canPickCfdiFolder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLInputElement.prototype as { webkitdirectory?: boolean }).webkitdirectory;
  });

  it('un táctil sin ratón no puede elegir carpeta', () => {
    Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
      configurable: true,
      value: true,
    });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: coarse)' || query === '(hover: none)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));
    expect(canPickCfdiFolder()).toBe(false);
    delete (HTMLInputElement.prototype as { webkitdirectory?: boolean }).webkitdirectory;
  });
});
