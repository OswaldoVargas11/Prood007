import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { STORAGE_PROVIDER, type StorageProvider } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { extractText, isExtractableMime } from '../documents/text-extract';
import { locateQuote } from './ai-tabular.service';
import type { CitationKind } from './ai-citations';
import type { RequestUser } from '../auth/auth.types';

/** Radio de contexto alrededor de la cita que se devuelve para resaltarla en el panel (igual que tabular). */
const CONTEXT_RADIUS = 400;

/** Fuente resuelta que la UI muestra al pinchar una cita [n]. Forma discriminada por `kind`. */
export type ResolvedCitation =
  | {
      kind: 'document';
      id: string;
      label: string;
      matter: string | null;
      /** Fragmento localizado (texto EXACTO de la cita); null si no se pudo localizar/extraer. */
      snippet: string | null;
      /** Ventana de contexto con la cita dentro (para resaltar); null si no localizable. */
      context: string | null;
      /** Offsets del resaltado DENTRO de `context`. */
      highlight: { start: number; end: number } | null;
    }
  | {
      kind: 'matter';
      reference: string;
      label: string;
      title: string;
      status: string;
      type: string;
      opposingParty: string | null;
      court: string | null;
      caseNumber: string | null;
      proceduralPhase: string | null;
      client: string | null;
      lawyer: string | null;
    }
  | { kind: 'client'; label: string; name: string; taxId: string | null; matterCount: number };

/**
 * Resuelve una CITA del agente a su fuente, SIEMPRE con los permisos del usuario: nunca devuelve nada que
 * su rol/tenant no pueda ver. Documentos: pasa por `DocumentsService.getOne` (tenant-scoped; 404 si no le
 * pertenece) y localiza el fragmento en el texto real (reutiliza `locateQuote`, la misma verificación
 * anti-alucinación de la revisión tabular). Expedientes/clientes: consulta acotada por `tenantId`.
 */
@Injectable()
export class AiCitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async resolve(
    user: RequestUser,
    kind: CitationKind,
    refId: string,
    quote?: string,
  ): Promise<ResolvedCitation> {
    if (!refId?.trim()) throw new NotFoundException('Cita sin referencia.');
    if (kind === 'document') return this.resolveDocument(user, refId, quote);
    if (kind === 'matter') return this.resolveMatter(user, refId);
    if (kind === 'client') return this.resolveClient(user, refId);
    throw new NotFoundException('Tipo de cita no soportado.');
  }

  private async resolveDocument(
    user: RequestUser,
    id: string,
    quote?: string,
  ): Promise<ResolvedCitation> {
    // Control de acceso: getOne está acotado por tenant y lanza 404 si el documento no le pertenece.
    const doc = await this.documents.getOne(user, id);
    const matter = doc.matterId
      ? await this.prisma.matter.findFirst({
          where: { id: doc.matterId, tenantId: user.tenantId },
          select: { reference: true },
        })
      : null;

    let snippet: string | null = null;
    let context: string | null = null;
    let highlight: { start: number; end: number } | null = null;

    const version = doc.versions[0];
    if (version && quote?.trim() && isExtractableMime(version.mimeType)) {
      try {
        const buffer = await this.storage.get(version.storageKey);
        const extracted = await extractText(version.mimeType, buffer);
        if (extracted.extractable && extracted.text.trim().length > 0) {
          const span = locateQuote(extracted.text, quote);
          if (span) {
            const from = Math.max(0, span.start - CONTEXT_RADIUS);
            const to = Math.min(extracted.text.length, span.end + CONTEXT_RADIUS);
            snippet = extracted.text.slice(span.start, span.end);
            context = extracted.text.slice(from, to);
            highlight = { start: span.start - from, end: span.end - from };
          }
        }
      } catch {
        // Sin texto extraíble o fallo de almacenamiento: se devuelve la ficha del documento sin fragmento.
      }
    }

    return {
      kind: 'document',
      id: doc.id,
      label: doc.name,
      matter: matter?.reference ?? null,
      snippet,
      context,
      highlight,
    };
  }

  private async resolveMatter(user: RequestUser, reference: string): Promise<ResolvedCitation> {
    const matter = await this.prisma.matter.findFirst({
      where: { tenantId: user.tenantId, reference },
      select: {
        reference: true,
        title: true,
        type: true,
        status: true,
        opposingParty: true,
        court: true,
        caseNumber: true,
        proceduralPhase: true,
        client: { select: { name: true } },
        lawyer: { select: { fullName: true } },
      },
    });
    if (!matter) throw new NotFoundException('Expediente no encontrado.');
    return {
      kind: 'matter',
      reference: matter.reference,
      label: `${matter.reference} — ${matter.title}`,
      title: matter.title,
      status: matter.status,
      type: matter.type,
      opposingParty: matter.opposingParty ?? null,
      court: matter.court ?? null,
      caseNumber: matter.caseNumber ?? null,
      proceduralPhase: matter.proceduralPhase ?? null,
      client: matter.client?.name ?? null,
      lawyer: matter.lawyer?.fullName ?? null,
    };
  }

  private async resolveClient(user: RequestUser, refId: string): Promise<ResolvedCitation> {
    const client = await this.prisma.client.findFirst({
      where: { tenantId: user.tenantId, OR: [{ taxId: refId }, { name: refId }] },
      select: { id: true, name: true, taxId: true },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    const matterCount = await this.prisma.matter.count({
      where: { tenantId: user.tenantId, clientId: client.id },
    });
    return {
      kind: 'client',
      label: client.name,
      name: client.name,
      taxId: client.taxId ?? null,
      matterCount,
    };
  }
}
