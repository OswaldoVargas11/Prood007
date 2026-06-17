import { createHmac } from 'node:crypto';
import { SignatureProviderFactory } from './signature.factory';
import {
  SignaturitSignatureProvider,
  deterministicSignatureId,
} from './providers/signaturit.signature';
import type { SignatureRequestInput } from './signature.interface';

function input(reference: string): SignatureRequestInput {
  return {
    reference,
    documentName: 'Hoja de encargo',
    signerName: 'Ana Cliente',
    signerEmail: 'ana@cliente.test',
  };
}

describe('SignatureProvider (adaptador de firma Signaturit, stub sin transmisión)', () => {
  it('la factory devuelve el proveedor (por defecto signaturit, cacheado) con su nombre', () => {
    const a = SignatureProviderFactory.get();
    const b = SignatureProviderFactory.get('signaturit');
    expect(a).toBeInstanceOf(SignaturitSignatureProvider);
    expect(a.provider).toBe('SIGNATURIT');
    // Cache: misma instancia en una segunda llamada.
    expect(b).toBe(a);
  });

  it('la factory lanza ante un proveedor desconocido', () => {
    expect(() => SignatureProviderFactory.get('docusign' as unknown as 'signaturit')).toThrow(
      /SignatureProvider/,
    );
  });

  it('requestSignature no transmite (STUBBED) pero devuelve la forma completa', async () => {
    const res = await SignatureProviderFactory.get().requestSignature(input('ver_abc123'));
    expect(res.status).toBe('STUBBED');
    expect(res.detail).toMatch(/Signaturit/);
    expect(res.externalId).toMatch(/^SIGNATURIT-/);
    expect(res.signUrl).toContain('app.signaturit.com/sign/');
    expect(typeof res.timestamp).toBe('string');
  });

  it('externalId es idempotente por reference (misma versión → mismo id) y tolera reference vacía', async () => {
    const a = await new SignaturitSignatureProvider().requestSignature(input('same-ref'));
    const b = await new SignaturitSignatureProvider().requestSignature(input('same-ref'));
    expect(a.externalId).toBe(b.externalId);
    // Sin caracteres alfanuméricos: deriva un id estable (no rompe).
    expect(deterministicSignatureId('***')).toBe('SIGNATURIT-NA');
  });

  it('getStatus conserva el externalId (STUBBED) y cancel pasa a CANCELED', async () => {
    const provider = SignatureProviderFactory.get();
    const status = await provider.getStatus('SIGNATURIT-XYZ');
    expect(status.status).toBe('STUBBED');
    expect(status.externalId).toBe('SIGNATURIT-XYZ');
    const canceled = await provider.cancel('SIGNATURIT-XYZ');
    expect(canceled.status).toBe('CANCELED');
    expect(canceled.externalId).toBe('SIGNATURIT-XYZ');
  });

  describe('verifyWebhook (HMAC-SHA256 del cuerpo crudo)', () => {
    const provider = new SignaturitSignatureProvider();
    const secret = 'whsec_test';
    const body = '{"externalId":"SIGNATURIT-1","tenantId":"t1","status":"SIGNED"}';
    const sign = (b: string, s: string) => createHmac('sha256', s).update(b).digest('hex');

    it('acepta una firma válida', () => {
      expect(provider.verifyWebhook(body, sign(body, secret), secret)).toBe(true);
    });

    it('rechaza sin secreto o sin firma', () => {
      expect(provider.verifyWebhook(body, sign(body, secret), undefined)).toBe(false);
      expect(provider.verifyWebhook(body, undefined, secret)).toBe(false);
    });

    it('rechaza una firma de longitud distinta y una firma incorrecta de igual longitud', () => {
      expect(provider.verifyWebhook(body, 'deadbeef', secret)).toBe(false);
      const wrong = sign(body, 'otro-secreto');
      expect(provider.verifyWebhook(body, wrong, secret)).toBe(false);
    });
  });

  describe('parseWebhook (normalización del payload)', () => {
    const provider = new SignaturitSignatureProvider();

    it('normaliza un evento válido (status case-insensitive)', () => {
      const evt = provider.parseWebhook(
        '{"externalId":"SIGNATURIT-1","tenantId":"t1","status":"signed","detail":"ok"}',
      );
      expect(evt).toEqual({
        externalId: 'SIGNATURIT-1',
        tenantId: 't1',
        status: 'SIGNED',
        detail: 'ok',
      });
    });

    it('devuelve null ante JSON inválido, no-objeto, campos ausentes o estado desconocido', () => {
      expect(provider.parseWebhook('no-json{')).toBeNull();
      expect(provider.parseWebhook('"string"')).toBeNull();
      expect(provider.parseWebhook('null')).toBeNull();
      expect(provider.parseWebhook('{"externalId":"x","status":"SIGNED"}')).toBeNull();
      expect(provider.parseWebhook('{"externalId":"x","tenantId":"t1","status":"WAT"}')).toBeNull();
    });
  });
});
