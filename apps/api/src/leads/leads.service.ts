import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { LeadStatus } from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { ClientsService } from '../clients/clients.service';
import { MattersService } from '../matters/matters.service';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-messages';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { IntakeDto } from './dto/intake.dto';
import type { RequestUser } from '../auth/auth.types';

/**
 * Mini-CRM de captación: prospectos (leads) en un embudo (NEW→CONTACTED→QUALIFIED→CONVERTED/LOST).
 * Entran a mano o por el formulario PÚBLICO de intake (rol system, sin contexto de tenant). Al CONVERTIR
 * se crea el Cliente (y opcionalmente el Expediente) reutilizando sus servicios (validación + auditoría).
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly clients: ClientsService,
    private readonly matters: MattersService,
    private readonly audit: AuditService,
  ) {}

  private readonly include = { assignedTo: { select: { id: true, fullName: true } } };

  /**
   * L-6 (CWE-639): valida que `assignedToId` referencie a un usuario del MISMO despacho. Sin esto, un
   * staffer podía asignar un lead a un id de usuario de OTRO tenant, cuyo `fullName` se reflejaba al leer
   * (fuga menor cross-tenant). La RLS ya acotaría la lectura, pero validamos explícitamente al escribir.
   */
  private async assertAssignable(user: RequestUser, assignedToId?: string | null): Promise<void> {
    if (!assignedToId) return;
    const exists = await this.prisma.user.findFirst({
      where: { id: assignedToId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException(apiError('leads.assigneeNotInFirm'));
  }

  async list(user: RequestUser, status?: LeadStatus) {
    return this.prisma.lead.findMany({
      where: { tenantId: user.tenantId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      include: this.include,
    });
  }

  async create(user: RequestUser, dto: CreateLeadDto) {
    await this.assertAssignable(user, dto.assignedToId);
    const lead = await this.prisma.lead.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        subject: dto.subject,
        notes: dto.notes,
        source: dto.source ?? 'manual',
        estimatedValue: dto.estimatedValue,
        assignedToId: dto.assignedToId,
      },
      include: this.include,
    });
    await this.audit.log(user, 'lead.created', 'Lead', lead.id, { name: lead.name });
    return lead;
  }

  async get(user: RequestUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId: user.tenantId },
      include: this.include,
    });
    if (!lead) throw new NotFoundException(apiError('leads.notFound'));
    return lead;
  }

  async update(user: RequestUser, id: string, dto: UpdateLeadDto) {
    await this.get(user, id);
    await this.assertAssignable(user, dto.assignedToId);
    // Campos permitidos EXPLÍCITOS (no `...dto`): aunque `forbidNonWhitelisted` ya filtra extras, el spread
    // dejaría que cualquier columna añadida al DTO en el futuro fuera escribible por el cliente (BOPLA).
    await this.prisma.lead.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        subject: dto.subject,
        notes: dto.notes,
        source: dto.source,
        estimatedValue: dto.estimatedValue,
        assignedToId: dto.assignedToId,
        status: dto.status,
      },
    });
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string) {
    await this.get(user, id);
    await this.prisma.lead.deleteMany({ where: { id, tenantId: user.tenantId } });
    return { success: true };
  }

  /** Convierte el lead en cliente (+ expediente opcional) y lo marca CONVERTED. */
  async convert(user: RequestUser, id: string, dto: ConvertLeadDto) {
    const lead = await this.get(user, id);
    if (lead.status === LeadStatus.CONVERTED) {
      throw new BadRequestException(apiError('leads.alreadyConverted'));
    }
    const client = await this.clients.create(user, {
      name: lead.name,
      taxId: dto.taxId,
      docType: dto.docType,
      email: lead.email ?? undefined,
      phone: lead.phone ?? undefined,
    });
    let matterId: string | undefined;
    if (dto.createMatter) {
      const matter = await this.matters.create(user, {
        title: dto.matterTitle?.trim() || lead.subject?.trim() || `Asunto de ${lead.name}`,
        type: dto.matterType?.trim() || 'Consulta',
        clientId: client.id,
      });
      matterId = matter.id;
    }
    await this.prisma.lead.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        status: LeadStatus.CONVERTED,
        convertedClientId: client.id,
        convertedMatterId: matterId ?? null,
      },
    });
    await this.audit.log(user, 'lead.converted', 'Lead', id, { clientId: client.id, matterId });
    return { clientId: client.id, matterId };
  }

  /** Genera un token de intake nuevo (no adivinable). */
  private newIntakeToken(): string {
    return randomBytes(18).toString('base64url');
  }

  /** Devuelve (generándolo si falta) el token del formulario público de captación del despacho. */
  async intakeLink(user: RequestUser) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { intakeToken: true },
    });
    let token = tenant.intakeToken;
    if (!token) {
      token = this.newIntakeToken();
      await this.prisma.tenant.update({
        where: { id: user.tenantId },
        data: { intakeToken: token },
      });
    }
    return { token };
  }

  /**
   * Rota el token del formulario público de captación: sobrescribe `intakeToken` con un valor nuevo,
   * invalidando el enlace anterior. Útil si el enlace se filtró o recibe spam. Solo FIRM_ADMIN.
   */
  async rotateIntakeToken(user: RequestUser) {
    const token = this.newIntakeToken();
    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { intakeToken: token },
    });
    await this.audit.log(user, 'lead.intake_token_rotated', 'Tenant', user.tenantId);
    return { token };
  }

  // ── Intake PÚBLICO (sin auth; rol system, sin contexto de tenant) ────────────
  /** Datos mínimos para pintar el formulario público (nombre del despacho). Null si el token no existe. */
  async publicIntakeInfo(token: string) {
    const tenant = await this.system.tenant.findUnique({
      where: { intakeToken: token },
      select: { name: true },
    });
    return tenant ? { firmName: tenant.name } : null;
  }

  /** Crea un lead (source=intake, status=NEW) para el despacho dueño del token. */
  async publicIntake(token: string, dto: IntakeDto) {
    const tenant = await this.system.tenant.findUnique({
      where: { intakeToken: token },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException(apiError('leads.intakeNotFound'));
    await this.system.lead.create({
      data: {
        tenantId: tenant.id,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        subject: dto.subject,
        source: 'intake',
        status: LeadStatus.NEW,
      },
    });
    return { received: true };
  }
}
