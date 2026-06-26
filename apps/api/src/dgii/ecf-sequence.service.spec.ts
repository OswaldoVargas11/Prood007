import { BadRequestException } from '@nestjs/common';
import { EcfSequenceService } from './ecf-sequence.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../auth/auth.types';

/**
 * H-2 (CWE-840): re-registrar un rango eNCF NUNCA debe hacer retroceder el contador `next`, para no
 * reemitir comprobantes ya consumidos. Estas pruebas fijan ese invariante.
 */
describe('EcfSequenceService.register (H-2: el contador no retrocede)', () => {
  const user = { tenantId: 'tenant-1' } as RequestUser;

  function build(existing: { next: number; rangeStart: number; rangeEnd: number } | null) {
    const upsert = jest.fn().mockImplementation((args: { create: unknown; update: unknown }) => {
      const data = (existing ? args.update : args.create) as {
        ncfType: string;
        rangeStart: number;
        rangeEnd: number;
        next: number;
      };
      return Promise.resolve(data);
    });
    const prisma = {
      ecfSequence: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert,
      },
    } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    return { service: new EcfSequenceService(prisma, audit), upsert };
  }

  it('arranca en rangeStart cuando no hay rango previo', async () => {
    const { service, upsert } = build(null);
    const res = await service.register(user, { ncfType: '31', rangeStart: 1, rangeEnd: 100 });
    expect(res.next).toBe(1);
    expect((upsert.mock.calls[0]![0] as { create: { next: number } }).create.next).toBe(1);
  });

  it('CONSERVA el contador si el re-registro solapa la porción consumida', async () => {
    // Ya se consumieron hasta 50 (next=50) de un rango 1..100; re-registrar 1..100 NO debe reiniciar a 1.
    const { service } = build({ next: 50, rangeStart: 1, rangeEnd: 100 });
    const res = await service.register(user, { ncfType: '31', rangeStart: 1, rangeEnd: 100 });
    expect(res.next).toBe(50);
  });

  it('arranca en el inicio nuevo al renovar con un rango por encima de lo consumido', async () => {
    const { service } = build({ next: 100, rangeStart: 1, rangeEnd: 100 });
    const res = await service.register(user, { ncfType: '31', rangeStart: 101, rangeEnd: 200 });
    expect(res.next).toBe(101);
  });

  it('rechaza un rango cuyo fin queda por debajo de lo ya consumido', async () => {
    const { service } = build({ next: 100, rangeStart: 1, rangeEnd: 100 });
    await expect(
      service.register(user, { ncfType: '31', rangeStart: 1, rangeEnd: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza rangeEnd < rangeStart', async () => {
    const { service } = build(null);
    await expect(
      service.register(user, { ncfType: '31', rangeStart: 100, rangeEnd: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
