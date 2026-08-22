import { describe, expect, it } from 'vitest';
import {
  isPartialPackageSignal,
  mapSatFailure,
  PARTIAL_PACKAGE_WARNING,
} from './satErrorMap';

describe('satErrorMap', () => {
  it('mapea auth / no credential / empty / rejected / timeout', () => {
    expect(mapSatFailure({ kind: 'no_credential' }).code).toBe('NO_CREDENTIAL');
    expect(mapSatFailure({ kind: 'auth', statusCode: 5001 }).code).toBe('SAT_AUTH');
    expect(
      mapSatFailure({
        kind: 'empty',
        message: 'No se encontró la información',
      }).code
    ).toBe('SAT_EMPTY');
    expect(
      mapSatFailure({ statusRequest: 'Rejected', message: 'Rechazada' }).code
    ).toBe('SAT_REJECTED');
    expect(mapSatFailure({ kind: 'timeout' }).code).toBe('SAT_TIMEOUT');
    expect(
      mapSatFailure({ codeRequest: 'EmptyResult' }).code
    ).toBe('SAT_EMPTY');
  });

  it('detecta paquete parcial', () => {
    expect(
      isPartialPackageSignal({ codeRequest: 'MaximumLimitReaded' })
    ).toBe(true);
    expect(
      isPartialPackageSignal({ message: 'paquete parcial del SAT' })
    ).toBe(true);
    expect(PARTIAL_PACKAGE_WARNING.length).toBeGreaterThan(10);
  });
});
