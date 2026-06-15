import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import type { StorageProvider } from '@legalflow/domain';

/**
 * Implementación de StorageProvider sobre almacenamiento S3-compatible (MinIO en dev, S3 en prod),
 * usando el cliente `minio`. Se selecciona con STORAGE_DRIVER=minio|s3.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: Minio.Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint = new URL(config.getOrThrow<string>('STORAGE_ENDPOINT'));
    this.bucket = config.getOrThrow<string>('STORAGE_BUCKET');
    this.client = new Minio.Client({
      endPoint: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
      useSSL: endpoint.protocol === 'https:',
      accessKey: config.getOrThrow<string>('STORAGE_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('STORAGE_SECRET_KEY'),
      region: config.get<string>('STORAGE_REGION', 'us-east-1'),
    });
  }

  async put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<{ key: string }> {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolvePromise, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolvePromise(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expiresInSeconds);
  }
}
