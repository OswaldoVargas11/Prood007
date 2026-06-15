import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { assertMatterAccess } from '../messages/matter-access';
import type { RequestUser } from '../auth/auth.types';

/**
 * Portal del cliente (solo lectura). Cada endpoint queda acotado a los expedientes de la propia
 * ficha de cliente del usuario, vía `assertMatterAccess` y el vínculo Client.userId.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  private async myClient(user: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
    });
    if (!client) throw new ForbiddenException('No tienes una ficha de cliente asociada.');
    return client;
  }

  async myProfile(user: RequestUser) {
    const client = await this.myClient(user);
    return { id: client.id, name: client.name, taxId: client.taxId, email: client.email };
  }

  async listMatters(user: RequestUser) {
    const client = await this.myClient(user);
    return this.prisma.matter.findMany({
      where: { tenantId: user.tenantId, clientId: client.id },
      orderBy: { openedAt: 'desc' },
    });
  }

  async getMatter(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.prisma.matter.findFirst({ where: { id: matterId, tenantId: user.tenantId } });
  }

  async listDocuments(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.prisma.document.findMany({
      where: { tenantId: user.tenantId, matterId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, reviewStatus: true, createdAt: true },
        },
      },
    });
  }

  async ledgerView(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    const ledger = await this.ledger.getMatterLedger(user, matterId);
    // El cliente NUNCA ve costes propuestos/rechazados (procesos internos del despacho): solo aprobados.
    return {
      ...ledger,
      entries: ledger.entries.filter((e) => e.approvalStatus === 'APPROVED'),
    };
  }

  async listTasks(user: RequestUser, matterId: string) {
    await assertMatterAccess(this.prisma, user, matterId);
    return this.prisma.task.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async listInvoices(user: RequestUser) {
    const client = await this.myClient(user);
    return this.prisma.invoice.findMany({
      where: { tenantId: user.tenantId, clientId: client.id },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        currency: true,
        total: true,
        taxableBase: true,
        taxAmount: true,
        withholdingAmount: true,
      },
    });
  }
}
