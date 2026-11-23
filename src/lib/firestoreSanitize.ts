/**
 * Quita claves `undefined` antes de escribir en Firestore.
 * Solo desciende en arrays y en objetos planos.
 * Centinelas del SDK, fechas y demás instancias se devuelven tal cual.
 * Si un caso futuro necesita conservar `undefined`, requiere otro plan.
 */

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const source = value as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const child = source[key];
    if (child === undefined) continue;
    cleaned[key] = stripUndefinedDeep(child);
  }
  return cleaned as T;
}
