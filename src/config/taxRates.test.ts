import { describe, expect, it } from 'vitest';
import { ivaRateFromCode, CFDI_VERSION_DEFAULT } from './taxRates';

describe('taxRates catalog', () => {
  it('maps IVA 16%, 8% and 0%', () => {
    expect(ivaRateFromCode('16')).toBe(0.16);
    expect(ivaRateFromCode('8')).toBe(0.08);
    expect(ivaRateFromCode('0')).toBe(0);
  });

  it('exposes default CFDI version', () => {
    expect(CFDI_VERSION_DEFAULT).toBe('4.0');
  });
});
