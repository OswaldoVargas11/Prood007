import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MAIL_PROVIDER, type MailProvider, chatDigestMessage } from '../auth/mail/mail.provider';
import {
  chatDigestLines,
  chatDigestSubject,
  decideChatDigest,
  type UnreadItem,
} from './chat-digest.logic';

const STAFF_GENERAL_LABEL = 'General';
/** Tope de mensajes leídos por conversación al construir el resumen (acota el coste; el recuento basta). */
const MAX_UNREAD_PER_CONVERSATION = 200;
/** Tope de expedientes con chat que se inspeccionan por usuario (los más recientes primero). */
const MAX_MATTERS_PER_USER = 100;

/** Resumen de una corrida del resumen de chat sobre un tenant. */
export interface ChatDigestRunSummary {
  evaluated: number;
  sent: number;
  skipped: number;
}

interface ConvMeta {
  kind: 'DIRECT' | 'CHANNEL';
  title: string | null;
  memberIds: string[];
}

/**
 * Resumen por correo de mensajes de chat SIN LEER (NEXT 1.1): abarca el chat interno del staff (DM/canal)
 * Y el chat por expediente (`MatterReadState`). Complementa el aviso in-app (badge del dock) para enterarse
 * fuera de la app. DOBLE gate: feature global `CHAT_DIGEST_ENABLED` (lo comprueba
 * el cron) + preferencia OPT-IN por usuario (`chatDigestEmailEnabled`, default false). El envío es fail-soft
 * y usa el `MailProvider` activo (Brevo/SMTP en prod, Noop en dev/CI → no-op). La lógica de "a quién y
 * cuándo" vive en `chat-digest.logic` (pura, testeada): ventana de silencio + dedupe + intervalo mínimo.
 */
@Injectable()
export class ChatDigestService {
  private readonly logger = new Logger(ChatDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /** ¿Está encendida la feature global? Default OFF: el resumen queda oscuro hasta que el owner la active. */
  isEnabled(): boolean {
    return this.config.get<string>('CHAT_DIGEST_ENABLED') === 'true';
  }

  private appBase(): string {
    return this.config.get<string>('APP_PUBLIC_URL') ?? 'https://lawzora.com';
  }

  /**
   * Evalúa un tenant: para cada usuario que activó el resumen, decide si mandarlo y lo envía. El llamador
   * (cron) envuelve en `runWithTenant(tenantId)` para que la RLS acote; además se filtra por `tenantId`.
   */
  async evaluateTenant(tenantId: string, now: Date = new Date()): Promise<ChatDigestRunSummary> {
    const summary: ChatDigestRunSummary = { evaluated: 0, sent: 0, skipped: 0 };

    const recipients = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, chatDigestEmailEnabled: true },
      select: { id: true, email: true, fullName: true, lastChatDigestAt: true },
    });
    const optedIn = recipients.filter((u) => u.email?.trim());
    summary.evaluated = optedIn.length;
    if (optedIn.length === 0) return summary;

    // Metadatos de conversación del tenant (para etiquetar) y nombres para resolver el interlocutor del DM.
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId },
      select: { id: true, kind: true, title: true, members: { select: { userId: true } } },
    });
    const convById = new Map<string, ConvMeta>(
      conversations.map((c) => [
        c.id,
        { kind: c.kind, title: c.title, memberIds: c.members.map((m) => m.userId) },
      ]),
    );
    const nameById = new Map(
      (
        await this.prisma.user.findMany({
          where: { tenantId },
          select: { id: true, fullName: true },
        })
      ).map((u) => [u.id, u.fullName]),
    );

    for (const user of optedIn) {
      try {
        const unread = await this.collectUnread(tenantId, user.id, convById, nameById);
        const decision = decideChatDigest({ unread, lastDigestAt: user.lastChatDigestAt, now });
        if (!decision.send) {
          summary.skipped++;
          continue;
        }
        try {
          await this.mail.sendMail(
            chatDigestMessage(user.email, {
              fullName: user.fullName,
              subject: chatDigestSubject(decision.totalCount),
              totalCount: decision.totalCount,
              lines: chatDigestLines(decision.conversations),
              link: `${this.appBase()}/es/messages`,
            }),
          );
        } catch (err) {
          this.logger.error('Fallo al enviar el resumen de chat por correo', err as Error);
        }
        // Sella la marca aunque el correo fuera fail-soft: evita reintentos en bucle sobre el mismo lote.
        await this.prisma.user.updateMany({
          where: { id: user.id, tenantId },
          data: { lastChatDigestAt: now },
        });
        summary.sent++;
      } catch (err) {
        this.logger.error(`Fallo al evaluar el resumen de chat del usuario ${user.id}`, err as Error);
        summary.skipped++;
      }
    }
    return summary;
  }

  /** No leídos del usuario en todas sus conversaciones (posteriores a su última lectura), ya etiquetados. */
  private async collectUnread(
    tenantId: string,
    userId: string,
    convById: Map<string, ConvMeta>,
    nameById: Map<string, string>,
  ): Promise<UnreadItem[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { tenantId, userId },
      select: { conversationId: true, lastReadAt: true },
    });

    const items: UnreadItem[] = [];
    for (const m of memberships) {
      const rows = await this.prisma.chatMessage.findMany({
        where: {
          tenantId,
          conversationId: m.conversationId,
          authorId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_UNREAD_PER_CONVERSATION,
        select: { conversationId: true, createdAt: true },
      });
      if (rows.length === 0) continue;
      const label = this.labelFor(m.conversationId, userId, convById, nameById);
      for (const r of rows) {
        items.push({ conversationId: r.conversationId, label, createdAt: r.createdAt });
      }
    }

    // Chat POR EXPEDIENTE (MatterReadState): expedientes donde el usuario participa (equipo asignado o
    // cliente titular). Mismo contrato de no-leído: mensajes de otro autor posteriores a su última lectura.
    await this.collectMatterUnread(tenantId, userId, items);

    return items;
  }

  /** Añade a `items` los no-leídos del chat por expediente del usuario, etiquetados por referencia. */
  private async collectMatterUnread(
    tenantId: string,
    userId: string,
    items: UnreadItem[],
  ): Promise<void> {
    const matters = await this.prisma.matter.findMany({
      where: {
        tenantId,
        // Acceso al chat del expediente: líder, colaborador asignado o cliente titular (ver MessagesService).
        OR: [
          { lawyerId: userId },
          { assignments: { some: { userId } } },
          { client: { userId } },
        ],
        messages: { some: { authorId: { not: userId } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_MATTERS_PER_USER,
      select: { id: true, reference: true, title: true },
    });
    if (matters.length === 0) return;

    const reads = await this.prisma.matterReadState.findMany({
      where: { tenantId, userId, matterId: { in: matters.map((m) => m.id) } },
      select: { matterId: true, lastReadAt: true },
    });
    const lastReadByMatter = new Map(reads.map((r) => [r.matterId, r.lastReadAt]));

    for (const m of matters) {
      const lastRead = lastReadByMatter.get(m.id) ?? null;
      const rows = await this.prisma.message.findMany({
        where: {
          tenantId,
          matterId: m.id,
          authorId: { not: userId },
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_UNREAD_PER_CONVERSATION,
        select: { createdAt: true },
      });
      if (rows.length === 0) continue;
      const ref = m.reference.trim() || m.title.trim() || 'sin referencia';
      const label = `Expediente ${ref}`;
      // Prefijo `matter:` para que el id no colisione con el de una conversación interna al agrupar.
      for (const r of rows) {
        items.push({ conversationId: `matter:${m.id}`, label, createdAt: r.createdAt });
      }
    }
  }

  /** Etiqueta de la conversación para el usuario: «General» (canal) o el nombre del interlocutor (DM). */
  private labelFor(
    conversationId: string,
    viewerId: string,
    convById: Map<string, ConvMeta>,
    nameById: Map<string, string>,
  ): string {
    const meta = convById.get(conversationId);
    if (!meta) return STAFF_GENERAL_LABEL;
    if (meta.kind === 'CHANNEL') return meta.title?.trim() || STAFF_GENERAL_LABEL;
    const peerId = meta.memberIds.find((id) => id !== viewerId);
    return (peerId && nameById.get(peerId)) || '—';
  }
}
