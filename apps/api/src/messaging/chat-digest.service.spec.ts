import { ChatDigestService } from './chat-digest.service';

/**
 * Resumen de chat por correo a nivel de servicio, con Prisma/config/mail mockeados. Cubre el criterio que
 * la lógica pura (`chat-digest.logic.spec`) no puede: la IDEMPOTENCIA del sellado de `lastChatDigestAt`
 * frente a un fallo de BD (LAW-80). El sello vive ANTES del envío, así que un fallo de la marca nunca deja
 * un correo emitido con la marca sin avanzar (que reenviaría el mismo lote en el siguiente barrido).
 */

/** Un usuario opt-in con un no-leído maduro y sin resumen previo → `decideChatDigest` decide enviar. */
const USER = { id: 'u1', email: 'u1@bufete.test', fullName: 'Ana', lastChatDigestAt: null };

function makeService(over: { sealRejects?: boolean; mailRejects?: boolean } = {}) {
  const now = new Date('2026-07-01T12:00:00.000Z');
  // Mensaje sin leer con 20 min de reposo (> ventana de silencio de 15 min) → maduro.
  const matureAt = new Date(now.getTime() - 20 * 60_000);

  const updateMany = over.sealRejects
    ? jest.fn().mockRejectedValue(new Error('DB transitorio'))
    : jest.fn().mockResolvedValue({ count: 1 });
  const sendMail = over.mailRejects
    ? jest.fn().mockRejectedValue(new Error('SMTP caído'))
    : jest.fn().mockResolvedValue(undefined);

  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([USER]), updateMany },
    conversation: { findMany: jest.fn().mockResolvedValue([]) },
    conversationMember: {
      findMany: jest.fn().mockResolvedValue([{ conversationId: 'c1', lastReadAt: null }]),
    },
    chatMessage: {
      findMany: jest.fn().mockResolvedValue([{ conversationId: 'c1', createdAt: matureAt }]),
    },
    matter: { findMany: jest.fn().mockResolvedValue([]) },
    matterReadState: { findMany: jest.fn().mockResolvedValue([]) },
    message: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new ChatDigestService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { sendMail } as any,
  );
  return { service, now, updateMany, sendMail };
}

describe('ChatDigestService.evaluateTenant — idempotencia del sellado (LAW-80)', () => {
  it('camino feliz: sella la marca y envía el resumen', async () => {
    const { service, now, updateMany, sendMail } = makeService();

    const summary = await service.evaluateTenant('t1', now);

    expect(summary).toEqual({ evaluated: 1, sent: 1, skipped: 0 });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'u1', tenantId: 't1' },
      data: { lastChatDigestAt: now },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('si el sellado de la marca falla, NO envía correo y cuenta skipped (sin duplicado)', async () => {
    const { service, now, updateMany, sendMail } = makeService({ sealRejects: true });

    const summary = await service.evaluateTenant('t1', now);

    // La regresión que evitamos: el correo NO debe salir si la marca no pudo avanzar. Así el próximo
    // barrido reintenta el mismo lote limpio en vez de reenviar un correo ya emitido.
    expect(sendMail).not.toHaveBeenCalled();
    expect(summary).toEqual({ evaluated: 1, sent: 0, skipped: 1 });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('un fallo de correo (fail-soft) NO revierte la marca ya sellada', async () => {
    const { service, now, updateMany, sendMail } = makeService({ mailRejects: true });

    const summary = await service.evaluateTenant('t1', now);

    // La marca avanzó antes del envío: aunque el correo falle, no se reintenta el lote (peor caso: un
    // resumen perdido, nunca un bucle de reenvíos).
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ evaluated: 1, sent: 1, skipped: 0 });
  });
});
