/**
 * Un folio vigente no se vuelve a cargar.
 * La consulta vive en firestoreService; aquí solo está la regla.
 */

export type CfdiDuplicateRow = {
  status?: string | null;
};

// R6/Aclaración 1: rechazado no es duplicado; pendiente, revisión y conciliado sí.
export function isActiveDuplicate(row: CfdiDuplicateRow): boolean {
  return row.status !== 'rechazado';
}

export function duplicateCfdiMessage(fileName: string): string {
  const name = fileName.trim() || 'Este CFDI';
  return `${name} ya está cargado. No se registró otra vez.`;
}

export async function messageIfActiveCfdiDuplicate(input: {
  organizationId: string;
  uuid: string | undefined;
  fileName: string;
  lookup: (
    organizationId: string,
    uuids: readonly string[]
  ) => Promise<ReadonlyMap<string, CfdiDuplicateRow>>;
}): Promise<string | null> {
  const uuid = (input.uuid ?? '').trim();
  if (!uuid) return null;
  const existing = await input.lookup(input.organizationId, [uuid]);
  const row = existing.get(uuid.toLowerCase());
  if (!row || !isActiveDuplicate(row)) return null;
  return duplicateCfdiMessage(input.fileName);
}
