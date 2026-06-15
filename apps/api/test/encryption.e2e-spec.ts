import { randomBytes } from 'node:crypto';
import {
  decryptBlob,
  encryptBlob,
  isEncrypted,
  loadEncryptionKey,
} from '../src/storage/storage-crypto';
import { EncryptedStorageProvider } from '../src/storage/encrypted-storage.provider';
import type { StorageProvider } from '@legalflow/domain';

/**
 * Cifrado en reposo (D-021). Pruebas puras (sin BD): round-trip, passthrough de objetos legacy en
 * claro, autenticación (manipular el blob falla), validación de la clave y el decorador de storage.
 */
describe('Cifrado en reposo de objetos (AES-256-GCM)', () => {
  const key = randomBytes(32);
  const plaintext = Buffer.from('Contenido confidencial del documento jurídico — ñ áéí 🔒');

  it('round-trip: descifrar lo cifrado devuelve el original exacto', () => {
    const blob = encryptBlob(key, plaintext);
    expect(isEncrypted(blob)).toBe(true);
    expect(blob.equals(plaintext)).toBe(false); // no es claro
    expect(decryptBlob(key, blob).equals(plaintext)).toBe(true);
  });

  it('dos cifrados del mismo texto difieren (IV aleatorio)', () => {
    expect(encryptBlob(key, plaintext).equals(encryptBlob(key, plaintext))).toBe(false);
  });

  it('passthrough: un blob legacy en claro (sin marca) se devuelve sin tocar', () => {
    const legacy = Buffer.from('documento antiguo sin cifrar');
    expect(isEncrypted(legacy)).toBe(false);
    expect(decryptBlob(key, legacy).equals(legacy)).toBe(true);
  });

  it('autenticación: manipular el ciphertext hace fallar el descifrado', () => {
    const blob = encryptBlob(key, plaintext);
    const last = blob.length - 1;
    blob[last] = (blob[last] ?? 0) ^ 0xff; // corrompe el último byte
    expect(() => decryptBlob(key, blob)).toThrow();
  });

  it('una clave distinta no descifra', () => {
    const blob = encryptBlob(key, plaintext);
    expect(() => decryptBlob(randomBytes(32), blob)).toThrow();
  });

  it('loadEncryptionKey valida tamaño (32 bytes) y ausencia', () => {
    expect(loadEncryptionKey(undefined)).toBeNull();
    expect(loadEncryptionKey('')).toBeNull();
    expect(() => loadEncryptionKey(Buffer.from('corta').toString('base64'))).toThrow();
    expect(loadEncryptionKey(randomBytes(32).toString('base64'))).toHaveLength(32);
  });

  describe('EncryptedStorageProvider (decorador)', () => {
    it('almacena cifrado en el backend y devuelve claro en get', async () => {
      const store = new Map<string, Buffer>();
      const inner: StorageProvider = {
        put: async (k, body) => {
          store.set(k, Buffer.isBuffer(body) ? body : Buffer.from(body));
          return { key: k };
        },
        get: async (k) => store.get(k)!,
        delete: async (k) => void store.delete(k),
        getSignedUrl: async (k) => `signed://${k}`,
      };
      const provider = new EncryptedStorageProvider(inner, key);

      await provider.put('docs/v1', plaintext, 'application/pdf');

      // En el backend está cifrado...
      const atRest = store.get('docs/v1')!;
      expect(isEncrypted(atRest)).toBe(true);
      expect(atRest.includes(plaintext)).toBe(false);

      // ...pero get lo devuelve en claro.
      expect((await provider.get('docs/v1')).equals(plaintext)).toBe(true);
    });
  });
});
