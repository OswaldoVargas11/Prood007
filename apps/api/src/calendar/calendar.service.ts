import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TaskStatus } from '@legalflow/domain';
import { SystemPrismaService } from '../prisma/prisma.service';

const OPEN = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];

/**
 * Feed de AGENDA en formato iCal (.ics) para SUSCRIBIRSE desde Google/Outlook/Apple Calendar. Es de
 * solo lectura (Lawzora → su calendario), la dirección que más valor aporta: que los plazos procesales
 * y tareas con vencimiento aparezcan en el calendario del despacho y nunca se pasen.
 *
 * El token es un userId FIRMADO con HMAC (sin columna en BD): la URL secreta hace de credencial, como
 * cualquier feed de calendario. La consulta usa el rol system (la ruta es pública, sin contexto de tenant).
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly config: ConfigService,
    private readonly system: SystemPrismaService,
  ) {}

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  /** Token de feed = `<userId>.<hmac>`. Estable por usuario; se invalida al rotar el secreto. */
  feedToken(userId: string): string {
    const sig = createHmac('sha256', this.secret()).update(userId).digest('base64url');
    return `${userId}.${sig}`;
  }

  private verify(token: string): string | null {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const userId = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', this.secret()).update(userId).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return userId;
  }

  /** Escapa texto para un campo iCal (RFC 5545). */
  private esc(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  private icsDate(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD (evento de día completo)
  }

  /** Devuelve el .ics del despacho del usuario dueño del token, o null si el token no es válido. */
  async feed(token: string): Promise<string | null> {
    const userId = this.verify(token);
    if (!userId) return null;
    const user = await this.system.user.findUnique({
      where: { id: userId },
      select: { tenantId: true, tenant: { select: { name: true } } },
    });
    if (!user) return null;

    // Solo las tareas ASIGNADAS a este letrado (su agenda personal), no todas las del despacho.
    const tasks = await this.system.task.findMany({
      where: {
        tenantId: user.tenantId,
        assigneeId: userId,
        status: { in: OPEN },
        dueDate: { not: null },
      },
      orderBy: { dueDate: 'asc' },
      include: { matter: { select: { reference: true, client: { select: { name: true } } } } },
    });

    const stamp = '20260101T000000Z'; // DTSTAMP fijo (determinista; no afecta a la suscripción)
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Lawzora//Agenda//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Agenda — ${this.esc(user.tenant.name)}`,
      `NAME:Agenda — ${this.esc(user.tenant.name)}`,
    ];
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const title = t.deadlineType || t.title;
      const ref = [t.matter?.reference, t.matter?.client?.name].filter(Boolean).join(' · ');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${t.id}@lawzora`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${this.icsDate(t.dueDate)}`,
        `SUMMARY:${this.esc((t.isProcedural ? '⚖ ' : '') + title)}`,
        ...(ref ? [`DESCRIPTION:${this.esc(ref)}`] : []),
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
}
