import type { AuthUser } from './auth-types';

/**
 * Copy de cumplimiento derivado de la JURISDICCIÓN del tenant (nunca hardcodeado por país).
 * El locale gobierna formato/moneda; la jurisdicción gobierna impuestos e identificadores.
 * Ver D-014 y el handoff de diseño (regla locale ≠ jurisdicción).
 */
export interface JurisdictionCopy {
  /** Etiqueta del país del despacho. */
  country: string;
  /** Sistema de facturación electrónica. */
  eInvoice: string;
  /** Impuestos aplicables. */
  taxes: string;
  /** Identificadores fiscales. */
  taxIds: string;
  /** Moneda por defecto de la jurisdicción (informativo; la real viene del tenant). */
  defaultCurrency: 'EUR' | 'DOP';
}

const COPY: Record<AuthUser['jurisdiction'], JurisdictionCopy> = {
  es: {
    country: 'España',
    eInvoice: 'Verifactu · AEAT',
    taxes: 'IVA 21% + retención IRPF',
    taxIds: 'NIF / CIF / NIE',
    defaultCurrency: 'EUR',
  },
  do: {
    country: 'República Dominicana',
    eInvoice: 'e-CF · DGII',
    taxes: 'ITBIS 18%',
    taxIds: 'RNC / Cédula',
    defaultCurrency: 'DOP',
  },
};

export function jurisdictionCopy(jurisdiction: AuthUser['jurisdiction']): JurisdictionCopy {
  return COPY[jurisdiction];
}
