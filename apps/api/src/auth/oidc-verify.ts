import {
  createPublicKey,
  verify as cryptoVerify,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

/**
 * Verificación de la FIRMA de un `id_token` OIDC contra el JWKS del proveedor (H-1).
 *
 * Antes esto solo decodificaba el payload en base64 y validaba `aud`/`exp` confiando en que el token
 * llegaba por TLS desde el `tokenUrl` del IdP. Eso es frágil: `aud`/`exp` viven dentro de un blob sin
 * firmar, y cualquier cambio futuro de canal lo volvería falsificable. Aquí verificamos de verdad la
 * firma RS256 con la clave pública del IdP (descargada de su JWKS) — el control canónico contra la
 * suplantación de proveedor / toma de cuenta.
 *
 * Sin dependencias nuevas: Node 20 sabe construir una `KeyObject` desde un JWK (`format: 'jwk'`) y
 * verificar RSASSA-PKCS1-v1_5+SHA-256 (`RSA-SHA256`).
 */

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

interface JwksCacheEntry {
  keys: Jwk[];
  fetchedAt: number;
}

/** Cache en memoria del JWKS por URI. TTL de 1h; ante un `kid` desconocido se refresca una vez. */
const jwksCache = new Map<string, JwksCacheEntry>();
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 4000;

async function fetchJwks(jwksUri: string): Promise<Jwk[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(jwksUri, { signal: controller.signal });
    if (!res.ok) throw new Error(`JWKS ${jwksUri} respondió ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    if (!Array.isArray(body.keys)) throw new Error('JWKS sin array `keys`');
    return body.keys;
  } finally {
    clearTimeout(timer);
  }
}

/** Resuelve la JWK por `kid`, refrescando el cache una vez si no aparece (rotación de claves del IdP). */
async function resolveKey(jwksUri: string, kid: string | undefined): Promise<KeyObject> {
  const cached = jwksCache.get(jwksUri);
  const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
  let keys = fresh ? cached!.keys : undefined;

  const pick = (ks: Jwk[]): Jwk | undefined =>
    kid ? ks.find((k) => k.kid === kid) : ks.find((k) => k.kty === 'RSA');

  if (!keys || !pick(keys)) {
    // Sin cache válido, o el `kid` no está en el cache (clave rotada): descarga fresca.
    keys = await fetchJwks(jwksUri);
    jwksCache.set(jwksUri, { keys, fetchedAt: Date.now() });
  }
  const jwk = pick(keys);
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    throw new Error('no se encontró una clave RSA que case con el `kid` del id_token');
  }
  return createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
}

function b64urlToJson(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

export interface VerifiedIdTokenClaims {
  email?: string;
  email_verified?: boolean | string;
  [k: string]: unknown;
}

export interface VerifyIdTokenOptions {
  /** Endpoint JWKS del proveedor (Google / Microsoft). */
  jwksUri: string;
  /** `aud` esperado (== nuestro clientId). */
  audience: string;
  /** Validación del emisor: exacto (Google) o por predicado (Microsoft `common` → tenant variable). */
  issuer: (iss: string) => boolean;
  /** Nonce OIDC esperado: debe coincidir con el `nonce` enviado en la petición de autorización. */
  nonce: string;
  /** Margen de reloj en segundos (por defecto 60). */
  clockToleranceSec?: number;
}

/**
 * Verifica firma + claims de un `id_token`. Lanza si algo falla; devuelve los claims si es válido.
 * Comprueba, en orden: estructura, `alg: RS256`, firma contra el JWKS, `iss`, `aud`, `exp`/`iat`,
 * y el `nonce` (anti login-CSRF / inyección de código).
 */
export async function verifyIdToken(
  idToken: string,
  opts: VerifyIdTokenOptions,
): Promise<VerifiedIdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('id_token malformado');
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const header = b64urlToJson(headerB64) as { alg?: string; kid?: string };
  // Solo RS256: rechaza `alg: none` y la confusión de algoritmo (HS256 con la clave pública como secreto).
  if (header.alg !== 'RS256') throw new Error(`alg no soportado: ${String(header.alg)}`);

  const key = await resolveKey(opts.jwksUri, header.kid);
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature = Buffer.from(sigB64, 'base64url');
  const ok = cryptoVerify('RSA-SHA256', signingInput, key, signature);
  if (!ok) throw new Error('firma del id_token inválida');

  const claims = b64urlToJson(payloadB64) as VerifiedIdTokenClaims & {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    nonce?: string;
  };

  const tol = opts.clockToleranceSec ?? 60;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp + tol < now)
    throw new Error('id_token caducado');
  if (typeof claims.iat === 'number' && claims.iat - tol > now) throw new Error('id_token futuro');

  if (typeof claims.iss !== 'string' || !opts.issuer(claims.iss)) {
    throw new Error(`iss inesperado: ${String(claims.iss)}`);
  }
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes(opts.audience) : aud === opts.audience;
  if (!audOk) throw new Error('aud inesperado');

  if (claims.nonce !== opts.nonce) throw new Error('nonce del id_token no coincide');

  return claims;
}
