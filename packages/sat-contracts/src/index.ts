/**
 * Fuente única de verdad — contratos Descarga SAT (frontend + Cloud Functions).
 * @contai/sat-contracts
 */

export type SatDownloadTipo = 'emitidos' | 'recibidos' | 'ambos';

export type SatProviderId = 'mock' | 'sat_ws';

export type SatWsClientId = 'mock_ws' | 'sat_ws';

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
  jobId?: string;
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

/** Estados del job backend (E6.2). */
export type SatDownloadJobStatus =
  | 'queued'
  | 'soliciting'
  | 'verifying'
  | 'downloading'
  | 'unpacking'
  | 'ready'
  | 'failed'
  | 'expired';

export type SatJobErrorCode =
  | 'SAT_AUTH'
  | 'SAT_REJECTED'
  | 'SAT_TIMEOUT'
  | 'SAT_EMPTY'
  | 'RATE_LIMIT'
  | 'NO_CREDENTIAL'
  | 'INTERNAL';

export interface SatDownloadJob {
  id: string;
  organization_id: string;
  usuario_id: string;
  request: SatDownloadRequest;
  status: SatDownloadJobStatus;
  /** IdSolicitud activo o el primero (compat). */
  sat_request_id?: string;
  /** Una o más solicitudes (emitidos/recibidos). */
  sat_request_ids?: string[];
  /** Ids aún en EnProceso / Aceptada. */
  pending_request_ids?: string[];
  sat_package_ids?: string[];
  /** Paquetes ZIP pendientes de descargar. */
  pending_package_ids?: string[];
  packages_path?: string;
  packages?: SatCfdiPackage[];
  package_count?: number;
  /** Aviso no fatal (ej. paquete parcial SAT). */
  warning?: string;
  error_code?: SatJobErrorCode;
  error_message?: string;
  attempts: number;
  provider: SatWsClientId;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
}

export interface StartSatDownloadResponse {
  jobId: string;
}

export interface GetSatDownloadJobResponse {
  job: SatDownloadJob;
  packagesSignedUrl?: string;
}

export interface AdvanceSatDownloadResponse {
  job: SatDownloadJob;
  packagesSignedUrl?: string;
}
