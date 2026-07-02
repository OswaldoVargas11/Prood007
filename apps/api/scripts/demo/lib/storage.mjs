/**
 * Escritor de objetos que ESPEJA exactamente el StorageProvider de la API, para que los ficheros
 * sembrados (PDFs, textos del redline) sean LEGIBLES por la API en runtime:
 *   · driver: STORAGE_DRIVER = local | minio | s3   (default local)
 *   · cifrado en reposo: si hay DATA_ENCRYPTION_KEY, envuelve el blob en el MISMO formato
 *     AES-256-GCM [MAGIC(6)='LFENC1' | IV(12) | TAG(16) | ciphertext] que `storage-crypto.ts` (D-021).
 *
 * Es BEST-EFFORT: si el backend no está disponible (p. ej. MinIO apagado en local), avisa y sigue.
 * Las filas en BD ya existen → las vistas de lista/detalle salen llenas; solo la descarga/preview
 * (y el redline, que extrae texto del fichero) se degradan. Ver README.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createCipheriv, randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { API_DIR } from './env.mjs';

const MAGIC = Buffer.from('LFENC1');
const IV_LEN = 12;
const TAG_LEN = 16;

function loadKey() {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY debe ser 32 bytes en base64 (AES-256), como en la API.');
  }
  return key;
}

function encryptBlob(key, plaintext) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

/** Crea un escritor de almacenamiento según el entorno. Lazy: el cliente MinIO solo si hace falta. */
export function makeStorage() {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  const key = loadKey();
  const wrap = (buf) => (key ? encryptBlob(key, Buffer.from(buf)) : Buffer.from(buf));
  const warned = new Set();

  if (driver === 'local') {
    // La API resuelve `STORAGE_LOCAL_PATH` (default ./storage) contra su CWD (apps/api). Igualamos
    // ese criterio para que los objetos caigan donde la API los buscará.
    const rawPath = process.env.STORAGE_LOCAL_PATH ?? './storage';
    const baseDir = isAbsolute(rawPath) ? rawPath : resolve(API_DIR, rawPath);
    return {
      label: `local:${baseDir}`,
      async put(key2, body) {
        try {
          const target = resolve(join(baseDir, key2));
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, wrap(body));
          return true;
        } catch (e) {
          if (!warned.has('put')) {
            console.warn(
              `  ⚠ almacenamiento local no escribible (${e.message}); sigo sin fichero.`,
            );
            warned.add('put');
          }
          return false;
        }
      },
      async purgePrefix(prefix) {
        try {
          await rm(resolve(join(baseDir, prefix)), { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      },
    };
  }

  // minio | s3 → cliente `minio` (mismo paquete que usa S3StorageProvider).
  let clientPromise = null;
  async function client() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const Minio = await import('minio');
        const endpoint = new URL(process.env.STORAGE_ENDPOINT);
        return {
          c: new Minio.Client({
            endPoint: endpoint.hostname,
            port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
            useSSL: endpoint.protocol === 'https:',
            accessKey: process.env.STORAGE_ACCESS_KEY,
            secretKey: process.env.STORAGE_SECRET_KEY,
            region: process.env.STORAGE_REGION ?? 'us-east-1',
          }),
          bucket: process.env.STORAGE_BUCKET,
        };
      })();
    }
    return clientPromise;
  }

  return {
    label: `${driver}:${process.env.STORAGE_BUCKET ?? '(sin bucket)'}`,
    async put(key2, body, contentType = 'application/octet-stream') {
      try {
        const { c, bucket } = await client();
        const buf = wrap(body);
        await c.putObject(bucket, key2, buf, buf.length, { 'Content-Type': contentType });
        return true;
      } catch (e) {
        if (!warned.has('put')) {
          console.warn(`  ⚠ MinIO/S3 no disponible (${e.message}); sigo sin subir ficheros.`);
          warned.add('put');
        }
        return false;
      }
    },
    async purgePrefix(prefix) {
      try {
        const { c, bucket } = await client();
        const objs = [];
        await new Promise((res, rej) => {
          const stream = c.listObjectsV2(bucket, prefix, true);
          stream.on('data', (o) => objs.push(o.name));
          stream.on('end', res);
          stream.on('error', rej);
        });
        if (objs.length) await c.removeObjects(bucket, objs);
      } catch {
        /* best-effort */
      }
    },
  };
}
