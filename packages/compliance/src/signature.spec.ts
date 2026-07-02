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
    documentBuffer: Buffer.from('%PDF-1.4 contenido de prueba'),
    documentMimeType: 'application/pdf',
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

  it('downloadSignedDocument devuelve null sin API key (adaptador STUBBED)', async () => {
    const doc = await new SignaturitSignatureProvider().downloadSignedDocument('SIGNATURIT-XYZ');
    expect(doc).toBeNull();
  });

  describe('transmisión real (SIGNATURIT_API_KEY definida)', () => {
    const originalKey = process.env.SIGNATURIT_API_KEY;
    const originalFetch = global.fetch;

    beforeEach(() => {
      process.env.SIGNATURIT_API_KEY = 'sk_test_123';
    });

    afterEach(() => {
      if (originalKey === undefined) delete process.env.SIGNATURIT_API_KEY;
      else process.env.SIGNATURIT_API_KEY = originalKey;
      global.fetch = originalFetch;
    });

    it('requestSignature transmite y devuelve PENDING con los ids del sobre Y del documento', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        // Forma real verificada contra el sandbox: el sobre trae documents[] con su propio id.
        json: async () => ({ id: 'sig_abc', documents: [{ id: 'doc_1', status: 'in_queue' }] }),
      }) as unknown as typeof fetch;

      const res = await new SignaturitSignatureProvider().requestSignature(input('ver1'));
      expect(res.status).toBe('PENDING');
      expect(res.externalId).toBe('sig_abc');
      // Crítico para el webhook real: los eventos de Signaturit solo traen document.id.
      expect(res.externalDocumentId).toBe('doc_1');
      // La API real NO devuelve URL de firma (Signaturit avisa al firmante por su propio correo).
      expect(res.signUrl).toBeUndefined();
    });

    it('requestSignature registra events_url cuando SIGNATURIT_EVENTS_URL está definida', async () => {
      const originalEvents = process.env.SIGNATURIT_EVENTS_URL;
      process.env.SIGNATURIT_EVENTS_URL =
        'https://whk:secreto@api.example.test/api/signatures/webhook/signaturit.json';
      try {
        const fetchMock = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'sig_evt', documents: [{ id: 'doc_evt' }] }),
        });
        global.fetch = fetchMock as unknown as typeof fetch;
        await new SignaturitSignatureProvider().requestSignature(input('ver_evt'));
        const form = fetchMock.mock.calls[0][1].body as FormData;
        expect(form.get('events_url')).toBe(
          'https://whk:secreto@api.example.test/api/signatures/webhook/signaturit.json',
        );
      } finally {
        if (originalEvents === undefined) delete process.env.SIGNATURIT_EVENTS_URL;
        else process.env.SIGNATURIT_EVENTS_URL = originalEvents;
      }
    });

    it('downloadSignedDocument descarga el binario firmado tras resolver el id del documento', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ documents: [{ id: 'doc_1' }] }) })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-type', 'application/pdf']]),
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        });
      global.fetch = fetchMock as unknown as typeof fetch;

      const provider = new SignaturitSignatureProvider();
      const doc = await provider.downloadSignedDocument('sig_abc');
      expect(doc).not.toBeNull();
      expect(doc?.buffer).toEqual(Buffer.from([1, 2, 3]));
    });

    it('downloadSignedDocument devuelve null si la API falla', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
      const doc = await new SignaturitSignatureProvider().downloadSignedDocument('sig_abc');
      expect(doc).toBeNull();
    });

    it('downloadSignedDocument devuelve null si el sobre no trae documentos o la red lanza', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ documents: [] }),
      }) as unknown as typeof fetch;
      expect(await new SignaturitSignatureProvider().downloadSignedDocument('sig_abc')).toBeNull();
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch;
      expect(await new SignaturitSignatureProvider().downloadSignedDocument('sig_abc')).toBeNull();
    });

    it('requestSignature LANZA ante HTTP no-ok o fallo de red (nada de PENDING fantasma con id local)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
      }) as unknown as typeof fetch;
      await expect(
        new SignaturitSignatureProvider().requestSignature(input('ver3')),
      ).rejects.toThrow(/Signaturit/);
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
      await expect(
        new SignaturitSignatureProvider().requestSignature(input('ver3')),
      ).rejects.toThrow(/No se pudo enviar/);
    });

    it('getStatus lee el estado de documents[0].status (forma real: la raíz del sobre no trae status)', async () => {
      const provider = new SignaturitSignatureProvider();
      const cases: Array<[string, string]> = [
        ['completed', 'SIGNED'],
        ['signed', 'SIGNED'],
        ['declined', 'DECLINED'],
        ['expired', 'EXPIRED'],
        ['canceled', 'CANCELED'],
        ['cancelled', 'CANCELED'],
        ['in_queue', 'PENDING'],
        ['ready', 'PENDING'],
        ['signing', 'PENDING'],
        ['error', 'PENDING'],
      ];
      for (const [remote, expected] of cases) {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ id: 'sig_abc', documents: [{ id: 'doc_1', status: remote }] }),
        }) as unknown as typeof fetch;
        const res = await provider.getStatus('sig_abc');
        expect(res.status).toBe(expected);
        expect(res.externalId).toBe('sig_abc');
        expect(res.externalDocumentId).toBe('doc_1');
      }
      // Fallback de robustez: si algún día el estado viniera en la raíz, también se mapea.
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'completed' }),
      }) as unknown as typeof fetch;
      expect((await provider.getStatus('sig_abc')).status).toBe('SIGNED');
    });

    it('getStatus ante fallo de red/HTTP degrada a PENDING con detalle (el cron reintentará)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      }) as unknown as typeof fetch;
      const res = await new SignaturitSignatureProvider().getStatus('sig_abc');
      expect(res.status).toBe('PENDING');
      expect(res.detail).toMatch(/No se pudo consultar/);
    });

    it('cancel transmite el PATCH y, si falla, queda cancelada localmente con detalle', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const ok = await new SignaturitSignatureProvider().cancel('sig_abc');
      expect(ok.status).toBe('CANCELED');
      expect(ok.detail).toMatch(/cancelada en Signaturit/);

      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 409 }) as unknown as typeof fetch;
      const failed = await new SignaturitSignatureProvider().cancel('sig_abc');
      expect(failed.status).toBe('CANCELED');
      expect(failed.detail).toMatch(/Cancelada localmente/);
    });
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

  describe('parseWebhook (formato REAL de Signaturit: {type, created_at, document})', () => {
    const provider = new SignaturitSignatureProvider();

    it('document_completed → SIGNED correlacionado por document.id (el evento no trae id del sobre)', () => {
      const evt = provider.parseWebhook(
        JSON.stringify({
          created_at: '2026-07-02T17:21:46+0000',
          type: 'document_completed',
          document: {
            id: 'doc_29109781',
            status: 'completed',
            email: 'ana@cliente.test',
            name: 'Ana',
            file: { name: 'contrato.pdf', pages: 3, size: 1234 },
          },
        }),
      );
      expect(evt).toEqual({
        externalDocumentId: 'doc_29109781',
        status: 'SIGNED',
        detail: 'document_completed',
      });
    });

    it('mapea los tipos terminales y deja los informativos en PENDING (no-op aguas arriba)', () => {
      const parse = (type: string) =>
        provider.parseWebhook(JSON.stringify({ type, document: { id: 'doc_1' } }))?.status;
      expect(parse('document_declined')).toBe('DECLINED');
      expect(parse('document_expired')).toBe('EXPIRED');
      expect(parse('document_canceled')).toBe('CANCELED');
      // document_signed NO es la firma efectiva: el PDF sellado llega con document_completed.
      expect(parse('document_signed')).toBe('PENDING');
      expect(parse('email_delivered')).toBe('PENDING');
      expect(parse('document_opened')).toBe('PENDING');
      expect(parse('audit_trail_completed')).toBe('PENDING');
    });

    it('evento real sin document.id → null (inválido)', () => {
      expect(
        provider.parseWebhook(JSON.stringify({ type: 'document_completed', document: {} })),
      ).toBeNull();
    });
  });

  describe('parseWebhook (formato legado/interno)', () => {
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
