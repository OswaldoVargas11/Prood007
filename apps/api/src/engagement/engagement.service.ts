import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { AuditService } from '../audit/audit.service';
import { buildDocumentPdf } from '../documents/document-pdf';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';
import { SaveEngagementLetterDto } from './dto/save-engagement-letter.dto';

/**
 * Hoja de encargo: artefacto de intake de primera clase. Guarda alcance/honorarios/términos y genera un
 * PDF con la marca del despacho en el expediente (Document «Hoja de encargo»); la firma se gestiona con
 * el flujo de firmas existente sobre esa versión. Acotado al tenant por RLS.
 */
@Injectable()
export class EngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  async getByMatter(user: RequestUser, matterId: string) {
    const letter = await this.prisma.engagementLetter.findFirst({
      where: { matterId, tenantId: user.tenantId },
    });
    return letter ?? null;
  }

  private composeBody(scope: string, fees: string, terms: string, matterLabel: string): string {
    return [
      matterLabel,
      '1. Alcance del encargo',
      scope.trim(),
      '2. Honorarios',
      fees.trim(),
      '3. Términos y condiciones',
      terms.trim(),
      'En prueba de conformidad, las partes firman la presente hoja de encargo.',
      'Firma del cliente:\n\n_______________________________',
    ].join('\n\n');
  }

  /** Guarda los campos y (re)genera el PDF de la hoja de encargo como documento del expediente. */
  async save(user: RequestUser, dto: SaveEngagementLetterDto) {
    const matter = await this.prisma.matter.findFirst({
      where: { id: dto.matterId, tenantId: user.tenantId },
      select: { reference: true, title: true, client: { select: { name: true } } },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notInFirm'));

    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: { id: user.tenantId },
      select: { name: true, taxId: true },
    });

    const matterLabel = `${matter.reference} · ${matter.title} — ${matter.client.name}`;
    const pdf = await buildDocumentPdf({
      firmName: tenant.name,
      firmTaxId: tenant.taxId,
      title: 'Hoja de encargo',
      bodyText: this.composeBody(dto.scope, dto.fees, dto.terms, matterLabel),
      generatedAt: new Date(),
    });

    const { document } = await this.documents.upload(user, dto.matterId, 'Hoja de encargo', {
      originalname: 'hoja-de-encargo.pdf',
      mimetype: 'application/pdf',
      size: pdf.length,
      buffer: pdf,
    });

    const letter = await this.prisma.engagementLetter.upsert({
      where: { matterId: dto.matterId },
      create: {
        tenantId: user.tenantId,
        matterId: dto.matterId,
        scope: dto.scope.trim(),
        fees: dto.fees.trim(),
        terms: dto.terms.trim(),
        documentId: document.id,
        status: 'GENERATED',
      },
      update: {
        scope: dto.scope.trim(),
        fees: dto.fees.trim(),
        terms: dto.terms.trim(),
        documentId: document.id,
        status: 'GENERATED',
      },
    });

    await this.audit.log(user, 'engagement.generated', 'EngagementLetter', letter.id, {
      matterId: dto.matterId,
      documentId: document.id,
    });
    return letter;
  }
}
