import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from '@legalflow/domain';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Provee STORAGE_PROVIDER según STORAGE_DRIVER (local | minio | s3). El núcleo solo conoce la
 * interfaz StorageProvider; cambiar de backend no toca la lógica de documentos.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local');
        return driver === 'local'
          ? new LocalStorageProvider(config)
          : new S3StorageProvider(config);
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
