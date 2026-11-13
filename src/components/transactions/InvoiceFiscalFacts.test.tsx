/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvoiceFiscalFacts } from './InvoiceFiscalFacts';
import type { CfdiFiscalFace } from '../../types/cfdiFiscalFace';

const face: CfdiFiscalFace = {
  clase: 'ingreso',
  serie: 'A',
  folio: '100',
  folioFiscal: '11111111-1111-1111-1111-111111111111',
  descuento: 0,
  impuestos: [],
};

describe('InvoiceFiscalFacts', () => {
  it('muestra el texto de la ficha', () => {
    render(<InvoiceFiscalFacts face={face} />);
    expect(screen.getByText(/Folio fiscal: 11111111-1111-1111-1111-111111111111/)).toBeTruthy();
    expect(screen.getByText(/Tipo: Ingreso/)).toBeTruthy();
  });

  it('no agrega un renglón si no hay ficha', () => {
    const { container } = render(<InvoiceFiscalFacts face={null} />);
    expect(container).toBeEmptyDOMElement();
    const empty = render(<InvoiceFiscalFacts face={undefined} />);
    expect(empty.container).toBeEmptyDOMElement();
  });
});
