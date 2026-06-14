import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantStorage } from './tenant-context';

/**
 * Establece el contexto de tenant (AsyncLocalStorage) para toda la ejecución del request, leyendo el
 * usuario autenticado que dejó el guard JWT. A partir de aquí, la extensión de Prisma fija
 * `app.tenant_id` en la BD y RLS se aplica.
 *
 * Requests sin usuario (rutas @Public: login/registro/refresh, o no-HTTP) no fijan contexto → las
 * queries van en modo bypass, que las políticas RLS permiten para esas rutas de sistema.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<{ user?: { tenantId?: string } }>();
    const tenantId = req?.user?.tenantId;
    if (!tenantId) {
      return next.handle();
    }
    // Ejecutar la cadena del handler DENTRO del contexto: la suscripción dispara el controlador y
    // sus llamadas async heredan el AsyncLocalStorage.
    return new Observable((subscriber) => {
      tenantStorage.run({ tenantId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
