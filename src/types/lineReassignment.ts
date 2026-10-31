import type { CatalogAccount } from './chartOfAccounts';
import type { JournalEntry } from './journalEntry';

export const AUDIT_CUENTA_LINEA_REASIGNADA = 'CUENTA_LINEA_REASIGNADA';

export const LINE_INDEX_INVALID = 'Índice de línea inválido';

export const LINE_UNBALANCED_REASON = 'El asiento ya no cuadra tras el cambio';

export const LINE_IDENTITY_REASON =
  'El importe, el tipo o el concepto de la línea no se pueden modificar.';

export interface LineAccountChangeRequest {
  transaction_id: string;
  line_index: number;
  new_account_code: string;
  current_entry: JournalEntry;
  status?: string | null;
  fecha: string;
  is_nomina?: boolean;
  cfdi_tipo_comprobante?: string | null;
  periodosCerrados: readonly string[];
  chart: readonly CatalogAccount[];
}

export type LineAccountChangeResult =
  | { ok: true; entry: JournalEntry }
  | { ok: false; reason: string };
