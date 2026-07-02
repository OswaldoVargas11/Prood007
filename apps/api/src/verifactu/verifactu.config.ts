import { Injectable } from '@nestjs/common';
import type { SistemaInformaticoInfo } from './registro-xml';

/**
 * Configuración de la remisión de registros Verifactu a la AEAT (modalidad VERI*FACTU). GATED: la
 * remisión real solo se activa si `VERIFACTU_ENV` está definido; sin él, los registros se generan y
 * firman igual pero NADA se transmite (quedan STUBBED). Mismo patrón que `DgiiConfig`/`DGII_ENV`.
 *
 * Entornos AEAT:
 *  - `test` → banco de pruebas (preproducción, prewww1.aeat.es). Requiere el certificado de
 *    representante del owner dado de alta en el entorno de pruebas (docs/fiscal/FINISHING-CHECKLIST.md).
 *  - `prod` → producción (www1.agenciatributaria.gob.es).
 *
 * La URL sigue la documentación técnica pública de la AEAT (servicio SOAP `SistemaFacturacion`); se puede
 * sobreescribir con `VERIFACTU_BASE_URL` (p. ej. prewww10.aeat.es para certificados de sello).
 */
export type VerifactuEnv = 'test' | 'prod';

const DEFAULT_HOST: Record<VerifactuEnv, string> = {
  test: 'https://prewww1.aeat.es',
  prod: 'https://www1.agenciatributaria.gob.es',
};

/** Ruta del servicio SOAP de remisión de registros de facturación (VERI*FACTU). */
const SOAP_PATH = '/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';

@Injectable()
export class VerifactuConfig {
  /** Entorno activo (por defecto `test` si `VERIFACTU_ENV` trae un valor no reconocido). */
  get env(): VerifactuEnv {
    const e = (process.env.VERIFACTU_ENV ?? '').trim().toLowerCase();
    return e === 'prod' ? 'prod' : 'test';
  }

  /** ¿Remisión real activada? (solo si VERIFACTU_ENV está definido explícitamente). */
  get enabled(): boolean {
    return Boolean((process.env.VERIFACTU_ENV ?? '').trim());
  }

  /** URL completa del servicio SOAP (sobreescribible con VERIFACTU_BASE_URL). */
  get soapUrl(): string {
    const base = (process.env.VERIFACTU_BASE_URL ?? DEFAULT_HOST[this.env]).replace(/\/+$/, '');
    return `${base}${SOAP_PATH}`;
  }

  /** Timeout de las llamadas a la AEAT (ms). */
  get timeoutMs(): number {
    return Number(process.env.VERIFACTU_TIMEOUT_MS ?? 20_000);
  }

  /**
   * Bloque `SistemaInformatico` del registro (RD 1007/2023 art. 9): identificación del productor del SIF.
   * El NIF del productor (Lawzora como fabricante del software) lo aporta el owner vía `VERIFACTU_SIF_NIF`
   * junto con la declaración responsable; sin él la AEAT rechazará el registro en certificación.
   */
  sistemaInformatico(tenantId: string): SistemaInformaticoInfo {
    return {
      nombreRazon: process.env.VERIFACTU_SIF_NOMBRE_RAZON ?? 'Lawzora',
      nif: process.env.VERIFACTU_SIF_NIF ?? '',
      nombreSistemaInformatico: process.env.VERIFACTU_SIF_NOMBRE ?? 'Lawzora',
      idSistemaInformatico: process.env.VERIFACTU_SIF_ID ?? 'LZ',
      version: process.env.VERIFACTU_SIF_VERSION ?? '1.0',
      // Una instalación por despacho: el tenant identifica la instalación del SIF multi-tenant.
      numeroInstalacion: tenantId,
    };
  }
}
