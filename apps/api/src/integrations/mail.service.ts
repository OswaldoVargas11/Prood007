import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from './google.service';
import { MicrosoftService } from './microsoft.service';
import type { RequestUser } from '../auth/auth.types';

type Provider = 'google' | 'microsoft';

/**
 * Capa neutral de correo: la pestaña "Correos" del expediente no necesita saber el proveedor. Resuelve
 * cuál tiene conectado el usuario (Google o Microsoft) y delega. El listado lee `MatterEmail` directamente
 * (es agnóstico del proveedor). Si el usuario tiene ambos, gana el conectado más recientemente.
 */
@Injectable()
export class MailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly microsoft: MicrosoftService,
  ) {}

  async connectedProvider(user: RequestUser): Promise<Provider | null> {
    const conns = await this.prisma.oAuthConnection.findMany({
      where: { userId: user.userId, provider: { in: ['google', 'microsoft'] } },
      orderBy: { updatedAt: 'desc' },
      select: { provider: true },
    });
    return (conns[0]?.provider as Provider) ?? null;
  }

  private async svc(user: RequestUser) {
    const provider = await this.connectedProvider(user);
    if (provider === 'google') return this.google;
    if (provider === 'microsoft') return this.microsoft;
    throw new BadRequestException({
      messageKey: 'integrations.notConnected',
      message: 'No hay ninguna cuenta de correo conectada.',
    });
  }

  async status(user: RequestUser) {
    const conn = await this.prisma.oAuthConnection.findMany({
      where: { userId: user.userId, provider: { in: ['google', 'microsoft'] } },
      orderBy: { updatedAt: 'desc' },
      select: { provider: true, scopes: true },
    });
    const c = conn[0];
    // ¿Puede LEER la bandeja para "adjuntar"? Gmail solo si tiene readonly (no por defecto); Outlook con Mail.Read.
    const canAttach = Boolean(
      c && (c.scopes.includes('gmail.readonly') || c.scopes.includes('Mail.Read')),
    );
    return { provider: (c?.provider as Provider) ?? null, canAttach };
  }

  async listRecent(user: RequestUser) {
    return (await this.svc(user)).listRecentEmails(user);
  }

  async attach(user: RequestUser, matterId: string, externalId: string) {
    return (await this.svc(user)).attachEmail(user, matterId, externalId);
  }

  async send(user: RequestUser, matterId: string, to: string, subject: string, body: string) {
    return (await this.svc(user)).sendEmail(user, matterId, to, subject, body);
  }

  /** Correspondencia registrada de un expediente (ambas direcciones), más reciente primero. */
  async listForMatter(user: RequestUser, matterId: string) {
    const m = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!m) throw new BadRequestException({ messageKey: 'matters.notFound' });
    return this.prisma.matterEmail.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        direction: true,
        fromAddr: true,
        toAddr: true,
        subject: true,
        snippet: true,
        sentAt: true,
      },
    });
  }
}
