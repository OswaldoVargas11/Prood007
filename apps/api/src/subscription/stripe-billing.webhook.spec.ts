import { StripeBillingService } from './stripe-billing.service';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService, SystemPrismaService } from '../prisma/prisma.service';

/**
 * M-2 (idempotencia por event.id) y M-3 (el tier se deriva del Price pagado, no de la metadata) del
 * webhook de suscripción de la plataforma.
 */
describe('StripeBillingService.handleWebhook (M-2/M-3)', () => {
  const PRICE_PRO = 'price_pro_annual_eur';
  const priceMap = { 'PROFESIONAL:ANNUAL:EUR': PRICE_PRO };

  function build() {
    const config = {
      get: (k: string) =>
        (
          ({
            STRIPE_SECRET_KEY: 'sk_test_dummy',
            STRIPE_PRICE_MAP: JSON.stringify(priceMap),
            STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
          }) as Record<string, string>
        )[k],
    } as unknown as ConfigService;
    const tenantUpdate = jest.fn().mockResolvedValue({});
    const create = jest.fn();
    const system = {
      tenant: { update: tenantUpdate },
      processedStripeEvent: { create },
    } as unknown as SystemPrismaService;
    const prisma = {} as unknown as PrismaService;
    const service = new StripeBillingService(config, prisma, system);
    return { service, tenantUpdate, create };
  }

  // Suscripción con item cuyo Price mapea a PROFESIONAL, pero con metadata mintiendo tier=ENTERPRISE.
  const sub = {
    id: 'sub_1',
    status: 'active',
    items: {
      data: [{ quantity: 3, current_period_end: 1893456000, price: { id: PRICE_PRO } }],
    },
    metadata: { tenantId: 'tenant-1', tier: 'ENTERPRISE', cycle: 'ANNUAL' },
  };

  function eventOf(id: string) {
    return { id, type: 'customer.subscription.updated', data: { object: sub } };
  }

  it('M-3: el plan aplicado sale del Price pagado (PROFESIONAL), no de la metadata (ENTERPRISE)', async () => {
    const { service, tenantUpdate, create } = build();
    create.mockResolvedValueOnce({});
    jest
      .spyOn(service as unknown as { verify: () => unknown }, 'verify')
      .mockReturnValue(eventOf('evt_1'));

    await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(tenantUpdate).toHaveBeenCalledTimes(1);
    const data = (tenantUpdate.mock.calls[0]![0] as { data: { plan: string; seats: number } }).data;
    expect(data.plan).toBe('PROFESIONAL');
    expect(data.seats).toBe(3);
  });

  it('M-2: un evento ya procesado (P2002) se descarta sin reaplicar el estado', async () => {
    const { service, tenantUpdate, create } = build();
    create.mockRejectedValueOnce({ code: 'P2002' });
    jest
      .spyOn(service as unknown as { verify: () => unknown }, 'verify')
      .mockReturnValue(eventOf('evt_1'));

    const res = await service.handleWebhook(Buffer.from('{}'), 'sig');

    expect(res).toEqual({ received: true });
    expect(tenantUpdate).not.toHaveBeenCalled();
  });
});
