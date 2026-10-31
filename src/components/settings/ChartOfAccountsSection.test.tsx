/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { getChartOfAccountsSeed } from '../../config/chartOfAccounts';
import { ChartOfAccountsSection } from './ChartOfAccountsSection';

describe('ChartOfAccountsSection', () => {
  it('muestra un pendiente y no lo ofrece como destino de regla', () => {
    render(
      <ChartOfAccountsSection
        accounts={getChartOfAccountsSeed()}
        pendientes={['Impuestos']}
        rules={[]}
        canManage
        saving={false}
        error={null}
        onSaveAccounts={vi.fn(async () => undefined)}
        onSaveRule={vi.fn(async () => undefined)}
        onDeleteRule={vi.fn(async () => undefined)}
      />
    );
    expect(screen.getByText('Impuestos')).toBeTruthy();
    const select = screen.getByLabelText('Cuenta destino de la regla');
    expect(select.textContent).not.toContain('Impuestos');
    expect(select.textContent).toContain('Gastos Operativos');
    expect(screen.getByLabelText('Tipo de CFDI')).toBeTruthy();
    expect(screen.getByLabelText('Método de pago')).toBeTruthy();
    expect(screen.getByLabelText('Uso de CFDI')).toBeTruthy();
    expect(screen.getByLabelText('RFC de la contraparte')).toBeTruthy();
  });

  it('no guarda una clave de producto que no tiene 8 dígitos', () => {
    const onSaveRule = vi.fn(async () => undefined);
    render(
      <ChartOfAccountsSection
        accounts={getChartOfAccountsSeed()}
        pendientes={[]}
        rules={[]}
        canManage
        saving={false}
        error={null}
        onSaveAccounts={vi.fn(async () => undefined)}
        onSaveRule={onSaveRule}
        onDeleteRule={vi.fn(async () => undefined)}
      />
    );
    fireEvent.change(screen.getByLabelText('Cuenta destino de la regla'), {
      target: { value: '601.84' },
    });
    fireEvent.change(screen.getByLabelText('Clave de producto'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar regla' }));
    expect(screen.getByRole('alert').textContent).toContain('8 dígitos');
    expect(onSaveRule).not.toHaveBeenCalled();
  });

  it('no muestra ni ejecuta la actualización oficial si no puede administrar', () => {
    const onSyncMissingSeed = vi.fn(async () => undefined);
    render(
      <ChartOfAccountsSection
        accounts={getChartOfAccountsSeed()}
        pendientes={[]}
        rules={[]}
        canManage={false}
        saving={false}
        error={null}
        onSaveAccounts={vi.fn(async () => undefined)}
        onSyncMissingSeed={onSyncMissingSeed}
        onSaveRule={vi.fn(async () => undefined)}
        onDeleteRule={vi.fn(async () => undefined)}
      />
    );
    expect(screen.queryByRole('button', { name: 'Agregar cuentas oficiales faltantes' })).toBeNull();
    expect(onSyncMissingSeed).not.toHaveBeenCalled();
  });

  it('muestra la carga y el resultado de las cuentas oficiales', () => {
    render(
      <ChartOfAccountsSection
        accounts={getChartOfAccountsSeed()}
        pendientes={[]}
        rules={[]}
        canManage
        saving={false}
        syncing
        syncMessage="Se agregaron 3 cuentas del catálogo oficial."
        error={null}
        onSaveAccounts={vi.fn(async () => undefined)}
        onSyncMissingSeed={vi.fn(async () => undefined)}
        onSaveRule={vi.fn(async () => undefined)}
        onDeleteRule={vi.fn(async () => undefined)}
      />
    );
    expect(screen.getByRole('button', { name: 'Agregando…' })).toBeDisabled();
    expect(screen.getByText('Se agregaron 3 cuentas del catálogo oficial.')).toBeTruthy();
  });
});
