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
import { loadCertFromP12 } from './dgii-cert';
import type { DgiiCert } from './dgii-submission.service';

/**
 * Custodia del certificado digital (.p12) del despacho para firmar el e-CF. El fichero se guarda en el
 * StorageProvider (CIFRADO en reposo, AES-256-GCM) y la contraseña se cifra aparte con la misma clave
 * maestra (`DATA_ENCRYPTION_KEY`); ninguna se persiste ni se loguea en claro. Se descifran en memoria solo
 * para firmar. Reutiliza los campos `certificate*` del Tenant + `certificatePasswordEnc`.
 */
@Injectable()
export class DgiiCredentialService {
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
    return `${tenantId}/dgii/certificate.p12`;
  }

  /** Sube el .p12 del despacho. Valida que abre con la contraseña ANTES de guardar (cifrado en reposo). */
  async upload(
    tenantId: string,
    p12: Buffer,
    password: string,
    name: string,
  ): Promise<{ commonName: string | null }> {
    let material;
    try {
      material = loadCertFromP12(p12, password); // lanza si la contraseña es incorrecta o el .p12 es inválido
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
        certificateName: name,
        certificateKey: key,
        certificateUploadedAt: new Date(),
        certificatePasswordEnc: passwordEnc,
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
      select: { certificateKey: true, certificateName: true, certificateUploadedAt: true },
    });
    return {
      uploaded: Boolean(t?.certificateKey),
      name: t?.certificateName ?? null,
      uploadedAt: t?.certificateUploadedAt ?? null,
    };
  }

  /** Carga el certificado del despacho (descifrado) para firmar, o null si no hay. */
  async getCert(tenantId: string): Promise<DgiiCert | null> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { certificateKey: true, certificatePasswordEnc: true },
    });
    if (!t?.certificateKey || !t.certificatePasswordEnc) return null;
    const p12 = await this.storage.get(t.certificateKey);
    // Descifra con el keyring (activa + retiradas) para soportar rotación de la clave maestra (D6-001).
    this.key(); // valida que hay clave maestra configurada (lanza si no)
    const ring = loadEncryptionKeyring(
      this.config.get<string>('DATA_ENCRYPTION_KEY'),
      this.config.get<string>('DATA_ENCRYPTION_KEY_RETIRED'),
    )!;
    const password = decryptBlob(ring, Buffer.from(t.certificatePasswordEnc, 'base64')).toString(
      'utf8',
    );
    return { p12, password };
  }
}
