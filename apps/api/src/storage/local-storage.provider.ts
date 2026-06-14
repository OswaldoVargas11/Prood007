import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StorageProvider } from '@legalflow/domain';

/**
 * Implementación de StorageProvider sobre disco local (desarrollo/test).
 * No expone rutas al cliente: la descarga se sirve por la API en streaming, así que getSignedUrl
 * devuelve solo una referencia interna.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    this.baseDir = resolve(config.get<string>('STORAGE_LOCAL_PATH', './storage'));
  }

  private safePath(key: string): string {
    // Evita path traversal: normaliza y exige que quede dentro de baseDir.
    const target = resolve(join(this.baseDir, key));
    if (target !== this.baseDir && !target.startsWith(this.baseDir + sep)) {
      throw new Error('Clave de almacenamiento no válida.');
    }
    return target;
  }

  async put(key: string, body: Buffer | Uint8Array): Promise<{ key: string }> {
    const path = this.safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key };
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.safePath(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.safePath(key), { force: true });
  }

  getSignedUrl(key: string): Promise<string> {
    // En local no hay URL firmada real; la descarga va por endpoint autenticado de la API.
    return Promise.resolve(`local://${key}`);
  }
}
