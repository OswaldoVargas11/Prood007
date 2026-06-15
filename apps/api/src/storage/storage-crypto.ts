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

/** Parsea y valida la clave base64. Devuelve null si no hay clave (cifrado desactivado). */
export function loadEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY debe ser 32 bytes codificados en base64 (AES-256).');
  }
  return key;
}

/** ¿El blob lleva la marca de cifrado de LegalFlow? */
export function isEncrypted(blob: Buffer): boolean {
  return blob.length >= MAGIC.length && blob.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encryptBlob(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

/** Descifra un blob; si NO lleva la marca (legacy en claro), lo devuelve sin tocar. */
export function decryptBlob(key: Buffer, blob: Buffer): Buffer {
  if (!isEncrypted(blob)) return blob;
  const iv = blob.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = blob.subarray(MAGIC.length + IV_LEN, MAGIC.length + IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(MAGIC.length + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
