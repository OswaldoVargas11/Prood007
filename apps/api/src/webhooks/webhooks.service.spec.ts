// La entrega resuelve el host por DNS (anti-SSRF). Lo mockeamos a una IP pública para que el envío proceda.
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
}));
import { createHmac } from 'node:crypto';
import { WebhooksService } from './webhooks.service';
import type { RequestUser } from '../auth/auth.types';

const user = { tenantId: 't1' } as unknown as RequestUser;

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeService() {
  const prisma = {
    webhookEndpoint: {
      create: jest.fn(async ({ data }: any) => ({
        id: 'ep1',
        createdAt: new Date(),
        active: true,
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new WebhooksService(prisma as any, audit as any);
  return { service, prisma, audit };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('WebhooksService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('create genera secreto, normaliza eventos a los conocidos y los guarda como CSV', async () => {
    const { service, prisma } = makeService();
    const res = await service.create(user, {
      url: 'https://hooks.example.com/x',
      events: ['matter.created', 'desconocido'],
    });
    expect(res.secret).toMatch(/^whsec_/);
    expect(res.events).toEqual(['matter.created']);
    const data = prisma.webhookEndpoint.create.mock.calls[0]![0].data;
    expect(data.events).toBe('matter.created');
    expect(data.tenantId).toBe('t1');
  });

  it('create rechaza si ningún evento es soportado', async () => {
    const { service } = makeService();
    await expect(
      service.create(user, { url: 'https://hooks.example.com/x', events: ['nope'] }),
    ).rejects.toThrow();
  });

  it('create rechaza URLs no https o privadas (SSRF)', async () => {
    const { service } = makeService();
    await expect(
      service.create(user, { url: 'http://example.com', events: ['matter.created'] }),
    ).rejects.toThrow();
    await expect(
      service.create(user, { url: 'https://127.0.0.1', events: ['matter.created'] }),
    ).rejects.toThrow();
  });

  it('dispatch entrega SOLO a los endpoints suscritos, firmando el cuerpo con HMAC-SHA256', async () => {
    const { service, prisma } = makeService();
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      {
        id: 'a',
        url: 'https://a.example.com/h',
        secret: 'sec',
        events: 'matter.created',
        active: true,
      },
      {
        id: 'b',
        url: 'https://b.example.com/h',
        secret: 'sec2',
        events: 'other.event',
        active: true,
      },
    ]);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.dispatch('t1', 'matter.created', { id: 'm1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, opts] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://a.example.com/h');
    const expected = 'sha256=' + createHmac('sha256', 'sec').update(opts.body).digest('hex');
    expect(opts.headers['x-lawzora-signature']).toBe(expected);
    expect(opts.headers['x-lawzora-event']).toBe('matter.created');
  });

  it('dispatch nunca lanza, aunque la consulta falle', async () => {
    const { service, prisma } = makeService();
    prisma.webhookEndpoint.findMany.mockRejectedValue(new Error('db down'));
    await expect(service.dispatch('t1', 'matter.created', {})).resolves.toBeUndefined();
  });
});
