import { describe, expect, it, vi } from 'vitest';
import {
  duplicateCfdiMessage,
  isActiveDuplicate,
  messageIfActiveCfdiDuplicate,
} from './cfdiDuplicates';

describe('isActiveDuplicate', () => {
  it('rechazado no bloquea la recarga', () => {
    expect(isActiveDuplicate({ status: 'rechazado' })).toBe(false);
  });

  it.each(['pendiente', 'revisión', 'conciliado'])(
    '%s cuenta como duplicado',
    (status) => {
      expect(isActiveDuplicate({ status })).toBe(true);
    }
  );
});

describe('messageIfActiveCfdiDuplicate', () => {
  const uuid = '11111111-1111-1111-1111-111111111111';

  it('avisa con el nombre del archivo si el folio sigue vigente', async () => {
    const lookup = vi.fn(async () => new Map([[uuid, { status: 'pendiente' }]]));
    const message = await messageIfActiveCfdiDuplicate({
      organizationId: 'org-1',
      uuid,
      fileName: 'factura.xml',
      lookup,
    });
    expect(message).toBe(duplicateCfdiMessage('factura.xml'));
    expect(lookup).toHaveBeenCalledWith('org-1', [uuid]);
  });

  it('deja pasar un folio rechazado', async () => {
    const lookup = vi.fn(async () => new Map([[uuid, { status: 'rechazado' }]]));
    const message = await messageIfActiveCfdiDuplicate({
      organizationId: 'org-1',
      uuid,
      fileName: 'factura.xml',
      lookup,
    });
    expect(message).toBeNull();
  });
});
