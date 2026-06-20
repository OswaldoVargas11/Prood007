import { firstValueFrom, Observable } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { TenantContextInterceptor } from '../src/prisma/tenant-context.interceptor';
import { getCurrentTenantId } from '../src/prisma/tenant-context';

/**
 * Cierre del fail-open de WebSocket: el camino realtime debe fijar el contexto de tenant para que la
 * extensión de Prisma aplique RLS (no quede en bypass). No necesita BD: usamos dobles que observan el
 * contexto activo (AsyncLocalStorage) en el momento en que se tocaría la base de datos.
 */
describe('Realtime / WebSocket — contexto de tenant (RLS, sin fail-open)', () => {
  describe('RealtimeGateway.subscribeMatter', () => {
    it('staff: ejecuta la query de BD bajo el contexto del tenant del socket y une la sala', async () => {
      const tenantId = 'tenant-xyz';
      const matterId = 'matter-abc';
      let capturedTenant: string | undefined = 'NUNCA_SE_FIJÓ';
      const fakePrisma = {
        matter: {
          findFirst: async () => {
            capturedTenant = getCurrentTenantId();
            // Forma que espera assertMatterAccess; para staff devuelve acceso sin mirar el cliente.
            return { id: matterId, clientId: 'c1', client: { userId: null } };
          },
        },
      };
      const gateway = new RealtimeGateway(null as never, null as never, fakePrisma as never);
      const join = jest.fn().mockResolvedValue(undefined);
      const client = { data: { tenantId, userId: 'u1', roles: ['LAWYER'] }, join } as never;

      const res = await gateway.subscribeMatter(client, { matterId });

      // La prueba clave: cuando el gateway toca la BD, el GUC del tenant está activo → RLS aplica.
      expect(capturedTenant).toBe(tenantId);
      expect(res).toEqual({ ok: true });
      expect(join).toHaveBeenCalledWith(`matter:${matterId}`);
    });

    it('IDOR: un CLIENTE no puede suscribirse al expediente de OTRO cliente del mismo despacho', async () => {
      const fakePrisma = {
        matter: {
          // El expediente existe en el tenant pero pertenece a otro cliente.
          findFirst: async () => ({ id: 'm', clientId: 'c1', client: { userId: 'OTRO_CLIENTE' } }),
        },
      };
      const gateway = new RealtimeGateway(null as never, null as never, fakePrisma as never);
      const join = jest.fn();
      const client = {
        data: { tenantId: 'T', userId: 'cliente-atacante', roles: ['CLIENT'] },
        join,
      } as never;

      expect(await gateway.subscribeMatter(client, { matterId: 'm' })).toEqual({ ok: false });
      expect(join).not.toHaveBeenCalled();
    });

    it('sin matterId, sin tenant o sin usuario devuelve ok:false sin tocar BD', async () => {
      const findFirst = jest.fn();
      const gateway = new RealtimeGateway(
        null as never,
        null as never,
        {
          matter: { findFirst },
        } as never,
      );
      const client = { data: { tenantId: 't', userId: 'u', roles: [] }, join: jest.fn() } as never;

      expect(await gateway.subscribeMatter(client, { matterId: '' })).toEqual({ ok: false });
      expect(findFirst).not.toHaveBeenCalled();
    });
  });

  describe('TenantContextInterceptor resuelve el tenant por tipo de contexto', () => {
    const interceptor = new TenantContextInterceptor();

    const handlerThatReadsContext = (): CallHandler => ({
      handle: () =>
        new Observable((subscriber) => {
          subscriber.next(getCurrentTenantId());
          subscriber.complete();
        }),
    });

    const makeContext = (type: 'http' | 'ws', payload: unknown): ExecutionContext =>
      ({
        getType: () => type,
        switchToHttp: () => ({ getRequest: () => payload }),
        switchToWs: () => ({ getClient: () => payload }),
      }) as unknown as ExecutionContext;

    it('HTTP: toma req.user.tenantId', async () => {
      const ctx = makeContext('http', { user: { tenantId: 'T-http' } });
      expect(await firstValueFrom(interceptor.intercept(ctx, handlerThatReadsContext()))).toBe(
        'T-http',
      );
    });

    it('WS: toma socket.data.tenantId', async () => {
      const ctx = makeContext('ws', { data: { tenantId: 'T-ws' } });
      expect(await firstValueFrom(interceptor.intercept(ctx, handlerThatReadsContext()))).toBe(
        'T-ws',
      );
    });

    it('sin usuario/tenant → bypass (contexto vacío)', async () => {
      const httpCtx = makeContext('http', {});
      const wsCtx = makeContext('ws', { data: {} });
      expect(
        await firstValueFrom(interceptor.intercept(httpCtx, handlerThatReadsContext())),
      ).toBeUndefined();
      expect(
        await firstValueFrom(interceptor.intercept(wsCtx, handlerThatReadsContext())),
      ).toBeUndefined();
    });
  });
});
