/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Alert } from './Alert';

describe('Alert a11y', () => {
  it('info usa role=status sin violaciones', async () => {
    const { container } = render(
      <Alert variant="info" title="Info">
        Mensaje
      </Alert>
    );
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('error usa role=alert sin violaciones', async () => {
    const { container } = render(
      <Alert variant="error" title="Error">
        Falló la operación
      </Alert>
    );
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
