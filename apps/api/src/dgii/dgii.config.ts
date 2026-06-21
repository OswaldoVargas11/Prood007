import { Injectable } from '@nestjs/common';

/**
 * Configuración de la transmisión de e-CF a la DGII (RD). GATED: la transmisión real solo se activa si
 * `DGII_ENV` está definido; sin él, el servicio devuelve `STUBBED` (comportamiento actual, cero efecto).
 *
 * Entornos DGII:
 *  - `test`  → TesteCF: pruebas libres de integración.
 *  - `cert`  → CerteCF: set de pruebas de CERTIFICACIÓN (obligatorio para autorizarse como emisor).
 *  - `prod`  → eCF: producción.
 *
 * Las URLs base por defecto siguen el patrón público de la DGII; se pueden sobreescribir con
 * `DGII_BASE_URL` (confírmalas con la documentación técnica / kit de certificación de la DGII vigente).
 */
export type DgiiEnv = 'test' | 'cert' | 'prod';

const DEFAULT_HOST: Record<DgiiEnv, string> = {
  test: 'https://ecf.dgii.gov.do/testecf',
  cert: 'https://ecf.dgii.gov.do/certecf',
  prod: 'https://ecf.dgii.gov.do/ecf',
};

export interface DgiiEndpoints {
  /** GET → devuelve la semilla XML a firmar. */
  semilla: string;
  /** POST (multipart, semilla firmada) → devuelve el token Bearer. */
  validarSemilla: string;
  /** POST (multipart, e-CF firmado) → devuelve el TrackId. */
  recepcion: string;
  /** GET ?trackid= → estado del envío (EN PROCESO / ACEPTADO / RECHAZADO). */
  consultaEstado: string;
}

@Injectable()
export class DgiiConfig {
  /** Entorno activo (por defecto `test` si `DGII_ENV` trae un valor no reconocido). */
  get env(): DgiiEnv {
    const e = (process.env.DGII_ENV ?? '').trim().toLowerCase();
    return e === 'prod' || e === 'cert' ? e : 'test';
  }

  /** ¿Transmisión real activada? (solo si DGII_ENV está definido explícitamente). */
  get enabled(): boolean {
    return Boolean((process.env.DGII_ENV ?? '').trim());
  }

  /** Host base del entorno (sobreescribible con DGII_BASE_URL). */
  get baseUrl(): string {
    return (process.env.DGII_BASE_URL ?? DEFAULT_HOST[this.env]).replace(/\/+$/, '');
  }

  get endpoints(): DgiiEndpoints {
    const b = this.baseUrl;
    return {
      semilla: `${b}/fe/autenticacion/api/semilla`,
      validarSemilla: `${b}/fe/autenticacion/api/validacionsemilla`,
      recepcion: `${b}/fe/recepcion/api/ecf`,
      consultaEstado: `${b}/fe/consultaestado/api/estado`,
    };
  }

  /** Timeout de las llamadas HTTP a la DGII (ms). */
  get timeoutMs(): number {
    return Number(process.env.DGII_TIMEOUT_MS ?? 20_000);
  }
}
