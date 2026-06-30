import { Injectable } from '@nestjs/common';
import { signEnvelopedXml, type SignOptions } from '../dgii/dgii-signer';
import type { DgiiCertMaterial } from '../dgii/dgii-cert';
import { VerifactuCredentialService } from './verifactu-credential.service';

/** Resultado de firmar un registro Verifactu: `null` si el despacho no tiene certificado cargado. */
export interface VerifactuSignResult {
  /** XML del registro de facturación FIRMADO (XAdES-BES enveloped). */
  signedXml: string;
  /** Common Name del certificado con el que se firmó (para auditoría). */
  signedBy: string | null;
}

/**
 * Firma del **registro de facturación Verifactu (AEAT, ES)** con el certificado del despacho.
 *
 * El SIF (Sistema Informático de Facturación) debe firmar electrónicamente cada registro de alta/anulación
 * (RD 1007/2023 + Orden HAC/1177/2024). La firma es **XAdES-BES enveloped** (XML-DSig + propiedades
 * cualificadas) con el certificado del representante del despacho — el MISMO primitivo criptográfico que el
 * e-CF de la DGII, por lo que se reutiliza `signEnvelopedXml`.
 *
 * SEAM CERRADO (sin certificado real): este servicio consume `VerifactuCredentialService.loadCert(tenantId)`
 * (la carga del PEM ya existía) y produce un registro firmado y VERIFICABLE. Lo que queda PENDIENTE DE
 * CERTIFICACIÓN con el certificado real / banco de pruebas de la AEAT:
 *   - el perfil XAdES exacto que exige la AEAT (política de firma, `SigningCertificateV2`),
 *   - la **remisión** SOAP del registro firmado (modalidad VERI*FACTU) → `VerifactuSubmissionService`,
 *     análoga a `ecf-transmission`, en ticket aparte cuando haya banco de pruebas.
 * El seam es estable: solo cambia el cuerpo de la firma / se añade el remisor.
 */
@Injectable()
export class VerifactuSignerService {
  constructor(private readonly credentials: VerifactuCredentialService) {}

  /**
   * Firma el XML del registro de facturación del despacho. Devuelve `null` si el despacho no tiene
   * certificado cargado (gated: el flujo Verifactu sigue conservando el registro sin firma hasta entonces).
   *
   * @param tenantId Despacho emisor (custodia del certificado).
   * @param registroXml XML del registro de facturación a firmar (RegistroAlta / RegistroAnulacion).
   * @param options Opciones de firma (p. ej. `signingTime` inyectable para reproducibilidad en tests).
   */
  async signRecord(
    tenantId: string,
    registroXml: string,
    options?: SignOptions,
  ): Promise<VerifactuSignResult | null> {
    const cert = await this.credentials.loadCert(tenantId);
    if (!cert) return null;
    return this.signWithCert(registroXml, cert, options);
  }

  /** Firma pura con material PEM ya cargado (útil para tests y para reutilizar un cert ya descifrado). */
  signWithCert(
    registroXml: string,
    cert: DgiiCertMaterial,
    options?: SignOptions,
  ): VerifactuSignResult {
    return {
      signedXml: signEnvelopedXml(registroXml, cert, options),
      signedBy: cert.subjectCommonName,
    };
  }
}
