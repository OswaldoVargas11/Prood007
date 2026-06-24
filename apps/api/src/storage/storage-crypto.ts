import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado en reposo de objetos (AES-256-GCM) — envelope a nivel de aplicación, agnóstico del backend.
 *
 * Formato del blob cifrado: [MAGIC(6) | IV(12) | TAG(16) | ciphertext]. El MAGIC permite distinguir
 * un objeto cifrado de uno legacy en claro (migración suave: los documentos previos se leen tal cual).
 * GCM aporta autenticación: manipular el blob hace fallar el descifrado (no devuelve datos corruptos).
 *
 * La clave (`DATA_ENCRYPTION_KEY`) es de 32 bytes en base64 (AES-256). Es secreto: fuerte, aparte,
 * nunca logueada. Ver D-021.
 */
const MAGIC = Buffer.from('LFENC1'); // 6 bytes: marca + versión de formato
const IV_LEN = 12; // nonce GCM recomendado
const TAG_LEN = 16; // tag de autenticación GCM

/** Parsea y valida una clave base64 de 32 bytes (AES-256). */
function parseKey(raw: string): Buffer {
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY debe ser 32 bytes codificados en base64 (AES-256).');
  }
  return key;
}

/** Parsea y valida la clave base64. Devuelve null si no hay clave (cifrado desactivado). */
export function loadEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  return parseKey(raw);
}

/**
 * KEYRING de cifrado en reposo (D6-001). Hace POSIBLE la rotación de la clave maestra (acción de owner
 * pendiente tras la fuga de C1) SIN romper el descifrado de lo ya cifrado:
 *  - `active` (`DATA_ENCRYPTION_KEY`) cifra SIEMPRE las escrituras nuevas.
 *  - `retired` (`DATA_ENCRYPTION_KEY_RETIRED`, base64 separadas por coma) son claves antiguas que SOLO se
 *    usan para descifrar blobs previos. Como el envelope no lleva keyId, el descifrado prueba cada clave
 *    en orden y GCM (tag autenticado) confirma cuál es la correcta.
 * Procedimiento de rotación 0-downtime: generar clave nueva → poner la vieja en `*_RETIRED` y la nueva en
 * `DATA_ENCRYPTION_KEY` → desplegar (lo nuevo se cifra con la nueva; lo viejo aún se lee) → re-cifrar en
 * segundo plano (script) → retirar la clave vieja de `*_RETIRED`.
 * Devuelve null si no hay clave activa (cifrado desactivado). `[0]` es siempre la activa.
 */
export function loadEncryptionKeyring(
  active: string | undefined,
  retired?: string | undefined,
): Buffer[] | null {
  const activeKey = loadEncryptionKey(active);
  if (!activeKey) return null;
  const retiredKeys = (retired ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseKey);
  return [activeKey, ...retiredKeys];
}

/** ¿El blob lleva la marca de cifrado de LegalFlow? */
export function isEncrypted(blob: Buffer): boolean {
  return blob.length >= MAGIC.length && blob.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encryptBlob(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  // authTagLength explícito (= TAG_LEN): el formato del blob ya fija el tag a 16 B, pero declararlo
  // evita que se acepte un tag más corto de lo esperado (defensa en profundidad, CWE-310).
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

/**
 * Descifra un blob; si NO lleva la marca (legacy en claro), lo devuelve sin tocar. Acepta una clave única
 * o un keyring (Buffer[]): con keyring, prueba cada clave en orden y devuelve el primer descifrado válido
 * (GCM autentica la clave correcta). Si ninguna funciona, propaga el error de la última (clave equivocada
 * o blob manipulado). Soporta rotación de clave sin keyId en el envelope.
 */
export function decryptBlob(keyOrKeyring: Buffer | Buffer[], blob: Buffer): Buffer {
  if (!isEncrypted(blob)) return blob;
  const iv = blob.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = blob.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  const keys = Array.isArray(keyOrKeyring) ? keyOrKeyring : [keyOrKeyring];
  let lastErr: unknown = new Error('Keyring de descifrado vacío.');
  for (const k of keys) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', k, iv, { authTagLength: TAG_LEN });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
