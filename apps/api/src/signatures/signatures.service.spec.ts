import { BadRequestException } from '@nestjs/common';
import { SignaturesService } from './signatures.service';

/**
 * `handleWebhook` con dependencias en doble (sin Nest TestingModule: mismo estilo que
 * `stripe-billing.webhook.spec.ts`). El `provider` real (Signaturit) se sustituye por un mock para
 * controlar `verifyWebhook`/`parseWebhook`/`downloadSignedDocument` sin red.
 */
function build(opts?: { signatureRows?: unknown[] }) {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findMany = jest.fn().mockResolvedValue(opts?.signatureRows ?? []);
  const prisma = { signatureRequest: { updateMany, findMany } };
  const system = { signatureRequest: { findFirst: jest.fn() } };
  const audit = { log: jest.fn() };
  const notifications = { create: jest.fn() };
  const addSignedVersion = jest.fn();
  const documents = { addSignedVersion };
  const storage = { get: jest.fn() };
  const mail = { sendMail: jest.fn() };

  const service = new SignaturesService(
    prisma as never,
    system as never,
    audit as never,
    notifications as never,
    documents as never,
    storage as never,
    mail as never,
  );

  const provider = {
    provider: 'SIGNATURIT',
    // Por defecto el mock simula el proveedor VIVO (con credenciales): los tests de descarga del PDF
    // firmado son sobre ese modo. El e2e cubre el modo STUBBED (isConfigured=false → sin descarga).
    isConfigured: jest.fn().mockReturnValue(true),
    verifyWebhook: jest.fn(),
    parseWebhook: jest.fn(),
    downloadSignedDocument: jest.fn(),
    requestSignature: jest.fn(),
    getStatus: jest.fn(),
    cancel: jest.fn(),
  };
  (service as unknown as { provider: unknown }).provider = provider;

  return { service, prisma, system, audit, notifications, documents, provider, addSignedVersion };
}

describe('SignaturesService.handleWebhook', () => {
  it('firma HMAC inválida → 400 (BadRequestException), no toca la BD', async () => {
    const { service, provider, system } = build();
    provider.verifyWebhook.mockReturnValue(false);

    await expect(service.handleWebhook(Buffer.from('{}'), 'bad-sig')).rejects.toThrow(
      BadRequestException,
    );
    expect(system.signatureRequest.findFirst).not.toHaveBeenCalled();
  });

  it('sin fila local que case el externalId → 400 (el tenant no sale del payload)', async () => {
    const { service, provider, system } = build();
    provider.verifyWebhook.mockReturnValue(true);
    provider.parseWebhook.mockReturnValue({
      externalId: 'sig_1',
      tenantId: 'attacker-tenant',
      status: 'SIGNED',
    });
    system.signatureRequest.findFirst.mockResolvedValue(null);

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('evento SIGNED: descarga el documento firmado y lo guarda como nueva DocumentVersion', async () => {
    const row = {
      id: 'sr_1',
      tenantId: 't1',
      documentId: 'doc_1',
      versionId: 'ver_1',
      requestedById: 'user_1',
      signerName: 'Ana Cliente',
      status: 'PENDING',
    };
    const { service, provider, system, prisma, documents, notifications, audit } = build({
      signatureRows: [row],
    });
    provider.verifyWebhook.mockReturnValue(true);
    provider.parseWebhook.mockReturnValue({
      externalId: 'sig_1',
      tenantId: 't1',
      status: 'SIGNED',
    });
    system.signatureRequest.findFirst.mockResolvedValue({ tenantId: 't1' });
    provider.downloadSignedDocument.mockResolvedValue({
      buffer: Buffer.from('%PDF-firmado'),
      mimeType: 'application/pdf',
    });
    documents.addSignedVersion.mockResolvedValue({ id: 'ver_2', contentHash: 'abc' });

    const res = await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(res).toEqual({ received: true });
    expect(prisma.signatureRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(documents.addSignedVersion).toHaveBeenCalledWith(
      't1',
      'doc_1',
      'user_1',
      expect.objectContaining({ mimetype: 'application/pdf' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', userId: 'user_1' }),
      'signature.document_signed',
      'DocumentVersion',
      'ver_2',
      expect.objectContaining({ documentId: 'doc_1' }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signature.signed', userId: 'user_1' }),
    );
  });

  it('evento duplicado (fila ya en ese estado) → idempotente: no vuelve a descargar/auditar/notificar', async () => {
    const row = {
      id: 'sr_1',
      tenantId: 't1',
      documentId: 'doc_1',
      versionId: 'ver_1',
      requestedById: 'user_1',
      signerName: 'Ana Cliente',
      status: 'SIGNED', // ya estaba SIGNED antes de este evento
    };
    const { service, provider, system, documents, notifications, audit, prisma } = build({
      signatureRows: [row],
    });
    provider.verifyWebhook.mockReturnValue(true);
    provider.parseWebhook.mockReturnValue({
      externalId: 'sig_1',
      tenantId: 't1',
      status: 'SIGNED',
    });
    system.signatureRequest.findFirst.mockResolvedValue({ tenantId: 't1' });

    const res = await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(res).toEqual({ received: true });
    // Estado terminal = inmutable: el duplicado no re-escribe nada (ni re-sella completedAt) y no hay
    // efectos secundarios (descarga/versión/notificación/auditoría).
    expect(prisma.signatureRequest.updateMany).not.toHaveBeenCalled();
    expect(provider.downloadSignedDocument).not.toHaveBeenCalled();
    expect(documents.addSignedVersion).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('modo STUBBED (sin credenciales): SIGNED transiciona y notifica SIN intentar descargar', async () => {
    const row = {
      id: 'sr_1',
      tenantId: 't1',
      documentId: 'doc_1',
      versionId: 'ver_1',
      requestedById: 'user_1',
      signerName: 'Ana Cliente',
      status: 'PENDING',
    };
    const { service, provider, system, documents, notifications, prisma } = build({
      signatureRows: [row],
    });
    provider.isConfigured.mockReturnValue(false);
    provider.verifyWebhook.mockReturnValue(true);
    provider.parseWebhook.mockReturnValue({
      externalId: 'sig_1',
      tenantId: 't1',
      status: 'SIGNED',
    });
    system.signatureRequest.findFirst.mockResolvedValue({ tenantId: 't1' });

    const res = await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(res).toEqual({ received: true });
    expect(prisma.signatureRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(provider.downloadSignedDocument).not.toHaveBeenCalled();
    expect(documents.addSignedVersion).not.toHaveBeenCalled();
    // La notificación al solicitante sale igualmente (la firma ocurrió, aunque no haya PDF que anexar).
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('webhook desordenado: DECLINED después de SIGNED NO regresa el estado terminal', async () => {
    const row = {
      id: 'sr_1',
      tenantId: 't1',
      documentId: 'doc_1',
      versionId: 'ver_1',
      requestedById: 'user_1',
      signerName: 'Ana Cliente',
      status: 'SIGNED',
    };
    const { service, provider, system, prisma } = build({ signatureRows: [row] });
    provider.verifyWebhook.mockReturnValue(true);
    provider.parseWebhook.mockReturnValue({
      externalId: 'sig_1',
      tenantId: 't1',
      status: 'DECLINED',
    });
    system.signatureRequest.findFirst.mockResolvedValue({ tenantId: 't1' });

    const res = await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(res).toEqual({ received: true });
    expect(prisma.signatureRequest.updateMany).not.toHaveBeenCalled();
  });

  it('SIGNED con descarga fallida → 503 (el proveedor reintenta) y el estado NO se consume', async () => {
    const row = {
      id: 'sr_1',
      tenantId: 't1',
      documentId: 'doc_1',
      versionId: 'ver_1',
      requestedById: 'user_1',
      signerName: 'Ana Cliente',
      status: 'PENDING',
    };
    const { service, provider, system, documents, prisma } = build({ signatureRows: [row] });
    provider.verifyWebhook.mockReturnValue(true);
    provider.parseWebhook.mockReturnValue({
      externalId: 'sig_1',
      tenantId: 't1',
      status: 'SIGNED',
    });
    provider.downloadSignedDocument.mockResolvedValue(null); // timeout/5xx del proveedor
    system.signatureRequest.findFirst.mockResolvedValue({ tenantId: 't1' });

    await expect(service.handleWebhook(Buffer.from('{}'), 'sig')).rejects.toThrow();
    // La fila sigue PENDING: el reintento del webhook reprocesará y podrá guardar el PDF firmado.
    expect(prisma.signatureRequest.updateMany).not.toHaveBeenCalled();
    expect(documents.addSignedVersion).not.toHaveBeenCalled();
  });
});
