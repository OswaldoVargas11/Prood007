import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from '@legalflow/domain';
import type { StorageProvider } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptBlob,
  encryptBlob,
  loadEncryptionKey,
  loadEncryptionKeyring,
} from '../storage/storage-crypto';
import { loadCertFromP12, type DgiiCertMaterial } from '../dgii/dgii-cert';

/**
 * Custodia del certificado de firma de **Verifactu (ES)** del despacho — FNMT o representante de persona
 * jurídica, en `.p12`/`.pfx`. Mismo modelo de seguridad que el certificado e-CF de la DGII: el fichero se
 * guarda CIFRADO en el StorageProvider (AES-256-GCM) y la contraseña se cifra aparte con la clave maestra;
 * se descifran en memoria solo para firmar. SEPARADO del de DGII (un despacho dual ES+DO usa ambos).
 *
 * Esto deja LISTA la subida del certificado; la FIRMA del registro Verifactu y la remisión a la AEAT se
 * enchufan en la fase de certificación con el certificado real (ver docs/fiscal/FINISHING-CHECKLIST.md):
 * `loadCert()` ya entrega el material PEM al firmador cuando se implemente.
 */
@Injectable()
export class VerifactuCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly config: ConfigService,
  ) {}

  private key(): Buffer {
    const k = loadEncryptionKey(this.config.get<string>('DATA_ENCRYPTION_KEY'));
    if (!k)
      throw new BadRequestException(
        'DATA_ENCRYPTION_KEY no está configurada: no se puede guardar el certificado de forma segura.',
      );
    return k;
  }

  private storageKey(tenantId: string): string {
    return `${tenantId}/verifactu/certificate.p12`;
  }

  /** Sube el .p12 del despacho. Valida que abre con la contraseña ANTES de guardar (cifrado en reposo). */
  async upload(
    tenantId: string,
    p12: Buffer,
    password: string,
    name: string,
  ): Promise<{ commonName: string | null }> {
    let material: DgiiCertMaterial;
    try {
      material = loadCertFromP12(p12, password);
    } catch {
      throw new BadRequestException(
        'El certificado .p12 no es válido o la contraseña es incorrecta.',
      );
    }
    const key = this.storageKey(tenantId);
    await this.storage.put(key, p12, 'application/x-pkcs12');
    const passwordEnc = encryptBlob(this.key(), Buffer.from(password, 'utf8')).toString('base64');
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        verifactuCertName: name,
        verifactuCertKey: key,
        verifactuCertUploadedAt: new Date(),
        verifactuCertPasswordEnc: passwordEnc,
      },
    });
    return { commonName: material.subjectCommonName };
  }

  /** Metadatos del certificado (sin exponer el fichero ni la contraseña). */
  async status(
    tenantId: string,
  ): Promise<{ uploaded: boolean; name: string | null; uploadedAt: Date | null }> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { verifactuCertKey: true, verifactuCertName: true, verifactuCertUploadedAt: true },
    });
    return {
      uploaded: Boolean(t?.verifactuCertKey),
      name: t?.verifactuCertName ?? null,
      uploadedAt: t?.verifactuCertUploadedAt ?? null,
    };
  }

  /**
   * Carga el material PEM (clave privada + certificado) del despacho para FIRMAR el registro Verifactu.
   * Punto de enganche para la firma (pendiente de certificación). Devuelve null si no hay certificado.
   */
  async loadCert(tenantId: string): Promise<DgiiCertMaterial | null> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { verifactuCertKey: true, verifactuCertPasswordEnc: true },
    });
    if (!t?.verifactuCertKey || !t.verifactuCertPasswordEnc) return null;
    const p12 = await this.storage.get(t.verifactuCertKey);
    this.key(); // valida clave maestra
    const ring = loadEncryptionKeyring(
      this.config.get<string>('DATA_ENCRYPTION_KEY'),
      this.config.get<string>('DATA_ENCRYPTION_KEY_RETIRED'),
    )!;
    const password = decryptBlob(ring, Buffer.from(t.verifactuCertPasswordEnc, 'base64')).toString(
      'utf8',
    );
    return loadCertFromP12(p12, password);
  }
}
