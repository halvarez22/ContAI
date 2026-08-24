/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Button } from './Button';

describe('Button a11y', () => {
  it('primary button no tiene violaciones axe graves', async () => {
    const { container } = render(<Button>Guardar</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('disabled sigue siendo anunciable como botón', async () => {
    const { container } = render(
      <Button disabled variant="secondary">
        Deshabilitado
      </Button>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
