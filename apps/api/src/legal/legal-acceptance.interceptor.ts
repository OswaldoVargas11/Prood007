import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { SystemPrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY } from './allow-without-legal-acceptance.decorator';
import { requiredLegalDocTypes } from './legal.service';

const STAFF_ROLES = ['FIRM_ADMIN', 'LAWYER'];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * GATE DE ACEPTACIÓN LEGAL — del lado del SERVIDOR (la pantalla de cliente es solo UX). Corre como
 * interceptor (después de los guards → `req.user` ya está). Política FAIL-CLOSED como el resto del sistema:
 * un usuario de STAFF que NO ha aceptado los documentos obligatorios vigentes (ToS+Privacidad+DPA) NO puede
 * ESCRIBIR — se bloquean POST/PUT/PATCH/DELETE con 403. Las LECTURAS (GET) y los CLIENT del portal pasan;
 * también pasan las rutas marcadas `@AllowWithoutLegalAcceptance` (aceptar, auth/sesión, suscripción).
 *
 * Si aún no hay documentos publicados, NO bloquea (no romper antes de sembrar). Lee con el cliente de
 * SISTEMA: este interceptor corre fuera del contexto de tenant de la RLS (igual que el muro de suscripción).
 */
@Injectable()
export class LegalAcceptanceInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly system: SystemPrismaService,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser; method: string }>();
    const user = req.user;

    // Pública / plataforma / sin autenticar, o lectura → no se toca.
    if (!user?.tenantId) return next.handle();
    if (READ_METHODS.has(req.method.toUpperCase())) return next.handle();

    // Exención explícita (aceptar, auth, suscripción).
    const allow = this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (allow) return next.handle();

    // Solo el STAFF del despacho es responsable del tratamiento. Los CLIENT del portal no firman el DPA.
    if (!user.roles.some((r) => STAFF_ROLES.includes(r))) return next.handle();

    if (await this.hasPendingMandatory(user.tenantId, user.userId)) {
      throw new ForbiddenException(apiError('legal.acceptanceRequired'));
    }
    return next.handle();
  }

  /** ¿Le falta al usuario aceptar algún documento obligatorio VIGENTE de su despacho? */
  private async hasPendingMandatory(tenantId: string, userId: string): Promise<boolean> {
    const tenant = await this.system.tenant.findUnique({
      where: { id: tenantId },
      select: { accountType: true, jurisdiction: true },
    });
    if (!tenant) return false;

    const required = requiredLegalDocTypes(tenant.accountType);
    const docs = await this.system.legalDocument.findMany({
      where: {
        type: { in: required },
        isCurrent: true,
        OR: [{ jurisdiction: tenant.jurisdiction }, { jurisdiction: null }],
      },
      select: { type: true },
      distinct: ['type'],
    });
    // Nada publicado todavía → no bloquear (evita romper antes de sembrar los documentos).
    if (docs.length === 0) return false;

    const accepted = await this.system.legalAcceptance.findMany({
      where: { tenantId, userId, documentType: { in: docs.map((d) => d.type) } },
      select: { documentType: true },
      distinct: ['documentType'],
    });
    const acceptedTypes = new Set(accepted.map((a) => a.documentType));
    return docs.some((d) => !acceptedTypes.has(d.type));
  }
}
