import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';

/**
 * Búsqueda global del despacho: un solo término contra clientes, expedientes, documentos y facturas.
 * Server-side (sin tope de paginación del cliente), insensible a mayúsculas, acotada por tenant + RLS.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: RequestUser, query: string) {
    const q = (query ?? '').trim();
    if (q.length < 2) return { clients: [], matters: [], documents: [], invoices: [] };
    const ci = { contains: q, mode: 'insensitive' as const };
    const tenantId = user.tenantId;

    const [clients, matters, documents, invoices] = await Promise.all([
      this.prisma.client.findMany({
        where: { tenantId, OR: [{ name: ci }, { taxId: ci }, { email: ci }] },
        select: { id: true, name: true, taxId: true },
        take: 8,
      }),
      this.prisma.matter.findMany({
        where: { tenantId, OR: [{ reference: ci }, { title: ci }, { opposingParty: ci }] },
        select: { id: true, reference: true, title: true },
        orderBy: { openedAt: 'desc' },
        take: 8,
      }),
      this.prisma.document.findMany({
        where: { tenantId, name: ci },
        select: { id: true, name: true, matterId: true, matter: { select: { reference: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, OR: [{ number: ci }, { client: { name: ci } }] },
        select: { id: true, number: true, client: { select: { name: true } } },
        orderBy: { issueDate: 'desc' },
        take: 8,
      }),
    ]);

    return {
      clients,
      matters,
      documents: documents.map((d) => ({
        id: d.id,
        name: d.name,
        matterId: d.matterId,
        matterRef: d.matter.reference,
      })),
      invoices: invoices.map((i) => ({ id: i.id, number: i.number, clientName: i.client.name })),
    };
  }
}
