/**
 * StorageProvider — interfaz de almacenamiento de objetos, agnóstica del backend.
 * Implementaciones: S3-compatible (MinIO en dev) y disco local. El núcleo solo conoce esto.
 */
export interface StorageProvider {
  /** Sube un objeto y devuelve su clave/identificador. */
  put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<{ key: string }>;
  /** Descarga un objeto. */
  get(key: string): Promise<Buffer>;
  /** Elimina un objeto. */
  delete(key: string): Promise<void>;
  /** URL temporal firmada para descarga directa por el cliente. */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
