import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import * as QRCode from 'qrcode';
import { SystemPrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { decryptBlob, encryptBlob, loadEncryptionKey } from '../storage/storage-crypto';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp.util';
import { apiError } from '../common/api-messages';
import type { RequestUser } from './auth.types';

const BACKUP_CODE_COUNT = 10;

/**
 * MFA (2FA TOTP). El secreto se guarda CIFRADO (AES-256-GCM). Flujo: setup (genera secreto + QR, aún sin
 * activar) → enable (confirma con un código, activa y entrega los códigos de respaldo una sola vez) →
 * en cada login se exige un código (TOTP o de respaldo). disable lo desactiva tras verificar.
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly system: SystemPrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private key() {
    const k = loadEncryptionKey(this.config.get<string>('DATA_ENCRYPTION_KEY'));
    if (!k) throw new BadRequestException(apiError('mfa.notConfigured'));
    return k;
  }
  private enc(s: string): string {
    return encryptBlob(this.key(), Buffer.from(s, 'utf8')).toString('base64');
  }
  private dec(b64: string): string {
    return decryptBlob(this.key(), Buffer.from(b64, 'base64')).toString('utf8');
  }

  async status(user: RequestUser) {
    const u = await this.system.user.findUnique({
      where: { id: user.userId },
      select: { mfaEnabled: true },
    });
    return { enabled: Boolean(u?.mfaEnabled) };
  }

  /** Genera un secreto (pendiente, no activa) y devuelve el QR + el secreto para introducir a mano. */
  async setup(user: RequestUser) {
    const secret = generateTotpSecret();
    await this.system.user.update({
      where: { id: user.userId },
      data: { mfaSecret: this.enc(secret), mfaEnabled: false },
    });
    const uri = otpauthUri(secret, user.email);
    const qrDataUrl = await QRCode.toDataURL(uri);
    return { secret, otpauthUri: uri, qrDataUrl };
  }

  /** Confirma el código contra el secreto pendiente, activa MFA y entrega códigos de respaldo (una vez). */
  async enable(user: RequestUser, code: string) {
    const u = await this.system.user.findUnique({
      where: { id: user.userId },
      select: { mfaSecret: true, mfaEnabled: true },
    });
    if (!u?.mfaSecret) throw new BadRequestException(apiError('mfa.notStarted'));
    if (u.mfaEnabled) throw new BadRequestException(apiError('mfa.alreadyEnabled'));
    if (!verifyTotp(this.dec(u.mfaSecret), code)) {
      throw new BadRequestException(apiError('mfa.invalidCode'));
    }
    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(5).toString('hex'),
    );
    const hashes = await Promise.all(backupCodes.map((c) => argon2.hash(c)));
    await this.system.user.update({
      where: { id: user.userId },
      data: { mfaEnabled: true, mfaBackupCodes: JSON.stringify(hashes) },
    });
    await this.audit.log(user, 'mfa.enabled', 'User', user.userId);
    return { backupCodes };
  }

  async disable(user: RequestUser, code: string) {
    const u = await this.system.user.findUnique({
      where: { id: user.userId },
      select: { mfaSecret: true, mfaEnabled: true, mfaBackupCodes: true },
    });
    if (!u?.mfaEnabled || !u.mfaSecret) throw new BadRequestException(apiError('mfa.notEnabled'));
    const ok = await this.verifySecretOrBackup(user.userId, u.mfaSecret, u.mfaBackupCodes, code);
    if (!ok) throw new BadRequestException(apiError('mfa.invalidCode'));
    await this.system.user.update({
      where: { id: user.userId },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null },
    });
    await this.audit.log(user, 'mfa.disabled', 'User', user.userId);
    return { success: true };
  }

  /** Verificación en el LOGIN (sin sesión): comprueba el código de un usuario por id. */
  async verifyForLogin(userId: string, code: string): Promise<boolean> {
    const u = await this.system.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true, mfaBackupCodes: true },
    });
    if (!u?.mfaEnabled || !u.mfaSecret) return false;
    return this.verifySecretOrBackup(userId, u.mfaSecret, u.mfaBackupCodes, code);
  }

  /** Acepta un código TOTP o uno de respaldo (que se consume). */
  private async verifySecretOrBackup(
    userId: string,
    encSecret: string,
    backupJson: string | null,
    code: string,
  ): Promise<boolean> {
    if (verifyTotp(this.dec(encSecret), code)) return true;
    // Código de respaldo: se compara contra cada hash y, si coincide, se elimina (un solo uso).
    const normalized = code.replace(/\s/g, '').toLowerCase();
    const hashes: string[] = backupJson ? JSON.parse(backupJson) : [];
    for (let i = 0; i < hashes.length; i++) {
      if (await argon2.verify(hashes[i]!, normalized)) {
        hashes.splice(i, 1);
        await this.system.user.update({
          where: { id: userId },
          data: { mfaBackupCodes: JSON.stringify(hashes) },
        });
        return true;
      }
    }
    return false;
  }
}
