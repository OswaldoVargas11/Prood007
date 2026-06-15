import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { ApprovalStatus, LedgerEntryType, Role } from '@legalflow/domain';

/** Signo de cada tipo de apunte para el saldo (espejo de LedgerService.BALANCE_SIGN). */
const BALANCE_SIGN: Record<LedgerEntryType, number> = {
  [LedgerEntryType.PROVISION]: 1,
  [LedgerEntryType.PAYMENT]: 1,
  [LedgerEntryType.DISBURSEMENT]: -1,
  [LedgerEntryType.TIME_FEE]: -1,
  [LedgerEntryType.FEE]: -1,
  [LedgerEntryType.ADJUSTMENT]: 1,
  [LedgerEntryType.INVOICE]: 0,
};
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreatePortalUserDto } from './dto/create-portal-user.dto';
import type { RequestUser } from '../auth/auth.types';

/**
 * Gestión de clientes. SIEMPRE acotada por `tenantId` del usuario autenticado (aislamiento por
 * tenant). El identificador fiscal se valida con el ComplianceProvider de la jurisdicción del
 * tenant — el núcleo no conoce las reglas de ningún país.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly audit: AuditService,
  ) {}

  /** Valida el identificador fiscal contra el provider del tenant y devuelve su forma normalizada. */
  private validateTaxId(user: RequestUser, taxId: string): { normalized: string; kind?: string } {
    const provider = this.compliance.forJurisdiction(user.jurisdiction);
    const result = provider.validateTaxId(taxId);
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Identificador fiscal no válido para la jurisdicción del despacho.',
        code: result.error?.code ?? 'INVALID_TAX_ID',
        messageKey: result.error?.messageKey,
      });
    }
    return { normalized: result.normalized ?? taxId, kind: result.kind };
  }

  async create(user: RequestUser, dto: CreateClientDto) {
    const { normalized, kind } = this.validateTaxId(user, dto.taxId);
    const client = await this.prisma.client.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        taxId: normalized,
        taxIdKind: kind,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
      },
    });
    await this.audit.log(user, 'client.created', 'Client', client.id, { name: client.name });
    return client;
  }

  async findAll(user: RequestUser, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const { items, total, currency } = await tenantTransaction(this.prisma, async (tx) => {
      const items = await tx.client.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { matters: true } } },
        skip,
        take: pageSize,
      });
      const total = await tx.client.count({ where: { tenantId: user.tenantId } });

      // Saldo por cliente = suma (con signo) de los apuntes APROBADOS de todos sus expedientes.
      const clientIds = items.map((c) => c.id);
      const matters = clientIds.length
        ? await tx.matter.findMany({
            where: { tenantId: user.tenantId, clientId: { in: clientIds } },
            select: { id: true, clientId: true },
          })
        : [];
      const matterToClient = new Map(matters.map((m) => [m.id, m.clientId]));
      const entries = matters.length
        ? await tx.ledgerEntry.findMany({
            where: {
              tenantId: user.tenantId,
              matterId: { in: matters.map((m) => m.id) },
              approvalStatus: ApprovalStatus.APPROVED,
            },
            select: { matterId: true, type: true, amount: true },
          })
        : [];
      const balanceByClient = new Map<string, number>();
      for (const e of entries) {
        const clientId = matterToClient.get(e.matterId);
        if (!clientId) continue;
        const sign = BALANCE_SIGN[e.type as LedgerEntryType];
        balanceByClient.set(
          clientId,
          (balanceByClient.get(clientId) ?? 0) + sign * Number(e.amount),
        );
      }
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: user.tenantId },
        select: { currency: true },
      });
      const withBalance = items.map((c) => ({
        ...c,
        balance: (balanceByClient.get(c.id) ?? 0).toFixed(2),
      }));
      return { items: withBalance, total, currency: tenant.currency };
    });
    return { items, total, page, pageSize, currency };
  }

  async findOne(user: RequestUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    return client;
  }

  /**
   * RGPD/Ley 172-13 — DERECHO DE ACCESO Y PORTABILIDAD: exporta todos los datos del titular en un
   * objeto estructurado y legible. Solo FIRM_ADMIN (controlado en el controller); acotado al tenant.
   * NO expone claves internas de storage; el contenido de documentos se descarga aparte (autenticado).
   * Queda traza en AuditLog (acceso a datos personales). Ver D-022.
   */
  async gdprExport(user: RequestUser, id: string) {
    const data = await tenantTransaction(this.prisma, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          user: { select: { email: true, fullName: true, isActive: true, createdAt: true } },
          matters: {
            orderBy: { createdAt: 'asc' },
            include: {
              documents: {
                select: {
                  id: true,
                  name: true,
                  createdAt: true,
                  versions: {
                    select: {
                      version: true,
                      mimeType: true,
                      sizeBytes: true,
                      contentHash: true,
                      reviewStatus: true,
                      createdAt: true,
                    },
                  },
                },
              },
              tasks: {
                select: { title: true, status: true, dueDate: true, isProcedural: true },
              },
              ledgerEntries: {
                select: { type: true, amount: true, description: true, createdAt: true },
              },
              invoices: {
                select: {
                  number: true,
                  status: true,
                  total: true,
                  issueDate: true,
                  lines: { select: { description: true, quantity: true, unitPrice: true } },
                },
              },
              messages: { select: { body: true, createdAt: true, authorId: true } },
            },
          },
        },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado.');
      return client;
    });

    await this.audit.log(user, 'client.data_exported', 'Client', id, {
      mattersExported: data.matters.length,
    });

    return {
      generatedAt: new Date().toISOString(),
      subject: 'client',
      jurisdiction: user.jurisdiction,
      note: 'Export RGPD/Ley 172-13. El contenido binario de los documentos se descarga por separado (autenticado).',
      data,
    };
  }

  /**
   * Comprobación de conflictos de interés: busca clientes existentes cuyo nombre coincida (parcial,
   * insensible a mayúsculas) con el de la parte que se va a dar de alta. Devuelve coincidencias con sus
   * expedientes, para que el despacho valore si existe conflicto antes de crear cliente/expediente.
   */
  async conflictCheck(user: RequestUser, query: string) {
    const term = (query ?? '').trim();
    if (term.length < 2) return { query: term, matches: [] };
    const clients = await this.prisma.client.findMany({
      where: { tenantId: user.tenantId, name: { contains: term, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        taxId: true,
        taxIdKind: true,
        matters: { select: { id: true, reference: true, title: true, status: true } },
      },
      take: 10,
    });
    return { query: term, matches: clients };
  }

  async update(user: RequestUser, id: string, dto: UpdateClientDto) {
    await this.findOne(user, id); // garantiza pertenencia al tenant

    const data: Record<string, unknown> = {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
    };
    if (dto.taxId !== undefined) {
      const { normalized, kind } = this.validateTaxId(user, dto.taxId);
      data.taxId = normalized;
      data.taxIdKind = kind;
    }

    // updateMany con filtro de tenant evita cualquier fuga aunque el id existiera en otro tenant.
    await this.prisma.client.updateMany({ where: { id, tenantId: user.tenantId }, data });
    await this.audit.log(user, 'client.updated', 'Client', id);
    return this.findOne(user, id);
  }

  async remove(user: RequestUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.client.deleteMany({ where: { id, tenantId: user.tenantId } });
    await this.audit.log(user, 'client.deleted', 'Client', id);
    return { success: true };
  }

  /**
   * Crea un usuario de portal (rol CLIENT) y lo vincula a la ficha de cliente, dándole acceso
   * de solo lectura a sus expedientes. Solo staff del despacho (controlado en el controller).
   */
  async createPortalUser(user: RequestUser, clientId: string, dto: CreatePortalUserDto) {
    const client = await this.findOne(user, clientId);
    if (client.userId) {
      throw new ConflictException('Este cliente ya tiene acceso al portal.');
    }
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId: user.tenantId, email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Ya existe un usuario con ese email en el despacho.');

    const role = await this.prisma.role.findFirstOrThrow({
      where: { tenantId: user.tenantId, code: Role.CLIENT },
    });
    const passwordHash = await argon2.hash(dto.password);

    const created = await tenantTransaction(this.prisma, async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId: user.tenantId,
          email,
          passwordHash,
          fullName: dto.fullName,
          roles: { create: [{ roleId: role.id }] },
        },
      });
      await tx.client.update({ where: { id: clientId }, data: { userId: newUser.id } });
      return newUser;
    });
    await this.audit.log(user, 'client.portal_user_created', 'Client', clientId, {
      portalUserId: created.id,
    });
    return { userId: created.id, email };
  }
}
