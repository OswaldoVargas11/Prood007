import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { UpdateSchedulingConfigDto } from './dto/update-config.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import {
  firmTimeZone,
  generateSlots,
  nowLocal,
  slotLabels,
  type SchedulingRules,
} from './scheduling.time';

const DEFAULT_RULES: SchedulingRules = {
  weekdays: [1, 2, 3, 4, 5],
  startMin: 540,
  endMin: 1080,
  slotMinutes: 30,
};
const HORIZON_DAYS = 21;

type ApptRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  note: string | null;
  lawyer?: { id: string; fullName: string } | null;
  client?: { id: string; name: string } | null;
  matter?: { id: string; reference: string; title: string } | null;
};

/**
 * Auto-agenda nativa: disponibilidad por abogado + reserva de citas desde el portal. El cliente solo
 * puede reservar con abogados responsables de SUS expedientes y cuya disponibilidad esté activa. Acotado
 * al tenant por RLS; el scoping por cliente se valida además en la capa de aplicación.
 */
@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Lado despacho (abogado/admin) ───────────────────────────────────────────

  async getMyConfig(user: RequestUser) {
    const cfg = await this.prisma.schedulingConfig.findUnique({
      where: { lawyerId: user.userId },
    });
    return cfg ?? { enabled: false, ...DEFAULT_RULES };
  }

  async updateMyConfig(user: RequestUser, dto: UpdateSchedulingConfigDto) {
    if (dto.endMin <= dto.startMin) {
      throw new BadRequestException({ messageKey: 'scheduling.invalidHours' });
    }
    const data = {
      enabled: dto.enabled,
      weekdays: dto.weekdays,
      startMin: dto.startMin,
      endMin: dto.endMin,
      slotMinutes: dto.slotMinutes,
    };
    return this.prisma.schedulingConfig.upsert({
      where: { lawyerId: user.userId },
      create: { tenantId: user.tenantId, lawyerId: user.userId, ...data },
      update: data,
    });
  }

  async listFirmAppointments(user: RequestUser) {
    const now = nowLocal(firmTimeZone(user.jurisdiction));
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId: user.tenantId,
        lawyerId: user.userId,
        status: { not: 'CANCELLED' },
        endsAt: { gte: now },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        client: { select: { id: true, name: true } },
        matter: { select: { id: true, reference: true, title: true } },
      },
    });
    return rows.map((a) => this.present(a));
  }

  async setStatus(user: RequestUser, id: string, status: 'CONFIRMED' | 'CANCELLED') {
    const res = await this.prisma.appointment.updateMany({
      where: { id, tenantId: user.tenantId, lawyerId: user.userId },
      data: { status },
    });
    if (res.count === 0) throw new NotFoundException({ messageKey: 'scheduling.notFound' });
    return { success: true };
  }

  // ── Lado portal (cliente) ────────────────────────────────────────────────────

  private async myClient(user: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    if (!client) throw new ForbiddenException(apiError('matters.noAccess'));
    return client;
  }

  /** Abogados responsables de los expedientes del cliente, con si tienen agenda abierta. */
  async clientOptions(user: RequestUser) {
    const client = await this.myClient(user);
    const matters = await this.prisma.matter.findMany({
      where: { tenantId: user.tenantId, clientId: client.id, lawyerId: { not: null } },
      select: {
        id: true,
        reference: true,
        title: true,
        lawyerId: true,
        lawyer: { select: { id: true, fullName: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
    const lawyerIds = [...new Set(matters.map((m) => m.lawyerId).filter((x): x is string => !!x))];
    const configs = lawyerIds.length
      ? await this.prisma.schedulingConfig.findMany({
          where: { lawyerId: { in: lawyerIds }, enabled: true },
          select: { lawyerId: true },
        })
      : [];
    const open = new Set(configs.map((c) => c.lawyerId));
    const byLawyer = new Map<
      string,
      {
        lawyerId: string;
        lawyerName: string;
        bookable: boolean;
        matters: { id: string; label: string }[];
      }
    >();
    for (const m of matters) {
      const lid = m.lawyerId as string;
      if (!byLawyer.has(lid)) {
        byLawyer.set(lid, {
          lawyerId: lid,
          lawyerName: m.lawyer?.fullName ?? '',
          bookable: open.has(lid),
          matters: [],
        });
      }
      byLawyer.get(lid)!.matters.push({ id: m.id, label: `${m.reference} — ${m.title}` });
    }
    return [...byLawyer.values()];
  }

  /** Verifica que el cliente puede reservar con ese abogado (tiene expediente con él + agenda activa). */
  private async assertBookable(user: RequestUser, clientId: string, lawyerId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, clientId, lawyerId },
      select: { id: true },
    });
    if (!matter) throw new ForbiddenException(apiError('matters.noAccess'));
    const cfg = await this.prisma.schedulingConfig.findFirst({
      where: { lawyerId, enabled: true },
    });
    if (!cfg) throw new BadRequestException({ messageKey: 'scheduling.unavailable' });
    return cfg;
  }

  private async existingFor(user: RequestUser, lawyerId: string, now: Date) {
    return this.prisma.appointment.findMany({
      where: {
        tenantId: user.tenantId,
        lawyerId,
        status: { not: 'CANCELLED' },
        endsAt: { gte: now },
      },
      select: { startsAt: true, endsAt: true },
    });
  }

  async clientSlots(user: RequestUser, lawyerId: string) {
    if (!lawyerId) throw new BadRequestException({ messageKey: 'scheduling.unavailable' });
    const client = await this.myClient(user);
    const cfg = await this.assertBookable(user, client.id, lawyerId);
    const now = nowLocal(firmTimeZone(user.jurisdiction));
    const existing = await this.existingFor(user, lawyerId, now);
    return generateSlots(cfg, existing, now, HORIZON_DAYS).map((s) => {
      const { dayLabel, timeLabel } = slotLabels(s);
      return { startsAt: s.toISOString(), dayLabel, timeLabel };
    });
  }

  async book(user: RequestUser, dto: CreateAppointmentDto) {
    const client = await this.myClient(user);
    const cfg = await this.assertBookable(user, client.id, dto.lawyerId);

    let matterId: string | null = null;
    if (dto.matterId) {
      const m = await this.prisma.matter.findFirst({
        where: { id: dto.matterId, tenantId: user.tenantId, clientId: client.id },
        select: { id: true },
      });
      if (!m) throw new ForbiddenException(apiError('matters.noAccess'));
      matterId = m.id;
    }

    const start = new Date(dto.startsAt);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException({ messageKey: 'scheduling.invalidSlot' });
    }
    // Re-validar contra la rejilla y colisiones (no fiarse del cliente).
    const now = nowLocal(firmTimeZone(user.jurisdiction));
    const existing = await this.existingFor(user, dto.lawyerId, now);
    const valid = generateSlots(cfg, existing, now, HORIZON_DAYS).some(
      (s) => s.getTime() === start.getTime(),
    );
    if (!valid) throw new BadRequestException({ messageKey: 'scheduling.slotTaken' });

    const end = new Date(start.getTime() + cfg.slotMinutes * 60_000);
    const appt = await this.prisma.appointment.create({
      data: {
        tenantId: user.tenantId,
        lawyerId: dto.lawyerId,
        clientId: client.id,
        matterId,
        startsAt: start,
        endsAt: end,
        status: 'REQUESTED',
        note: dto.note?.trim() || null,
        createdById: user.userId,
      },
      include: { matter: { select: { id: true, reference: true, title: true } } },
    });
    return this.present(appt);
  }

  async listClientAppointments(user: RequestUser) {
    const client = await this.myClient(user);
    const now = nowLocal(firmTimeZone(user.jurisdiction));
    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId: user.tenantId,
        clientId: client.id,
        status: { not: 'CANCELLED' },
        endsAt: { gte: now },
      },
      orderBy: { startsAt: 'asc' },
      include: {
        lawyer: { select: { id: true, fullName: true } },
        matter: { select: { id: true, reference: true, title: true } },
      },
    });
    return rows.map((a) => this.present(a));
  }

  async cancelClientAppointment(user: RequestUser, id: string) {
    const client = await this.myClient(user);
    const res = await this.prisma.appointment.updateMany({
      where: { id, tenantId: user.tenantId, clientId: client.id },
      data: { status: 'CANCELLED' },
    });
    if (res.count === 0) throw new NotFoundException({ messageKey: 'scheduling.notFound' });
    return { success: true };
  }

  private present(a: ApptRow) {
    const { dayLabel, timeLabel } = slotLabels(a.startsAt);
    return {
      id: a.id,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      note: a.note ?? null,
      dayLabel,
      timeLabel,
      lawyer: a.lawyer ? { id: a.lawyer.id, name: a.lawyer.fullName } : undefined,
      client: a.client ? { id: a.client.id, name: a.client.name } : undefined,
      matter: a.matter
        ? { id: a.matter.id, label: `${a.matter.reference} — ${a.matter.title}` }
        : undefined,
    };
  }
}
