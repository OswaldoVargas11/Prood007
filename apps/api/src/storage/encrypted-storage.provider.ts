import type { StorageProvider } from '@legalflow/domain';
import { decryptBlob, encryptBlob } from './storage-crypto';

/**
 * Red de seguridad anti path-traversal en la CLAVE de almacenamiento. Las claves las construye siempre
 * el servidor con identificadores propios (cuid/tenantId), pero esto rechaza cualquier clave con `..`,
 * separadores absolutos, backslash o bytes nulos por si un sink futuro colara input del usuario.
 */
function assertSafeKey(key: string): void {
  if (
    !key ||
    key.includes('..') ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('\0')
  ) {
    throw new Error('Clave de almacenamiento no válida.');
  }
}

/**
 * Decorador que añade CIFRADO EN REPOSO a cualquier `StorageProvider` (local, MinIO, S3).
 *
 * Cifra el cuerpo antes de delegar en `put` y descifra tras `get`. Es transparente para
 * `DocumentsService`: el contenido sale en claro de `get()` y se almacena cifrado. Como la descarga
 * de documentos pasa por la API (streaming desde `get()`), no por `getSignedUrl`, el cliente nunca
 * recibe el blob cifrado. `getSignedUrl` se delega sin cambios (serviría el objeto cifrado; no se usa
 * para documentos; si se habilitara descarga directa habría que cifrar/descifrar en el borde). Ver D-021.
 */
export class EncryptedStorageProvider implements StorageProvider {
  constructor(
    private readonly inner: StorageProvider,
    private readonly key: Buffer,
  ) {}

  async put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<{ key: string }> {
    assertSafeKey(key);
    const plaintext = Buffer.isBuffer(body) ? body : Buffer.from(body);
    return this.inner.put(key, encryptBlob(this.key, plaintext), contentType);
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    return decryptBlob(this.key, await this.inner.get(key));
  }

  delete(key: string): Promise<void> {
    assertSafeKey(key);
    return this.inner.delete(key);
  }

  getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return this.inner.getSignedUrl(key, expiresInSeconds);
  }
}
