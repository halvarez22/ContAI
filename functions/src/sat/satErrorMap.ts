/**
 * Mapeo de señales SAT / Nodecfdi → SatJobErrorCode (E6.2.1).
 * Puro: sin I/O, sin logs de material sensible.
 */

import type { SatJobErrorCode } from '../contracts';

export type SatFailureSignal = {
  /** CodEstatus numérico si existe */
  statusCode?: number;
  /** Mensaje SAT / librería (sin PEM/token) */
  message?: string;
  /** Estado de solicitud: Accepted | InProgress | Finished | Failure | Rejected | Expired | EmptyResult | … */
  statusRequest?: string;
  codeRequest?: string;
  kind?:
    | 'auth'
    | 'rejected'
    | 'empty'
    | 'timeout'
    | 'network'
    | 'no_credential'
    | 'internal';
};

export type MappedSatError = {
  code: SatJobErrorCode;
  message: string;
};

const EMPTY_HINT =
  /no se encontr|sin informaci|empty|no existen|0 cfdi|ningún comprobante|ningun comprobante/i;

export function mapSatFailure(signal: SatFailureSignal): MappedSatError {
  if (signal.kind === 'no_credential') {
    return {
      code: 'NO_CREDENTIAL',
      message: 'No hay FIEL registrada para la organización',
    };
  }
  if (signal.kind === 'timeout') {
    return {
      code: 'SAT_TIMEOUT',
      message: signal.message || 'El SAT no terminó a tiempo; reintente más tarde',
    };
  }
  if (signal.kind === 'auth' || isAuthCode(signal.statusCode)) {
    return {
      code: 'SAT_AUTH',
      message: signal.message || 'No se pudo autenticar ante el SAT con la FIEL',
    };
  }

  const msg = signal.message || '';
  const statusReq = (signal.statusRequest || '').toLowerCase();
  const codeReq = (signal.codeRequest || '').toLowerCase();

  if (
    signal.kind === 'empty' ||
    codeReq === 'emptyresult' ||
    EMPTY_HINT.test(msg) ||
    EMPTY_HINT.test(codeReq)
  ) {
    return {
      code: 'SAT_EMPTY',
      message: signal.message || 'No hay CFDIs en el rango solicitado',
    };
  }

  if (
    signal.kind === 'rejected' ||
    statusReq === 'rejected' ||
    statusReq === 'failure' ||
    statusReq === 'expired' ||
    codeReq === 'exhausted' ||
    codeReq === 'duplicated'
  ) {
    return {
      code: 'SAT_REJECTED',
      message: signal.message || `El SAT rechazó la solicitud (${signal.statusRequest || signal.codeRequest || 'rechazo'})`,
    };
  }

  if (signal.kind === 'network') {
    return {
      code: 'INTERNAL',
      message: signal.message || 'Error de red al contactar el SAT',
    };
  }

  return {
    code: 'INTERNAL',
    message: signal.message || 'Error interno en descarga SAT',
  };
}

function isAuthCode(code: number | undefined): boolean {
  if (code === undefined) return false;
  // Serie típica de autenticación / certificado
  return code === 5001 || code === 5002 || code === 5005 || (code >= 300 && code < 400 && code !== 5000);
}

/** Detecta paquete parcial (ready + warning, no failed). */
export function isPartialPackageSignal(signal: {
  codeRequest?: string;
  message?: string;
  numberCfdis?: number;
  packageCount?: number;
}): boolean {
  const code = (signal.codeRequest || '').toLowerCase();
  if (code === 'maximumlimitreaded') return true;
  if (/parcial|partial|l[ií]mite/i.test(signal.message || '')) return true;
  if (
    typeof signal.numberCfdis === 'number' &&
    typeof signal.packageCount === 'number' &&
    signal.numberCfdis > 0 &&
    signal.packageCount === 0
  ) {
    return true;
  }
  return false;
}

export const PARTIAL_PACKAGE_WARNING =
  'El SAT devolvió un paquete parcial; puede faltar parte de los CFDIs del rango. Verifique en el portal si aplica.';
