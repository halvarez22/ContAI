/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  isLikelyValidRfcShape,
  normalizeHeaderKey,
  normalizeRfc,
} from './fiscalRisk';

describe('fiscalRisk types helpers', () => {
  it('normalizeRfc es determinista', () => {
    expect(normalizeRfc('ab-cd 010101 xyz')).toBe('ABCD010101XYZ');
  });

  it('normalizeHeaderKey quita puntos y acentos', () => {
    expect(normalizeHeaderKey('R.F.C.')).toBe('rfc');
    expect(normalizeHeaderKey('Fecha de publicación')).toBe(
      'fechadepublicacion'
    );
  });

  it('isLikelyValidRfcShape acepta longitudes SAT típicas', () => {
    expect(isLikelyValidRfcShape('XAXX010101000')).toBe(true);
    expect(isLikelyValidRfcShape('ABCD010101XYZ')).toBe(true);
    expect(isLikelyValidRfcShape('AB010101XYZ')).toBe(false);
  });
});
