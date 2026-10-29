/**
 * Contratos de importación Excel — reexport de borradores existentes.
 */

export type {
  TransactionDraft,
  ProductDraft,
  ExcelImportResult,
  TxTipo,
} from '../lib/excelContaiImport';

/** Fila ya leída, lista para el devengo. Los importes fiscales nulos no se tratan como cero. */
export interface ExcelRowDraft {
  concepto: string;
  monto: number;
  fiscal_subtotal: number | null;
  fiscal_iva: number | null;
  rowIndex: number;
  tipo: 'ingreso' | 'egreso';
  fecha: string;
  proveedor: string;
}
