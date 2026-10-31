import type { CatalogAccount } from './chartOfAccounts';
import type { Anexo24NaturalezaSat } from './anexo24Polizas';

export const AUDIT_CATALOGO_ANEXO24_EXPORTADO = 'CATALOGO_ANEXO24_EXPORTADO';

export type Anexo24CatalogoCuenta = {
  codAgrup: string;
  numCta: string;
  desc: string;
  nivel: 1;
  natur: Anexo24NaturalezaSat;
};

export type Anexo24CatalogoBlock = {
  accountCode: string;
  reason: string;
};

export type Anexo24CatalogoNotice = {
  accountCode: string;
  reason: string;
};

export type Anexo24CatalogoInput = {
  organizationRfc: string;
  year: number;
  monthIndex: number;
  chart: readonly CatalogAccount[];
};

export type Anexo24CatalogoSuccess = {
  ok: true;
  rfc: string;
  year: number;
  monthIndex: number;
  periodKey: string;
  cuentas: Anexo24CatalogoCuenta[];
  blocked: [];
  notices: Anexo24CatalogoNotice[];
};

export type Anexo24CatalogoBlocked = {
  ok: false;
  periodKey: string;
  reason: string;
  cuentas: [];
  blocked: Anexo24CatalogoBlock[];
  notices: Anexo24CatalogoNotice[];
};

export type Anexo24CatalogoResult = Anexo24CatalogoSuccess | Anexo24CatalogoBlocked;
