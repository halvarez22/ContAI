/** Clave estable YYYY-MM (mes 1-12) para periodos cerrados en perfil de usuario. */

export function periodKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function parsePeriodKey(key: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

export function isPeriodClosed(closed: string[] | undefined, year: number, monthIndex: number): boolean {
  if (!closed?.length) return false;
  return closed.includes(periodKey(year, monthIndex));
}

export function isTransactionDateInClosedPeriod(
  fechaIso: string | undefined,
  closed: string[] | undefined
): boolean {
  if (!fechaIso || !closed?.length) return false;
  const d = new Date(fechaIso);
  if (Number.isNaN(d.getTime())) return false;
  return isPeriodClosed(closed, d.getFullYear(), d.getMonth());
}
