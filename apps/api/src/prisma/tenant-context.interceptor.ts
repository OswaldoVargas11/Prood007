import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage } from './tenant-context';

/**
 * Establece el contexto de tenant (AsyncLocalStorage) para toda la ejecución del handler, leyendo el
 * usuario autenticado. A partir de aquí, la extensión de Prisma fija `app.tenant_id` en la BD y RLS
 * se aplica.
 *
 * Cubre HTTP (req.user, que deja el guard JWT) y WebSocket (socket.data, que rellena el gateway en el
 * handshake), de modo que también los handlers @SubscribeMessage operan bajo RLS y no en fail-open.
 *
 * Handlers sin usuario (rutas @Public: login/registro/refresh; o conexiones no autenticadas) no fijan
 * contexto → las queries van en modo bypass, que las políticas RLS permiten para esas rutas de sistema.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const tenantId = this.resolveTenantId(context);
    if (!tenantId) {
      return next.handle();
    }
    // Ejecutar la cadena del handler DENTRO del contexto: la suscripción dispara el controlador/
    // handler y sus llamadas async heredan el AsyncLocalStorage.
    return new Observable((subscriber) => {
      tenantStorage.run({ tenantId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }

  private resolveTenantId(context: ExecutionContext): string | undefined {
    switch (context.getType()) {
      case 'http':
        return context.switchToHttp().getRequest<{ user?: { tenantId?: string } }>()?.user
          ?.tenantId;
      case 'ws':
        return context.switchToWs().getClient<{ data?: { tenantId?: string } }>()?.data?.tenantId;
      default:
        return undefined;
    }
  }
}
