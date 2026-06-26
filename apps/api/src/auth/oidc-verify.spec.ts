import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { verifyIdToken } from './oidc-verify';

/**
 * Pruebas del verificador de id_token OIDC (H-1). Generamos un par RSA local, exponemos la clave
 * pública como JWKS (vía un `fetch` mockeado) y firmamos tokens RS256 a mano para validar que la
 * firma se comprueba de verdad y que los casos maliciosos se rechazan.
 */

const JWKS_URI = 'https://idp.example/keys';
const AUD = 'client-123';
const ISS = 'https://accounts.google.com';
const KID = 'test-key-1';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function makeToken(
  privateKey: KeyObject,
  claims: Record<string, unknown>,
  opts: { alg?: string; kid?: string; tamper?: boolean } = {},
): string {
  const header = { alg: opts.alg ?? 'RS256', typ: 'JWT', kid: opts.kid ?? KID };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;
  let sig: Buffer;
  if (opts.alg === 'none') {
    sig = Buffer.from('');
  } else {
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    sig = signer.sign(privateKey);
    if (opts.tamper) sig[0] = sig[0]! ^ 0xff;
  }
  return `${signingInput}.${b64url(sig)}`;
}

describe('verifyIdToken', () => {
  let privateKey: KeyObject;
  let jwk: Record<string, unknown>;

  beforeAll(() => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    jwk = pair.publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    jwk.kid = KID;
    jwk.use = 'sig';
    jwk.alg = 'RS256';
  });

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    }) as unknown as typeof fetch;
  });

  const baseClaims = () => ({
    iss: ISS,
    aud: AUD,
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    nonce: 'nonce-abc',
    email: 'user@example.com',
    email_verified: true,
  });

  const opts = {
    jwksUri: JWKS_URI,
    audience: AUD,
    issuer: (iss: string) => iss === ISS,
    nonce: 'nonce-abc',
  };

  it('acepta un id_token RS256 correctamente firmado', async () => {
    const token = makeToken(privateKey, baseClaims());
    const claims = await verifyIdToken(token, opts);
    expect(claims.email).toBe('user@example.com');
    expect(claims.email_verified).toBe(true);
  });

  it('rechaza una firma manipulada', async () => {
    const token = makeToken(privateKey, baseClaims(), { tamper: true });
    await expect(verifyIdToken(token, opts)).rejects.toThrow();
  });

  it('rechaza alg:none (sin firma)', async () => {
    const token = makeToken(privateKey, baseClaims(), { alg: 'none' });
    await expect(verifyIdToken(token, opts)).rejects.toThrow(/alg/);
  });

  it('rechaza un nonce que no coincide (anti login-CSRF)', async () => {
    const token = makeToken(privateKey, { ...baseClaims(), nonce: 'otro' });
    await expect(verifyIdToken(token, opts)).rejects.toThrow(/nonce/);
  });

  it('rechaza un aud distinto', async () => {
    const token = makeToken(privateKey, { ...baseClaims(), aud: 'otro-client' });
    await expect(verifyIdToken(token, opts)).rejects.toThrow(/aud/);
  });

  it('rechaza un emisor no confiable', async () => {
    const token = makeToken(privateKey, { ...baseClaims(), iss: 'https://evil.example' });
    await expect(verifyIdToken(token, opts)).rejects.toThrow(/iss/);
  });

  it('rechaza un id_token caducado', async () => {
    const token = makeToken(privateKey, {
      ...baseClaims(),
      exp: Math.floor(Date.now() / 1000) - 600,
    });
    await expect(verifyIdToken(token, opts)).rejects.toThrow(/caducado/);
  });

  it('rechaza una firma de una clave distinta (kid desconocido sin match en JWKS)', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = makeToken(other.privateKey, baseClaims());
    await expect(verifyIdToken(token, opts)).rejects.toThrow();
  });
});
