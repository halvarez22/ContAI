import { describe, expect, it } from 'vitest';
import { deleteField, serverTimestamp } from 'firebase/firestore';
import { stripUndefinedDeep } from './firestoreSanitize';

function expectNoUndefinedDeep(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) expectNoUndefinedDeep(item);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    expect(record[key]).not.toBeUndefined();
    expectNoUndefinedDeep(record[key]);
  }
}

describe('stripUndefinedDeep', () => {
  it('T1 elimina forma_pago_sat cuando el valor es undefined', () => {
    const result = stripUndefinedDeep({ forma_pago_sat: undefined });
    expect('forma_pago_sat' in result).toBe(false);
  });

  it('T2 conserva forma_pago_sat con valor 01', () => {
    const result = stripUndefinedDeep({ forma_pago_sat: '01' });
    expect(result.forma_pago_sat).toBe('01');
  });

  it('T3 conserva es_anticipo en false', () => {
    const result = stripUndefinedDeep({ es_anticipo: false });
    expect(Object.hasOwn(result, 'es_anticipo')).toBe(true);
    expect(result.es_anticipo).toBe(false);
  });

  it('T4 elimina es_anticipo cuando el valor es undefined', () => {
    const result = stripUndefinedDeep({ es_anticipo: undefined });
    expect('es_anticipo' in result).toBe(false);
  });

  it('T5 limpia un objeto anidado y conserva el cero', () => {
    const result = stripUndefinedDeep({ a: 1, b: undefined, c: { d: undefined, e: 0 } });
    expect(result).toEqual({ a: 1, c: { e: 0 } });
  });

  it('T6 limpia objetos dentro de un array', () => {
    const result = stripUndefinedDeep({ c: [{ d: undefined, e: 'x' }] });
    expect(result.c[0]).toEqual({ e: 'x' });
  });

  it('T7 conserva null, texto vacío, cero y false', () => {
    const result = stripUndefinedDeep({
      b: null,
      c: '',
      d: 0,
      e: false,
      f: undefined,
    });
    expect(result).toEqual({ b: null, c: '', d: 0, e: false });
    expect('f' in result).toBe(false);
  });

  it('T8 conserva tasa null en la ficha y quita la clave undefined', () => {
    const result = stripUndefinedDeep({
      cfdi_fiscal_face: { tasa: null, otra: undefined },
    });
    expect(result.cfdi_fiscal_face).toEqual({ tasa: null });
  });

  it('T9 conserva el monto del asiento y quita la cuenta undefined', () => {
    const result = stripUndefinedDeep({
      asiento_devengo: { cuenta: undefined, monto: 100 },
    });
    expect(result.asiento_devengo).toEqual({ monto: 100 });
  });

  it('T10 un lote de dos facturas no conserva undefined en ningún nivel', () => {
    const result = stripUndefinedDeep([
      { forma_pago_sat: undefined, monto: 1160, es_anticipo: undefined },
      { forma_pago_sat: '03', es_anticipo: undefined, monto: 1160 },
    ]);
    expectNoUndefinedDeep(result);
    expect(result[0]).toEqual({ monto: 1160 });
    expect(result[1]).toEqual({ forma_pago_sat: '03', monto: 1160 });
  });

  it('T13 conserva la misma referencia de serverTimestamp', () => {
    const creado_en = serverTimestamp();
    const result = stripUndefinedDeep({ creado_en, forma_pago_sat: undefined });
    expect(result.creado_en).toBe(creado_en);
    expect('forma_pago_sat' in result).toBe(false);
    expectNoUndefinedDeep(result);
  });

  it('T14 conserva la misma referencia de deleteField', () => {
    const aprobado_en = deleteField();
    const result = stripUndefinedDeep({ aprobado_en, otro: undefined });
    expect(result.aprobado_en).toBe(aprobado_en);
    expect('otro' in result).toBe(false);
    expectNoUndefinedDeep(result);
  });
});
