import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { assertSafeWebhookUrl } from './webhook-url';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import type { RequestUser } from '../auth/auth.types';

/** Eventos que el sistema sabe emitir hoy. Suscribirse a otros se rechaza (no llegarían nunca). */
export const KNOWN_WEBHOOK_EVENTS = ['matter.created'] as const;

/** Tope de tiempo por entrega (evita colgar el worker contra un endpoint lento). */
const DELIVERY_TIMEOUT_MS = 5000;

/**
 * Webhooks SALIENTES por despacho: notifican a sistemas de terceros cuando ocurren eventos. El cuerpo se
 * firma con HMAC-SHA256 (cabecera `X-Lawzora-Signature: sha256=...`) usando el `secret` del endpoint, que
 * solo se revela al crearlo. El despacho gestiona sus endpoints (RLS por tenant). El despacho de eventos
 * es best-effort y NUNCA lanza: un endpoint caído no debe afectar a la operación que originó el evento.
 *
 * Seguridad: la URL se valida contra SSRF (HTTPS obligatorio + rechazo de hosts internos/privados) tanto
 * al registrarla como antes de cada envío (defensa en profundidad).
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Filtra los eventos pedidos a los conocidos; exige al menos uno válido. */
  private normalizeEvents(events: string[]): string[] {
    const known = new Set<string>(KNOWN_WEBHOOK_EVENTS);
    const valid = Array.from(new Set(events.map((e) => e.trim()).filter((e) => known.has(e))));
    if (valid.length === 0) throw new BadRequestException(apiError('webhooks.eventsRequired'));
    return valid;
  }

  async create(user: RequestUser, dto: CreateWebhookDto) {
    const url = assertSafeWebhookUrl(dto.url);
    const events = this.normalizeEvents(dto.events);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const ep = await this.prisma.webhookEndpoint.create({
      data: { tenantId: user.tenantId, url, secret, events: events.join(','), active: true },
    });
    await this.audit.log(user, 'webhook.endpoint_created', 'WebhookEndpoint', ep.id, {
      url,
      events,
    });
    // El `secret` se devuelve SOLO aquí (en el alta); nunca se vuelve a exponer en lecturas.
    return { id: ep.id, url: ep.url, events, active: ep.active, secret, createdAt: ep.createdAt };
  }

  async list(user: RequestUser) {
    const eps = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return eps.map((e) => ({
      id: e.id,
      url: e.url,
      events: e.events ? e.events.split(',') : [],
      active: e.active,
      createdAt: e.createdAt,
    }));
  }

  async remove(user: RequestUser, id: string) {
    const ep = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!ep) throw new NotFoundException(apiError('webhooks.notFound'));
    await this.prisma.webhookEndpoint.delete({ where: { id: ep.id } });
    await this.audit.log(user, 'webhook.endpoint_deleted', 'WebhookEndpoint', id);
    return { success: true };
  }

  /** Envía un evento de prueba (`ping`) al endpoint, para que el despacho valide su integración. */
  async sendTest(user: RequestUser, id: string) {
    const ep = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!ep) throw new NotFoundException(apiError('webhooks.notFound'));
    const delivered = await this.deliver(ep, 'ping', { message: 'Webhook de prueba de Lawzora' });
    return { delivered };
  }

  /**
   * Despacha un evento a los endpoints ACTIVOS del tenant suscritos a él. Best-effort y fire-and-forget:
   * captura cualquier error para no afectar a la operación de origen.
   */
  async dispatch(tenantId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { tenantId, active: true },
      });
      const targets = endpoints.filter((e) => e.events.split(',').includes(event));
      await Promise.all(targets.map((e) => this.deliver(e, event, payload).catch(() => false)));
    } catch (e) {
      this.logger.warn(`Fallo al despachar webhook ${event}: ${(e as Error).message}`);
    }
  }

  /** Entrega firmada a un endpoint. Devuelve si la respuesta fue 2xx. Nunca lanza. */
  private async deliver(
    ep: { url: string; secret: string },
    event: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const body = JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() });
    const signature = createHmac('sha256', ep.secret).update(body).digest('hex');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      // Revalida la URL antes de enviar (defensa SSRF en profundidad: el endpoint pudo crearse antes de
      // endurecer la validación, o la URL pudo manipularse).
      assertSafeWebhookUrl(ep.url);
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-lawzora-event': event,
          'x-lawzora-signature': `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
