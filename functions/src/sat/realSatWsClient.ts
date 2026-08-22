/**
 * RealSatWsClient — adapter Nodecfdi → SatWsClient (E6.2.1).
 * Timeouts HTTP; re-auth 1× + 1 retry de red.
 * Nunca loguea FIEL/token/XML firmado.
 */

import type { SatWsClient, SatWsVerifyState } from './satWsClient';
import { mapSatFailure } from './satErrorMap';

const AUTH_TIMEOUT_MS = 30_000;
const OP_TIMEOUT_MS = 60_000;

/** Superficie mínima inyectable (tests sin red SAT). */
export type SatSoapEngine = {
  queryIssued(fechaInicio: string, fechaFin: string): Promise<QueryOutcome>;
  queryReceived(fechaInicio: string, fechaFin: string): Promise<QueryOutcome>;
  verify(requestId: string): Promise<VerifyOutcome>;
  download(packageId: string): Promise<DownloadOutcome>;
  dispose(): void;
};

export type QueryOutcome = {
  accepted: boolean;
  requestId: string;
  statusCode: number;
  message: string;
};

export type VerifyOutcome = {
  callAccepted: boolean;
  statusRequest: SatWsVerifyState;
  packageIds: string[];
  numberCfdis: number;
  codeRequest?: string;
  statusCode: number;
  message: string;
  partial?: boolean;
};

export type DownloadOutcome = {
  accepted: boolean;
  content: Buffer;
  statusCode: number;
  message: string;
};

export class SatWsClientError extends Error {
  readonly mapped: ReturnType<typeof mapSatFailure>;

  constructor(
    readonly kind:
      | 'auth'
      | 'rejected'
      | 'empty'
      | 'timeout'
      | 'network'
      | 'internal'
      | 'no_credential',
    readonly satMessage: string,
    readonly statusCode?: number,
    readonly statusRequest?: string,
    readonly codeRequest?: string
  ) {
    super(satMessage);
    this.name = 'SatWsClientError';
    this.mapped = mapSatFailure({
      kind: this.kind,
      statusCode: this.statusCode,
      message: this.satMessage,
      statusRequest: this.statusRequest,
      codeRequest: this.codeRequest,
    });
  }
}

export function createRealSatWsClientFromEngine(
  engine: SatSoapEngine
): SatWsClient {
  return {
    id: 'sat_ws',

    async solicitar(params) {
      const tipo = params.tipo === 'recibidos' ? 'recibidos' : 'emitidos';
      const run = () =>
        tipo === 'recibidos'
          ? engine.queryReceived(params.fechaInicio, params.fechaFin)
          : engine.queryIssued(params.fechaInicio, params.fechaFin);

      const outcome = await withRetries(run);
      if (!outcome.accepted || !outcome.requestId) {
        throw new SatWsClientError(
          outcome.statusCode >= 5001 && outcome.statusCode < 5100
            ? 'auth'
            : 'rejected',
          outcome.message || 'Solicitud SAT no aceptada',
          outcome.statusCode
        );
      }
      return { requestId: outcome.requestId };
    },

    async verificar(requestId: string) {
      const outcome = await withRetries(() => engine.verify(requestId));
      if (!outcome.callAccepted) {
        throw new SatWsClientError(
          'rejected',
          outcome.message || 'Verificación SAT fallida',
          outcome.statusCode,
          outcome.statusRequest,
          outcome.codeRequest
        );
      }
      return {
        state: outcome.statusRequest,
        packageIds: outcome.packageIds,
        numberCfdis: outcome.numberCfdis,
        codeRequest: outcome.codeRequest,
        message: outcome.message,
        partial: outcome.partial,
      };
    },

    async descargar(packageId: string) {
      const outcome = await withRetries(() => engine.download(packageId));
      if (!outcome.accepted || outcome.content.length === 0) {
        throw new SatWsClientError(
          'empty',
          outcome.message || 'Paquete SAT vacío',
          outcome.statusCode
        );
      }
      return outcome.content;
    },
  };
}

type VerifyExtended = {
  state: SatWsVerifyState;
  packageIds: string[];
  numberCfdis?: number;
  codeRequest?: string;
  message?: string;
  partial?: boolean;
};

/** Extiende el contrato runtime de verificar (jobService puede leer campos extra). */
export type SatWsClientExtended = SatWsClient & {
  verificar(requestId: string): Promise<VerifyExtended>;
};

async function withRetries<T>(fn: () => Promise<T>): Promise<T> {
  let authRetried = false;
  let netRetried = false;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isAuth =
        /token|autentic|auth|certificado|fiel|5001|5002/i.test(msg) &&
        !authRetried;
      const isNet =
        /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|network|5\d\d|timeout/i.test(
          msg
        ) && !netRetried;

      if (isAuth) {
        authRetried = true;
        continue;
      }
      if (isNet) {
        netRetried = true;
        continue;
      }
      if (e instanceof SatWsClientError) throw e;
      throw new SatWsClientError('network', msg);
    }
  }
}

/**
 * Construye engine Nodecfdi real (dynamic import ESM).
 * `material` debe dispose()-arse tras crear el client (buffers zeroizados);
 * el engine retiene Fiel en memoria del isolate hasta dispose del engine.
 */
export async function createNodecfdiEngine(params: {
  certificateContents: string;
  privateKeyContents: string;
  passPhrase: string;
  httpTimeoutMs?: number;
}): Promise<SatSoapEngine> {
  const mod = await import('@nodecfdi/sat-ws-descarga-masiva');
  const {
    Fiel,
    FielRequestBuilder,
    HttpsWebClient,
    Service,
    ServiceEndpoints,
    DateTimePeriod,
    QueryParameters,
    DownloadType,
    RequestType,
  } = mod;

  const fiel = Fiel.create(
    params.certificateContents,
    params.privateKeyContents,
    params.passPhrase
  );
  if (!fiel.isValid()) {
    throw new SatWsClientError('auth', 'FIEL inválida o vencida');
  }

  const timeout = params.httpTimeoutMs ?? OP_TIMEOUT_MS;
  const webClient = new HttpsWebClient(undefined, undefined, timeout);
  // Auth usa mismo client; timeout auth acotado vía mismo valor si < AUTH
  void AUTH_TIMEOUT_MS;
  const service = new Service(
    new FielRequestBuilder(fiel),
    webClient,
    null,
    ServiceEndpoints.cfdi()
  );

  const buildPeriod = (fechaInicio: string, fechaFin: string) =>
    DateTimePeriod.createFromValues(
      `${fechaInicio}T00:00:00`,
      `${fechaFin}T23:59:59`
    );

  const mapStatus = (statusRequest: {
    isTypeOf: (t: 'Accepted' | 'InProgress' | 'Finished' | 'Failure' | 'Rejected' | 'Expired') => boolean;
  }): SatWsVerifyState => {
    if (statusRequest.isTypeOf('Finished')) return 'Terminada';
    if (statusRequest.isTypeOf('InProgress')) return 'EnProceso';
    if (statusRequest.isTypeOf('Accepted')) return 'Aceptada';
    if (statusRequest.isTypeOf('Rejected')) return 'Rechazada';
    if (statusRequest.isTypeOf('Expired')) return 'Error';
    if (statusRequest.isTypeOf('Failure')) return 'Error';
    return 'EnProceso';
  };

  return {
    async queryIssued(fechaInicio, fechaFin) {
      const q = QueryParameters.create(buildPeriod(fechaInicio, fechaFin))
        .withDownloadType(new DownloadType('issued'))
        .withRequestType(new RequestType('xml'));
      const result = await service.query(q);
      return {
        accepted: result.getStatus().isAccepted(),
        requestId: result.getRequestId(),
        statusCode: result.getStatus().getCode(),
        message: result.getStatus().getMessage(),
      };
    },
    async queryReceived(fechaInicio, fechaFin) {
      const q = QueryParameters.create(buildPeriod(fechaInicio, fechaFin))
        .withDownloadType(new DownloadType('received'))
        .withRequestType(new RequestType('xml'));
      const result = await service.query(q);
      return {
        accepted: result.getStatus().isAccepted(),
        requestId: result.getRequestId(),
        statusCode: result.getStatus().getCode(),
        message: result.getStatus().getMessage(),
      };
    },
    async verify(requestId) {
      const result = await service.verify(requestId);
      const codeRequest = result.getCodeRequest().getEntryId();
      const message = result.getStatus().getMessage();
      const partial =
        result.getCodeRequest().isTypeOf('MaximumLimitReaded') ||
        /parcial|partial/i.test(message);
      return {
        callAccepted: result.getStatus().isAccepted(),
        statusRequest: mapStatus(result.getStatusRequest()),
        packageIds: result.getPackageIds(),
        numberCfdis: result.getNumberCfdis(),
        codeRequest,
        statusCode: result.getStatus().getCode(),
        message,
        partial,
      };
    },
    async download(packageId) {
      const result = await service.download(packageId);
      const b64 = result.getPackageContent();
      return {
        accepted: result.getStatus().isAccepted(),
        content: Buffer.from(b64, 'base64'),
        statusCode: result.getStatus().getCode(),
        message: result.getStatus().getMessage(),
      };
    },
    dispose() {
      /* Fiel retenida hasta GC del isolate; no exponer en logs */
    },
  };
}

export async function createRealSatWsClient(params: {
  certificateContents: string;
  privateKeyContents: string;
  passPhrase: string;
}): Promise<SatWsClientExtended> {
  const engine = await createNodecfdiEngine(params);
  return createRealSatWsClientFromEngine(engine) as SatWsClientExtended;
}
