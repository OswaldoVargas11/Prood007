import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import {
  inboundEmailEnabled,
  matterBccAddress,
  parseMatterAddress,
  verifyMatterToken,
} from './inbound-email.config';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB por adjunto

// postal-mime es ESM; la API compila a CommonJS sobre Node 20 (donde `require()` de ESM falla). Se carga
// con import() dinámico envuelto en Function para que TypeScript no lo transpile a require.
type PostalMimeModule = typeof import('postal-mime');
const importPostalMime = new Function(
  'return import("postal-mime")',
) as () => Promise<PostalMimeModule>;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Email-por-BCC al expediente: el webhook recibe el MIME crudo, resuelve el expediente por la
 * dirección+token y archiva el correo como MatterEmail entrante con el CUERPO COMPLETO, subiendo cada
 * ADJUNTO como documento cifrado del expediente. Sin contexto de usuario: inserta con el cliente del
 * sistema (BYPASSRLS) bajo el tenant del expediente; los adjuntos se atribuyen a su letrado.
 */
@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger(InboundEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly documents: DocumentsService,
  ) {}

  async ingest(raw: Buffer, envelopeTo: string, envelopeFrom: string) {
    const parsed = parseMatterAddress(envelopeTo);
    if (!parsed || !verifyMatterToken(parsed.matterId, parsed.token)) {
      throw new ForbiddenException('invalid recipient token');
    }
    const matter = await this.system.matter.findUnique({
      where: { id: parsed.matterId },
      select: { id: true, tenantId: true, lawyerId: true },
    });
    if (!matter) throw new NotFoundException('matter not found');

    const { default: PostalMime } = await importPostalMime();
    const email = await PostalMime.parse(raw);
    const subject = (email.subject ?? '').slice(0, 500) || null;
    const body = (email.text?.trim() || stripHtml(email.html ?? '')).trim();
    const from = (envelopeFrom || email.from?.address || '—').slice(0, 320);
    const sentAt = email.date ? new Date(email.date) : new Date();

    await this.system.matterEmail.create({
      data: {
        tenantId: matter.tenantId,
        matterId: matter.id,
        direction: 'IN',
        fromAddr: from,
        toAddr: envelopeTo.slice(0, 320),
        subject,
        snippet: body.slice(0, 300) || null,
        body: body || null,
        sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
      },
    });

    // Adjuntos → documentos cifrados del expediente (atribuidos al letrado o, en su defecto, a un usuario del despacho).
    let attached = 0;
    const attachments = email.attachments ?? [];
    if (attachments.length) {
      const uploaderId = await this.resolveUploader(matter.tenantId, matter.lawyerId);
      if (uploaderId) {
        for (const att of attachments) {
          if (att.disposition === 'inline' && !att.filename) continue; // imágenes embebidas
          const buffer =
            typeof att.content === 'string'
              ? Buffer.from(att.content)
              : Buffer.from(att.content as ArrayBuffer);
          if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) continue;
          try {
            await this.documents.createSystemDocument(matter.tenantId, matter.id, uploaderId, {
              originalname: att.filename || 'adjunto',
              mimetype: att.mimeType || 'application/octet-stream',
              size: buffer.length,
              buffer,
            });
            attached += 1;
          } catch (err) {
            this.logger.warn(`No se pudo archivar un adjunto: ${(err as Error).message}`);
          }
        }
      }
    }
    return { archived: true, attachments: attached };
  }

  /** Usuario al que atribuir los adjuntos: el letrado del expediente o cualquier usuario activo del despacho. */
  private async resolveUploader(tenantId: string, lawyerId: string | null): Promise<string | null> {
    if (lawyerId) return lawyerId;
    const user = await this.system.user.findFirst({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /** Dirección BCC del expediente (para mostrarla en la UI). Solo si el conector está activo. */
  async addressFor(user: RequestUser, matterId: string) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notFound'));
    const enabled = inboundEmailEnabled();
    return { enabled, address: enabled ? matterBccAddress(matterId) : null };
  }
}
