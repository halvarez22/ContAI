/**
 * @vitest-environment jsdom
 */
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImportModals } from './ImportModals';
import {
  FOLDER_PICKER_UNAVAILABLE_MESSAGE,
  WAIT_FOR_CURRENT_LOAD_MESSAGE,
} from '../lib/cfdiFileSelection';

function renderModals(
  overrides: Partial<ComponentProps<typeof ImportModals>> = {}
) {
  const onCfdiFiles = vi.fn();
  render(
    <ImportModals
      isCfdiImportOpen
      cfdiPreview={null}
      cfdiImportError={null}
      cfdiImporting={false}
      cfdiXsdMode={null}
      cfdiXsdValidating={false}
      cfdiPhase="idle"
      cfdiBatchProgress={null}
      cfdiBatchResults={[]}
      isExcelImportOpen={false}
      excelImportMessage={null}
      excelImporting={false}
      onCloseCfdi={vi.fn()}
      onCloseExcel={vi.fn()}
      onCfdiFiles={onCfdiFiles}
      onExcelFiles={vi.fn()}
      onImportCfdi={vi.fn()}
      {...overrides}
    />
  );
  return { onCfdiFiles };
}

function stubCoarsePointer(): void {
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
}

describe('ImportModals avance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLInputElement.prototype as { webkitdirectory?: boolean }).webkitdirectory;
  });

  it('2 de 8 se muestra como 25 % y el archivo en turno', () => {
    render(
      <ImportModals
        isCfdiImportOpen
        cfdiPreview={null}
        cfdiImportError={null}
        cfdiImporting={false}
        cfdiXsdMode={null}
        cfdiXsdValidating={false}
        cfdiPhase="uploading"
        cfdiBatchProgress={{
          phase: 'uploading',
          current: 2,
          total: 8,
          fileName: 'factura.xml',
          message: 'Leyendo 2/8',
        }}
        cfdiBatchResults={[]}
        isExcelImportOpen={false}
        excelImportMessage={null}
        excelImporting={false}
        onCloseCfdi={vi.fn()}
        onCloseExcel={vi.fn()}
        onCfdiFiles={vi.fn()}
        onExcelFiles={vi.fn()}
        onImportCfdi={vi.fn()}
      />
    );

    const bar = screen.getByRole('progressbar', { name: 'factura.xml' });
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText(/factura\.xml/)).toBeTruthy();
  });

  it('la carpeta lleva webkitdirectory y los archivos no', () => {
    renderModals();
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    const folder = inputs.filter((input) => input.hasAttribute('webkitdirectory'));
    const files = inputs.filter((input) => !input.hasAttribute('webkitdirectory'));
    expect(folder).toHaveLength(1);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((input) => !input.hasAttribute('webkitdirectory'))).toBe(true);
  });

  it('al elegir la carpeta llama onCfdiFiles con el FileList', () => {
    const { onCfdiFiles } = renderModals();
    const folder = document.querySelector('input[webkitdirectory]');
    expect(folder).toBeTruthy();
    const xml = new File(['<cfdi/>'], 'a.xml', { type: 'text/xml' });
    fireEvent.change(folder as HTMLInputElement, { target: { files: [xml] } });
    expect(onCfdiFiles).toHaveBeenCalledTimes(1);
    const list = onCfdiFiles.mock.calls[0]?.[0] as FileList;
    expect(list[0]?.name).toBe('a.xml');
  });

  it('durante la carga los dos botones quedan apagados y dicen por qué', () => {
    renderModals({ cfdiImporting: true });
    const files = screen.getByRole('button', { name: /Cargar archivo/i });
    const folder = screen.getByRole('button', { name: /Cargar carpeta/i });
    expect(files).toBeDisabled();
    expect(folder).toBeDisabled();
    expect(files.parentElement?.getAttribute('title')).toBe(WAIT_FOR_CURRENT_LOAD_MESSAGE);
    expect(folder.parentElement?.getAttribute('title')).toBe(WAIT_FOR_CURRENT_LOAD_MESSAGE);
  });

  it('muestra cuántos archivos no son XML', () => {
    renderModals({ cfdiImportError: 'Se omitieron 12 archivos que no son XML.' });
    expect(screen.getByText('Se omitieron 12 archivos que no son XML.')).toBeTruthy();
  });

  it('en táctil apaga Cargar carpeta y dice por qué', () => {
    Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
      configurable: true,
      value: true,
    });
    stubCoarsePointer();
    renderModals();
    const folder = screen.getByRole('button', { name: /Cargar carpeta/i });
    expect(folder).toBeDisabled();
    expect(folder.parentElement?.getAttribute('title')).toBe(
      FOLDER_PICKER_UNAVAILABLE_MESSAGE
    );
  });
});
