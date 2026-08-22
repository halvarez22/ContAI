/**
 * Contratos Descarga SAT E6.1 (fundación mock).
 * Sin any. Provider real (sat_ws) llega en E6.2 vía backend.
 */

export type SatDownloadTipo = 'emitidos' | 'recibidos' | 'ambos';

export type SatProviderId = 'mock' | 'sat_ws';

export interface SatDownloadRequest {
  rfc: string;
  /** YYYY-MM-DD */
  fechaInicio: string;
  /** YYYY-MM-DD */
  fechaFin: string;
  tipo: SatDownloadTipo;
}

export interface SatCfdiPackage {
  fileName: string;
  xmlText: string;
  uuid?: string;
}

export interface SatDownloadResult {
  ok: boolean;
  packages: SatCfdiPackage[];
  provider: SatProviderId;
  message?: string;
  errors?: string[];
}

export interface SatDownloadProvider {
  readonly id: SatProviderId;
  download(req: SatDownloadRequest): Promise<SatDownloadResult>;
}

export type SatDownloadPhase =
  | 'idle'
  | 'requesting'
  | 'importing'
  | 'success'
  | 'error';

export interface SatDownloadValidationError {
  field?: 'rfc' | 'fechaInicio' | 'fechaFin' | 'rango';
  message: string;
}
