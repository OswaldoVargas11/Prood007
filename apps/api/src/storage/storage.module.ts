import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER, type StorageProvider } from '@legalflow/domain';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { EncryptedStorageProvider } from './encrypted-storage.provider';
import { loadEncryptionKey } from './storage-crypto';

/**
 * Provee STORAGE_PROVIDER según STORAGE_DRIVER (local | minio | s3). El núcleo solo conoce la
 * interfaz StorageProvider; cambiar de backend no toca la lógica de documentos.
 *
 * CIFRADO EN REPOSO (D-021): si hay `DATA_ENCRYPTION_KEY`, el backend se envuelve en
 * `EncryptedStorageProvider` (AES-256-GCM). En producción la clave es OBLIGATORIA (si falta, se lanza
 * un error de arranque en vez de guardar documentos en claro); en dev/CI se permite sin clave con aviso.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageProvider => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local');
        const base: StorageProvider =
          driver === 'local' ? new LocalStorageProvider(config) : new S3StorageProvider(config);

        const key = loadEncryptionKey(config.get<string>('DATA_ENCRYPTION_KEY'));
        if (key) {
          return new EncryptedStorageProvider(base, key);
        }
        if (config.get<string>('NODE_ENV') === 'production') {
          throw new Error(
            'DATA_ENCRYPTION_KEY es obligatorio en producción: el contenido de los documentos debe ' +
              'cifrarse en reposo. Genera una clave AES-256 (32 bytes en base64) y decláralala como ' +
              'DATA_ENCRYPTION_KEY.',
          );
        }
        new Logger('StorageModule').warn(
          'DATA_ENCRYPTION_KEY no definido; los documentos se guardan SIN cifrar en reposo (solo dev/CI).',
        );
        return base;
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
