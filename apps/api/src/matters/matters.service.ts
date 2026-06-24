import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatterStatus, Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { AiSearchService } from '../ai/ai-search.service';
import { CreateMatterDto } from './dto/create-matter.dto';
import { UpdateMatterDto } from './dto/update-matter.dto';
import { canTransition } from './matter-status';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/** Gestión de expedientes, acotada por tenant, con máquina de estados y asignación de abogado. */
@Injectable()
export class MattersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aiSearch: AiSearchService,
  ) {}

  /** Comprueba que el cliente pertenece al tenant. */
  private async assertClientInTenant(user: RequestUser, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!client) throw new BadRequestException(apiError('matters.clientNotInFirm'));
  }

  /** Comprueba que el abogado pertenece al tenant y tiene rol LAWYER o FIRM_ADMIN. */
  private async assertLawyerInTenant(user: RequestUser, lawyerId: string): Promise<void> {
    const lawyer = await this.prisma.user.findFirst({
      where: {
        id: lawyerId,
        tenantId: user.tenantId,
        roles: { some: { role: { code: { in: [Role.LAWYER, Role.FIRM_ADMIN] } } } },
      },
      select: { id: true },
    });
    if (!lawyer) throw new BadRequestException(apiError('matters.invalidLawyer'));
  }

  private async generateReference(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.matter.count({ where: { tenantId } });
    return `EXP-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  /** Solo el administrador del despacho asigna el letrado responsable. */
  private assertCanAssignLawyer(user: RequestUser): void {
    if (!user.roles.includes(Role.FIRM_ADMIN)) {
      throw new ForbiddenException(apiError('matters.assignLawyerAdminOnly'));
    }
  }

  /** Letrados del despacho a los que se puede asignar un expediente (LAWYER o FIRM_ADMIN activos). */
  async listAssignees(user: RequestUser) {
    const lawyers = await this.prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        roles: { some: { role: { code: { in: [Role.LAWYER, Role.FIRM_ADMIN] } } } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return lawyers;
  }

  async create(user: RequestUser, dto: CreateMatterDto) {
    await this.assertClientInTenant(user, dto.clientId);
    if (dto.lawyerId) {
      this.assertCanAssignLawyer(user);
      await this.assertLawyerInTenant(user, dto.lawyerId);
    }

    const reference = dto.reference?.trim() || (await this.generateReference(user.tenantId));

    // Unicidad de referencia por tenant.
    const existing = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference },
      select: { id: true },
    });
    if (existing) throw new BadRequestException(apiError('matters.referenceExists'));

    const matter = await this.prisma.matter.create({
      data: {
        tenantId: user.tenantId,
        reference,
        title: dto.title,
        type: dto.type,
        clientId: dto.clientId,
        lawyerId: dto.lawyerId,
        status: MatterStatus.OPEN,
        opposingParty: dto.opposingParty?.trim() || null,
        opposingPartyTaxId: dto.opposingPartyTaxId?.trim() || null,
        opposingCounsel: dto.opposingCounsel?.trim() || null,
        court: dto.court?.trim() || null,
        caseNumber: dto.caseNumber?.trim() || null,
        proceduralPhase: dto.proceduralPhase?.trim() || null,
      },
    });
    await this.audit.log(user, 'matter.created', 'Matter', matter.id, { reference });
    // Auto-indexado semántico best-effort para la búsqueda de conocimiento del despacho. No-op sin clave
    // de embeddings; no bloquea la creación (fire-and-forget) y el cron nocturno lo respalda.
    void this.aiSearch.indexMatter(user, matter.id).catch(() => undefined);
    return matter;
  }

  async findAll(
    user: RequestUser,
    page = 1,
    pageSize = 20,
    status?: MatterStatus,
    clientId?: string,
  ) {
    const where = {
      tenantId: user.tenantId,
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
    };
    const skip = (page - 1) * pageSize;
    const { items, total } = await tenantTransaction(this.prisma, async (tx) => {
      const items = await tx.matter.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        include: {
          client: { select: { id: true, name: true } },
          lawyer: { select: { id: true, fullName: true } },
        },
        skip,
        take: pageSize,
      });
      const total = await tx.matter.count({ where });
      return { items, total };
    });
    return { items, total, page, pageSize };
  }

  async findOne(user: RequestUser, id: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        client: { select: { id: true, name: true, taxId: true } },
        lawyer: { select: { id: true, fullName: true } },
      },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notFound'));
    // Consumido del presupuesto = valor del trabajo registrado (honorarios incurridos) del expediente.
    const entries = await this.prisma.timeEntry.findMany({
      where: { tenantId: user.tenantId, matterId: id },
      select: { minutes: true, hourlyRate: true },
    });
    const budgetConsumed =
      Math.round(entries.reduce((s, e) => s + (e.minutes / 60) * Number(e.hourlyRate), 0) * 100) /
      100;
    return { ...matter, budgetConsumed };
  }

  /**
   * Línea de tiempo del expediente: un único feed cronológico que unifica documentos, tareas/plazos,
   * movimientos del ledger, correos y mensajes de chat. Acotado por tenant; cada fuente limitada para
   * no traer historiales enormes (se devuelven los más recientes ya mezclados).
   */
  async timeline(user: RequestUser, id: string) {
    await this.findOne(user, id); // valida pertenencia/existencia
    const where = { tenantId: user.tenantId, matterId: id };
    const [docs, tasks, entries, emails, messages] = await Promise.all([
      this.prisma.document.findMany({
        where,
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.task.findMany({
        where,
        select: { id: true, title: true, createdAt: true, isProcedural: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.ledgerEntry.findMany({
        where,
        select: {
          id: true,
          type: true,
          description: true,
          amount: true,
          currency: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
      this.prisma.matterEmail.findMany({
        where,
        select: {
          id: true,
          direction: true,
          fromAddr: true,
          toAddr: true,
          subject: true,
          sentAt: true,
        },
        orderBy: { sentAt: 'desc' },
        take: 50,
      }),
      this.prisma.message.findMany({
        where,
        select: { id: true, body: true, createdAt: true, author: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const events = [
      ...docs.map((d) => ({
        type: 'document',
        at: d.createdAt,
        title: d.name,
        subtitle: null as string | null,
      })),
      ...tasks.map((t) => ({
        type: t.isProcedural ? 'deadline' : 'task',
        at: t.createdAt,
        title: t.title,
        subtitle: null as string | null,
      })),
      ...entries.map((e) => ({
        type: 'ledger',
        at: e.occurredAt,
        title: e.description,
        subtitle: `${e.type} · ${e.amount} ${e.currency}`,
      })),
      ...emails.map((m) => ({
        type: 'email',
        at: m.sentAt,
        title: m.subject || '(sin asunto)',
        subtitle: m.direction === 'IN' ? `De ${m.fromAddr}` : `Para ${m.toAddr}`,
      })),
      ...messages.map((m) => ({
        type: 'message',
        at: m.createdAt,
        title: m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body,
        subtitle: m.author.fullName,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 80)
      .map((e) => ({ ...e, at: e.at.toISOString() }));

    return { events };
  }

  async update(user: RequestUser, id: string, dto: UpdateMatterDto) {
    await this.findOne(user, id);
    // Para campos de texto opcionales: undefined → no tocar; "" o solo espacios → limpiar (null).
    const text = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    await this.prisma.matter.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        title: dto.title,
        type: dto.type,
        // "" quita el presupuesto; undefined lo deja como está.
        budgetAmount:
          dto.budgetAmount === undefined
            ? undefined
            : dto.budgetAmount === ''
              ? null
              : dto.budgetAmount,
        opposingParty: text(dto.opposingParty),
        opposingPartyTaxId: text(dto.opposingPartyTaxId),
        opposingCounsel: text(dto.opposingCounsel),
        court: text(dto.court),
        caseNumber: text(dto.caseNumber),
        proceduralPhase: text(dto.proceduralPhase),
      },
    });
    await this.audit.log(user, 'matter.updated', 'Matter', id);
    return this.findOne(user, id);
  }

  /** Asigna (o desasigna con `null`) el letrado responsable. Solo administrador del despacho. */
  async assignLawyer(user: RequestUser, id: string, lawyerId: string | null) {
    this.assertCanAssignLawyer(user);
    await this.findOne(user, id);
    if (lawyerId) await this.assertLawyerInTenant(user, lawyerId);
    await this.prisma.matter.updateMany({
      where: { id, tenantId: user.tenantId },
      data: { lawyerId },
    });
    await this.audit.log(user, 'matter.lawyer_assigned', 'Matter', id, { lawyerId });
    return this.findOne(user, id);
  }

  /**
   * Equipo del expediente: letrado responsable/líder (`Matter.lawyerId`) + letrados adicionales
   * asignados (`MatterAssignment`). Lectura para staff del despacho. El chat (PR-4) restringe la
   * participación a este equipo + el cliente.
   */
  async getTeam(user: RequestUser, id: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id, tenantId: user.tenantId },
      select: {
        lawyer: { select: { id: true, fullName: true } },
        assignments: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notFound'));
    return {
      lead: matter.lawyer ?? null,
      members: matter.assignments.map((a) => a.user),
    };
  }

  /** Añade un letrado adicional al equipo. Solo administrador. Idempotente (no duplica). */
  async addAssignee(user: RequestUser, id: string, userId: string) {
    this.assertCanAssignLawyer(user);
    await this.findOne(user, id);
    await this.assertLawyerInTenant(user, userId);
    await this.prisma.matterAssignment.upsert({
      where: { matterId_userId: { matterId: id, userId } },
      create: { tenantId: user.tenantId, matterId: id, userId },
      update: {},
    });
    await this.audit.log(user, 'matter.assignee_added', 'Matter', id, { userId });
    return this.getTeam(user, id);
  }

  /** Quita un letrado adicional del equipo. Solo administrador. */
  async removeAssignee(user: RequestUser, id: string, userId: string) {
    this.assertCanAssignLawyer(user);
    await this.findOne(user, id);
    await this.prisma.matterAssignment.deleteMany({
      where: { tenantId: user.tenantId, matterId: id, userId },
    });
    await this.audit.log(user, 'matter.assignee_removed', 'Matter', id, { userId });
    return this.getTeam(user, id);
  }

  /** Cambia el estado validando la transición contra la máquina de estados. */
  async changeStatus(user: RequestUser, id: string, next: MatterStatus) {
    const matter = await this.findOne(user, id);
    if (matter.status === next) return matter;
    if (!canTransition(matter.status as MatterStatus, next)) {
      throw new BadRequestException(
        apiError('matters.invalidTransition', {
          message: `Transición de estado no permitida: ${matter.status} → ${next}.`,
          params: { from: matter.status, to: next },
        }),
      );
    }
    await this.prisma.matter.updateMany({
      where: { id, tenantId: user.tenantId },
      data: {
        status: next,
        closedAt: next === MatterStatus.CLOSED ? new Date() : matter.closedAt,
      },
    });
    await this.audit.log(user, 'matter.status_changed', 'Matter', id, {
      from: matter.status,
      to: next,
    });
    return this.findOne(user, id);
  }
}
