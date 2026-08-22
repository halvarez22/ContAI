/**
 * Re-export de la fuente única @contai/sat-contracts (E6.2).
 * Mantener este archivo para imports históricos `../types/satDownload`.
 */

export type {
  SatDownloadTipo,
  SatProviderId,
  SatWsClientId,
  SatDownloadRequest,
  SatCfdiPackage,
  SatDownloadResult,
  SatDownloadProvider,
  SatDownloadPhase,
  SatDownloadValidationError,
  SatDownloadJobStatus,
  SatJobErrorCode,
  SatDownloadJob,
  StartSatDownloadResponse,
  GetSatDownloadJobResponse,
} from '../../packages/sat-contracts/src/index';
