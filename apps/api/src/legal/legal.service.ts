import { BadRequestException, Injectable } from '@nestjs/common';
import { AcceptanceAct, AcceptanceMethod, LegalDocType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/** Una aceptación a registrar dentro de una llamada (un documento). */
export interface AcceptItem {
  documentId: string;
  method?: AcceptanceMethod;
  act?: AcceptanceAct;
  signerName?: string;
  signerRole?: string;
  evidenceDocId?: string;
}

/** Despacho / profesional autónomo = responsable del tratamiento → DPA. También es el fallback por defecto. */
const PROFESSIONAL_DOCS: LegalDocType[] = [
  LegalDocType.TERMS,
  LegalDocType.PRIVACY,
  LegalDocType.DPA,
];

/** Conjunto de documentos que una cuenta debe aceptar, según su perfil. */
const REQUIRED_BY_ACCOUNT: Record<string, LegalDocType[]> = {
  FIRM: PROFESSIONAL_DOCS,
  PROFESSIONAL: PROFESSIONAL_DOCS,
  // Consumidor = interesado (sin DPA) → ToS de consumidor + renuncia al desistimiento.
  CONSUMER: [LegalDocType.TERMS_CONSUMER, LegalDocType.PRIVACY, LegalDocType.WITHDRAWAL_WAIVER],
};

/**
 * Capa de aceptación legal (clickwrap reforzado, SIN proveedor de firma). Resuelve qué documentos vigentes
 * debe aceptar cada cuenta (según su `accountType`) y registra cada aceptación en `LegalAcceptance` con el
 * hash del texto exacto, IP, user-agent y un snapshot de lo mostrado — append-only por privilegios de columna.
 * La lista de subprocesadores es informativa (incorporada por referencia al DPA), no requiere aceptación.
 */
@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  private requiredTypes(accountType: string): LegalDocType[] {
    return REQUIRED_BY_ACCOUNT[accountType] ?? PROFESSIONAL_DOCS;
  }

  /** Documentos VIGENTES que esta cuenta debe aceptar (uno por tipo; prefiere el específico de jurisdicción). */
  async currentDocuments(user: RequestUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { accountType: true, jurisdiction: true },
    });
    if (!tenant) throw new BadRequestException(apiError('auth.invalidUser'));

    const types = this.requiredTypes(tenant.accountType);
    const docs = await this.prisma.legalDocument.findMany({
      where: {
        type: { in: types },
        isCurrent: true,
        OR: [{ jurisdiction: tenant.jurisdiction }, { jurisdiction: null }],
      },
      select: {
        id: true,
        type: true,
        jurisdiction: true,
        version: true,
        title: true,
        sourceRef: true,
        effectiveFrom: true,
      },
    });

    // Prefiere la versión específica de la jurisdicción del tenant sobre la genérica (jurisdiction null).
    const byType = new Map<LegalDocType, (typeof docs)[number]>();
    for (const d of docs) {
      const existing = byType.get(d.type);
      if (!existing || (d.jurisdiction !== null && existing.jurisdiction === null)) {
        byType.set(d.type, d);
      }
    }
    // Mantiene el orden de `types` (TERMS/PRIVACY/DPA…) para una UI predecible.
    return types.map((t) => byType.get(t)).filter((d): d is (typeof docs)[number] => Boolean(d));
  }

  /** Documentos vigentes que este usuario AÚN no ha aceptado (en su versión actual). */
  async pending(user: RequestUser) {
    const current = await this.currentDocuments(user);
    if (current.length === 0) return [];

    const accepted = await this.prisma.legalAcceptance.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.userId,
        documentType: { in: current.map((d) => d.type) },
      },
      select: { documentType: true, version: true },
    });
    const acceptedKeys = new Set(accepted.map((a) => `${a.documentType}@${a.version}`));
    return current.filter((d) => !acceptedKeys.has(`${d.type}@${d.version}`));
  }

  /**
   * Registra la aceptación de uno o varios documentos vigentes (clickwrap reforzado). Valida que cada
   * documento exista, esté vigente y pertenezca al conjunto requerido por el perfil de la cuenta.
   */
  async accept(
    user: RequestUser,
    items: AcceptItem[],
    ctx: { ip: string; userAgent: string; shownSnapshot?: Prisma.InputJsonValue },
  ) {
    if (!items.length) throw new BadRequestException(apiError('legal.nothingToAccept'));

    const current = await this.currentDocuments(user);
    const currentById = new Map(current.map((d) => [d.id, d]));

    // Todos los ids deben corresponder a un documento vigente y requerido para esta cuenta.
    for (const item of items) {
      if (!currentById.has(item.documentId)) {
        throw new BadRequestException(apiError('legal.invalidDocument'));
      }
    }

    // Necesitamos el hash del texto (prueba de QUÉ se aceptó); no viaja en `currentDocuments`.
    const hashes = await this.prisma.legalDocument.findMany({
      where: { id: { in: items.map((i) => i.documentId) } },
      select: { id: true, type: true, version: true, bodyHash: true },
    });
    const hashById = new Map(hashes.map((h) => [h.id, h]));

    const created = await this.prisma.$transaction(
      items.map((item) => {
        const doc = hashById.get(item.documentId)!;
        return this.prisma.legalAcceptance.create({
          data: {
            tenantId: user.tenantId,
            userId: user.userId,
            legalDocumentId: doc.id,
            documentType: doc.type,
            version: doc.version,
            documentHash: doc.bodyHash,
            method: item.method ?? AcceptanceMethod.CLICKWRAP,
            act: item.act ?? AcceptanceAct.ENROLLMENT,
            shownSnapshot: ctx.shownSnapshot,
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
            signerName: item.signerName,
            signerRole: item.signerRole,
            evidenceDocId: item.evidenceDocId,
          },
          select: { id: true, documentType: true, version: true, acceptedAt: true },
        });
      }),
    );

    return { accepted: created };
  }
}
