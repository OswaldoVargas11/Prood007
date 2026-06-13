import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AuditService } from '../audit/audit.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
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
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.client.count({ where: { tenantId: user.tenantId } }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(user: RequestUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    return client;
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
}
