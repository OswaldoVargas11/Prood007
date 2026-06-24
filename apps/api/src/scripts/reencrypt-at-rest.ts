/**
 * Re-cifrado de TODO el contenido at-rest tras una rotación de `DATA_ENCRYPTION_KEY` (D6-001).
 *
 * Contexto: el keyring permite rotar la clave maestra sin downtime — lo nuevo se cifra con la clave
 * activa y lo viejo se sigue descifrando con la(s) clave(s) de `DATA_ENCRYPTION_KEY_RETIRED`. Este script
 * es el paso de LIMPIEZA: re-cifra todo con la clave ACTIVA para poder RETIRAR definitivamente la clave
 * vieja. Mientras no se ejecute, la clave vieja debe permanecer en `DATA_ENCRYPTION_KEY_RETIRED`.
 *
 * Cubre: objetos de almacenamiento (documentos + .p12 DGII en R2) y campos cifrados en BD
 * (`Tenant.certificatePasswordEnc`, `User.mfaSecret`/`mfaBackupCodes`, `OAuthConnection.accessToken`/
 * `refreshToken`). Cross-tenant vía cliente de sistema (BYPASSRLS). Idempotente.
 *
 * Seguridad y operación:
 *  - DRY-RUN por defecto: solo cuenta y reporta. Escribe SOLO con `--confirm`.
 *  - Requiere en el entorno: `DATA_ENCRYPTION_KEY` (nueva/activa) y `DATA_ENCRYPTION_KEY_RETIRED` (vieja),
 *    además de `DATABASE_URL`/`SYSTEM_DATABASE_URL` y las credenciales de almacenamiento de PRODUCCIÓN.
 *  - Cada elemento se procesa con try/catch: un fallo (p. ej. clave no presente en el keyring) se reporta
 *    y NO aborta el lote. NUNCA imprime secretos ni contenido.
 *  - Antes de ejecutar en prod: BACKUP de la BD y del bucket. Tras completar al 100%, retira la clave
 *    vieja de `DATA_ENCRYPTION_KEY_RETIRED` y redespliega.
 *
 * Ejecución (con el entorno de prod cargado):
 *   pnpm --filter @legalflow/api build && node dist/scripts/reencrypt-at-rest.js          # dry-run
 *   pnpm --filter @legalflow/api build && node dist/scripts/reencrypt-at-rest.js --confirm # escribe
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { STORAGE_PROVIDER, type StorageProvider } from '@legalflow/domain';
import { AppModule } from '../app.module';
import { SystemPrismaService } from '../prisma/prisma.service';
import {
  decryptBlob,
  encryptBlob,
  isEncrypted,
  loadEncryptionKeyring,
} from '../storage/storage-crypto';

const CONFIRM = process.argv.includes('--confirm');
const log = new Logger('reencrypt-at-rest');

/** Re-cifra un valor base64 (campo de BD): descifra con el keyring, vuelve a cifrar con la clave activa. */
function reencryptField(keyring: Buffer[], b64: string): string {
  const plain = decryptBlob(keyring, Buffer.from(b64, 'base64'));
  return encryptBlob(keyring[0]!, plain).toString('base64');
}

async function main(): Promise<void> {
  const keyring = loadEncryptionKeyring(
    process.env.DATA_ENCRYPTION_KEY,
    process.env.DATA_ENCRYPTION_KEY_RETIRED,
  );
  if (!keyring) {
    log.error('DATA_ENCRYPTION_KEY no configurada: nada que re-cifrar.');
    process.exit(1);
  }
  log.log(
    `Keyring: 1 clave activa + ${keyring.length - 1} retirada(s). Modo: ${
      CONFIRM ? 'CONFIRM (escribe)' : 'DRY-RUN (solo cuenta)'
    }.`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get(SystemPrismaService);
  const storage = app.get<StorageProvider>(STORAGE_PROVIDER);
  const stats: Record<string, { ok: number; failed: number }> = {};
  const bump = (k: string, f: 'ok' | 'failed') => {
    stats[k] ??= { ok: 0, failed: 0 };
    stats[k][f]++;
  };

  // ── Campos cifrados en BD ──────────────────────────────────────────────────
  const tenants = await db.tenant.findMany({
    where: { certificatePasswordEnc: { not: null } },
    select: { id: true, certificatePasswordEnc: true },
  });
  for (const t of tenants) {
    try {
      const next = reencryptField(keyring, t.certificatePasswordEnc!);
      if (CONFIRM)
        await db.tenant.update({ where: { id: t.id }, data: { certificatePasswordEnc: next } });
      bump('Tenant.certificatePasswordEnc', 'ok');
    } catch (e) {
      log.error(`Tenant ${t.id} certificatePasswordEnc: ${(e as Error).message}`);
      bump('Tenant.certificatePasswordEnc', 'failed');
    }
  }

  const users = await db.user.findMany({
    where: { OR: [{ mfaSecret: { not: null } }, { mfaBackupCodes: { not: null } }] },
    select: { id: true, mfaSecret: true, mfaBackupCodes: true },
  });
  for (const u of users) {
    try {
      const data: { mfaSecret?: string; mfaBackupCodes?: string } = {};
      if (u.mfaSecret) data.mfaSecret = reencryptField(keyring, u.mfaSecret);
      if (u.mfaBackupCodes) data.mfaBackupCodes = reencryptField(keyring, u.mfaBackupCodes);
      if (CONFIRM) await db.user.update({ where: { id: u.id }, data });
      bump('User.mfa*', 'ok');
    } catch (e) {
      log.error(`User ${u.id} mfa: ${(e as Error).message}`);
      bump('User.mfa*', 'failed');
    }
  }

  const conns = await db.oAuthConnection.findMany({
    select: { id: true, accessToken: true, refreshToken: true },
  });
  for (const c of conns) {
    try {
      const data: { accessToken?: string; refreshToken?: string } = {
        accessToken: reencryptField(keyring, c.accessToken),
      };
      if (c.refreshToken) data.refreshToken = reencryptField(keyring, c.refreshToken);
      if (CONFIRM) await db.oAuthConnection.update({ where: { id: c.id }, data });
      bump('OAuthConnection.tokens', 'ok');
    } catch (e) {
      log.error(`OAuthConnection ${c.id}: ${(e as Error).message}`);
      bump('OAuthConnection.tokens', 'failed');
    }
  }

  // ── Objetos de almacenamiento (re-cifrado vía get→put: get descifra con el keyring, put cifra con la
  //    clave activa). Documentos + el .p12 de cada despacho. ──────────────────────────────────────────
  const versions = await db.documentVersion.findMany({
    select: { id: true, storageKey: true, mimeType: true },
  });
  for (const v of versions) {
    try {
      const buf = await storage.get(v.storageKey);
      if (CONFIRM) await storage.put(v.storageKey, buf, v.mimeType);
      bump('storage:document', 'ok');
    } catch (e) {
      log.error(`DocumentVersion ${v.id} (${v.storageKey}): ${(e as Error).message}`);
      bump('storage:document', 'failed');
    }
  }

  const certs = await db.tenant.findMany({
    where: { certificateKey: { not: null } },
    select: { id: true, certificateKey: true },
  });
  for (const t of certs) {
    try {
      const buf = await storage.get(t.certificateKey!);
      // Solo re-cifra si está cifrado (defensa: no toca un .p12 legacy en claro sin querer).
      if (CONFIRM && isEncrypted(Buffer.from(buf)))
        await storage.put(t.certificateKey!, buf, 'application/x-pkcs12');
      bump('storage:p12', 'ok');
    } catch (e) {
      log.error(`Tenant ${t.id} cert (${t.certificateKey}): ${(e as Error).message}`);
      bump('storage:p12', 'failed');
    }
  }

  await app.close();
  log.log(`Resumen (${CONFIRM ? 'escrito' : 'simulado'}):`);
  for (const [k, v] of Object.entries(stats)) log.log(`  ${k}: ${v.ok} ok, ${v.failed} fallidos`);
  const failed = Object.values(stats).reduce((n, v) => n + v.failed, 0);
  if (failed > 0) {
    log.error(`${failed} elemento(s) fallaron — NO retires la clave vieja hasta resolverlos.`);
    process.exit(2);
  }
  if (!CONFIRM) log.warn('DRY-RUN: no se escribió nada. Re-ejecuta con --confirm para aplicar.');
}

main().catch((e) => {
  log.error(e);
  process.exit(1);
});
