import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import type { RequestUser } from '../auth/auth.types';

type StaffRole = Role.FIRM_ADMIN | Role.LAWYER;
const STAFF_ROLES: StaffRole[] = [Role.FIRM_ADMIN, Role.LAWYER];

export interface SeatUsage {
  admins: { used: number; max: number };
  lawyers: { used: number; max: number };
}

/**
 * Gestión de usuarios del despacho (staff: letrados y administradores), SIEMPRE acotada por tenant.
 * Aplica la LICENCIA del despacho: nº máximo de admins y letrados ACTIVOS (asientos contratados).
 * No gestiona usuarios CLIENT (esos se crean desde el módulo de clientes, portal). Solo FIRM_ADMIN.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cuenta usuarios ACTIVOS de un rol concreto en el tenant. */
  private countActive(tenantId: string, code: StaffRole): Promise<number> {
    return this.prisma.user.count({
      where: { tenantId, isActive: true, roles: { some: { role: { code } } } },
    });
  }

  private async tenant(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return t;
  }

  private maxFor(tenant: { maxAdmins: number; maxLawyers: number }, role: StaffRole): number {
    return role === Role.FIRM_ADMIN ? tenant.maxAdmins : tenant.maxLawyers;
  }

  /** Uso de plazas (asientos) por rol vs. la licencia del despacho. */
  async seatUsage(user: RequestUser): Promise<SeatUsage> {
    const tenant = await this.tenant(user.tenantId);
    const [admins, lawyers] = await Promise.all([
      this.countActive(user.tenantId, Role.FIRM_ADMIN),
      this.countActive(user.tenantId, Role.LAWYER),
    ]);
    return {
      admins: { used: admins, max: tenant.maxAdmins },
      lawyers: { used: lawyers, max: tenant.maxLawyers },
    };
  }

  /** Lista el staff (admins + letrados) del despacho con su rol y estado. Excluye usuarios CLIENT. */
  async listStaff(user: RequestUser) {
    const users = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId, roles: { some: { role: { code: { in: STAFF_ROLES } } } } },
      orderBy: { createdAt: 'asc' },
      include: { roles: { include: { role: { select: { code: true } } } } },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      isActive: u.isActive,
      role: this.staffRoleOf(u.roles.map((r) => r.role.code)),
      isSelf: u.id === user.userId,
      createdAt: u.createdAt,
    }));
  }

  private staffRoleOf(codes: string[]): StaffRole {
    return codes.includes(Role.FIRM_ADMIN) ? Role.FIRM_ADMIN : Role.LAWYER;
  }

  private async roleId(tenantId: string, code: StaffRole): Promise<string> {
    const role = await this.prisma.role.findFirstOrThrow({ where: { tenantId, code } });
    return role.id;
  }

  /** Alta de un usuario del despacho. Aplica el límite de plazas de la licencia. */
  async createStaff(user: RequestUser, dto: CreateStaffDto) {
    const tenant = await this.tenant(user.tenantId);
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: user.tenantId, email },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Ya existe un usuario con ese email en el despacho.');

    const used = await this.countActive(user.tenantId, dto.role);
    const max = this.maxFor(tenant, dto.role);
    if (used >= max) {
      throw new ForbiddenException(
        `Límite de licencia alcanzado: ${max} ${dto.role === Role.FIRM_ADMIN ? 'administradores' : 'letrados'}. Amplía el plan o desactiva un usuario.`,
      );
    }

    const roleId = await this.roleId(user.tenantId, dto.role);
    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        tenantId: user.tenantId,
        email,
        passwordHash,
        fullName: dto.fullName,
        roles: { create: [{ roleId }] },
      },
    });
    await this.audit.log(user, 'user.created', 'User', created.id, {
      email,
      role: dto.role,
    });
    return { id: created.id, email, fullName: created.fullName, role: dto.role, isActive: true };
  }

  /** Activa/desactiva o cambia el rol de un usuario del despacho, respetando plazas y sin auto-bloqueo. */
  async updateStaff(actor: RequestUser, id: string, dto: UpdateStaffDto) {
    const tenant = await this.tenant(actor.tenantId);
    const target = await this.prisma.user.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { roles: { include: { role: { select: { id: true, code: true } } } } },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    const codes = target.roles.map((r) => r.role.code);
    if (!codes.some((c) => STAFF_ROLES.includes(c as StaffRole))) {
      throw new BadRequestException('Este usuario no es del despacho (es un usuario de portal).');
    }
    const currentRole = this.staffRoleOf(codes);
    const nextRole = dto.role ?? currentRole;
    const nextActive = dto.isActive ?? target.isActive;

    // Protección de bloqueo: no dejar el despacho sin ningún administrador activo.
    const losesAdmin =
      currentRole === Role.FIRM_ADMIN && (nextRole !== Role.FIRM_ADMIN || nextActive === false);
    if (losesAdmin) {
      const activeAdmins = await this.countActive(actor.tenantId, Role.FIRM_ADMIN);
      if (activeAdmins <= 1) {
        throw new BadRequestException(
          'No puedes dejar el despacho sin un administrador activo. Asigna otro admin primero.',
        );
      }
    }

    // Control de plazas: al ACTIVAR (o promover) hay que tener asiento libre para el rol resultante.
    const becomesActiveInRole =
      nextActive &&
      (nextRole !== currentRole || (target.isActive === false && nextActive === true));
    if (becomesActiveInRole) {
      const used = await this.countActive(actor.tenantId, nextRole);
      if (used >= this.maxFor(tenant, nextRole)) {
        throw new ForbiddenException(
          `Límite de licencia alcanzado: ${this.maxFor(tenant, nextRole)} ${nextRole === Role.FIRM_ADMIN ? 'administradores' : 'letrados'}.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (nextRole !== currentRole) {
        const oldRoleId = target.roles.find((r) => r.role.code === currentRole)!.role.id;
        const newRoleId = (
          await tx.role.findFirstOrThrow({ where: { tenantId: actor.tenantId, code: nextRole } })
        ).id;
        await tx.userRole.delete({ where: { userId_roleId: { userId: id, roleId: oldRoleId } } });
        await tx.userRole.create({ data: { userId: id, roleId: newRoleId } });
      }
      if (nextActive !== target.isActive) {
        await tx.user.update({ where: { id }, data: { isActive: nextActive } });
        if (nextActive === false) {
          // Revoca sesiones del usuario desactivado.
          await tx.refreshToken.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
      }
    });

    await this.audit.log(actor, 'user.updated', 'User', id, {
      role: nextRole,
      isActive: nextActive,
    });
    return { id, role: nextRole, isActive: nextActive };
  }
}
