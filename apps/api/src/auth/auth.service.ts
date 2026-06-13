import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Currency, Jurisdiction, Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService } from './tokens.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { PERMISSION_NAMES, PERMISSIONS, ROLE_NAMES, ROLE_PERMISSIONS } from './rbac/permissions';
import type { TokenPair } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  private hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  /**
   * Registra un despacho (tenant), siembra el RBAC base y crea el primer usuario FIRM_ADMIN.
   * Devuelve un par de tokens (auto-login). Todo en una transacción.
   */
  async registerTenant(dto: RegisterTenantDto): Promise<{ tenantId: string; tokens: TokenPair }> {
    const passwordHash = await this.hashPassword(dto.admin.password);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1) Asegurar catálogo de permisos global (idempotente).
      await Promise.all(
        PERMISSIONS.map((code) =>
          tx.permission.upsert({
            where: { code },
            update: {},
            create: { code, name: PERMISSION_NAMES[code] },
          }),
        ),
      );
      const permissions = await tx.permission.findMany({
        where: { code: { in: [...PERMISSIONS] } },
      });
      const permByCode = new Map(permissions.map((p) => [p.code, p.id]));

      // 2) Crear el tenant.
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          jurisdiction: dto.jurisdiction as unknown as Jurisdiction,
          currency: dto.currency as unknown as Currency,
          locale: dto.locale ?? (dto.jurisdiction === Jurisdiction.DO ? 'es-DO' : 'es-ES'),
        },
      });

      // 3) Crear los roles base del tenant con sus permisos.
      const roleIdByCode = new Map<Role, string>();
      for (const roleCode of [Role.FIRM_ADMIN, Role.LAWYER, Role.CLIENT]) {
        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            code: roleCode,
            name: ROLE_NAMES[roleCode],
            permissions: {
              create: ROLE_PERMISSIONS[roleCode]
                .map((code) => permByCode.get(code))
                .filter((id): id is string => Boolean(id))
                .map((permissionId) => ({ permissionId })),
            },
          },
        });
        roleIdByCode.set(roleCode, role.id);
      }

      // 4) Crear el usuario admin y asignarle FIRM_ADMIN.
      const adminRoleId = roleIdByCode.get(Role.FIRM_ADMIN)!;
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.admin.email.toLowerCase(),
          passwordHash,
          fullName: dto.admin.fullName,
          roles: { create: [{ roleId: adminRoleId }] },
        },
      });

      return { tenant, userId: user.id };
    });

    const userForToken = await this.tokens.loadUserForToken(result.userId);
    const tokens = await this.tokens.issuePair(userForToken);
    return { tenantId: result.tenant.id, tokens };
  }

  /** Login con email+password. tenantId solo es necesario si el email existe en varios tenants. */
  async login(dto: LoginDto): Promise<TokenPair> {
    const email = dto.email.toLowerCase();
    const candidates = await this.prisma.user.findMany({
      where: { email, ...(dto.tenantId ? { tenantId: dto.tenantId } : {}) },
    });

    if (candidates.length === 0) {
      // Mismo error que credenciales inválidas para no filtrar existencia de cuentas.
      throw new UnauthorizedException('Credenciales inválidas.');
    }
    if (candidates.length > 1) {
      throw new BadRequestException(
        'El email existe en varios despachos; indica el tenantId para iniciar sesión.',
      );
    }

    const user = candidates[0]!;
    if (!user.isActive) {
      throw new UnauthorizedException('Cuenta deshabilitada.');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const userForToken = await this.tokens.loadUserForToken(user.id);
    return this.tokens.issuePair(userForToken);
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<{ success: true }> {
    await this.tokens.revoke(refreshToken);
    return { success: true };
  }
}
