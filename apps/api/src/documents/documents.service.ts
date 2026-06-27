import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentReviewStatus, Role, STORAGE_PROVIDER } from '@legalflow/domain';
import type { StorageProvider } from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-context';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CloudFilesService, type CloudFileRef } from '../integrations/cloud-files.service';
import { AiSearchService } from '../ai/ai-search.service';
import { apiError } from '../common/api-messages';
import { assertUploadSafe } from '../common/safe-download';
import { renderTemplate, type TemplateContext } from '../templates/render';
import { buildDocumentPdf } from './document-pdf';
import { extractText } from './text-extract';
import { computeRedline } from './document-redline';
import type { RequestUser } from '../auth/auth.types';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Límite de tamaño (mismo que el upload por Multer): 25 MB. */
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** Convierte un nombre en un slug seguro para el nombre de archivo. */
function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || 'documento'
  );
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly cloudFiles: CloudFilesService,
    private readonly aiSearch: AiSearchService,
  ) {}

  /**
   * Crea un documento (versión 1) en un expediente SIN contexto de usuario (p. ej. adjuntos de un correo
   * archivado por BCC). Usa el cliente del sistema (BYPASSRLS) con tenantId explícito y el mismo pipeline
   * de almacenamiento cifrado. `uploaderId` debe ser un usuario válido del despacho (el letrado del expediente).
   */
  async createSystemDocument(
    tenantId: string,
    matterId: string,
    uploaderId: string,
    file: UploadedFile,
  ) {
    // Los adjuntos de correo entrante son input NO confiable (un tercero/contraparte CC'd en la dirección
    // BCC del expediente). Misma allowlist (mime+ext+sniff) que el resto de subidas: veta HTML/SVG/JS (D7-001).
    assertUploadSafe(file.mimetype, file.originalname, file.buffer);
    const document = await this.system.document.create({
      data: { tenantId, matterId, name: file.originalname.slice(0, 200) || 'Adjunto' },
    });
    const key = this.storageKey(tenantId, document.id, 1);
    await this.storage.put(key, file.buffer, file.mimetype);
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    await this.system.documentVersion.create({
      data: {
        tenantId,
        documentId: document.id,
        version: 1,
        storageKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        contentHash,
        reviewStatus: DocumentReviewStatus.PENDING,
        uploadedById: uploaderId,
      },
    });
    return document;
  }

  private async assertMatterInTenant(user: RequestUser, matterId: string): Promise<void> {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
  }

  /**
   * Valida que una carpeta (si se indica) pertenece al tenant, es de documentos y es del MISMO
   * expediente. Devuelve la carpeta normalizada (null = raíz).
   */
  private async resolveDocumentFolder(
    user: RequestUser,
    matterId: string,
    folderId: string | null | undefined,
  ): Promise<string | null> {
    if (!folderId) return null;
    const folder = await this.prisma.folder.findFirst({
      where: { id: folderId, tenantId: user.tenantId, kind: 'DOCUMENT', matterId },
      select: { id: true },
    });
    if (!folder) throw new BadRequestException(apiError('folders.parentMismatch'));
    return folder.id;
  }

  private storageKey(tenantId: string, documentId: string, version: number): string {
    return `${tenantId}/documents/${documentId}/v${version}`;
  }

  private async persistVersion(
    user: RequestUser,
    documentId: string,
    version: number,
    file: UploadedFile,
  ) {
    // Red transversal anti-XSS-almacenado: rechaza contenido activo (HTML/SVG/JS) en CUALQUIER subida que
    // pase por aquí (documentos, versiones, import de nube, portal del cliente). Ver assertUploadSafe.
    assertUploadSafe(file.mimetype, file.originalname, file.buffer);
    const key = this.storageKey(user.tenantId, documentId, version);
    await this.storage.put(key, file.buffer, file.mimetype);
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const created = await this.prisma.documentVersion.create({
      data: {
        tenantId: user.tenantId,
        documentId,
        version,
        storageKey: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        contentHash,
        reviewStatus: DocumentReviewStatus.PENDING,
        uploadedById: user.userId,
      },
    });
    // Indexado semántico del CONTENIDO del documento (búsqueda «¿dónde dice X?»). Best-effort y
    // fire-and-forget: no bloquea la subida y es no-op sin clave de embeddings o si no es extraíble.
    void this.aiSearch
      .indexDocumentVersionContent(user.tenantId, documentId, file.mimetype, file.buffer)
      .catch(() => undefined);
    return created;
  }

  /** Sube un documento nuevo (crea el Document + versión 1), opcionalmente dentro de una carpeta. */
  async upload(
    user: RequestUser,
    matterId: string,
    name: string | undefined,
    file?: UploadedFile,
    folderId?: string | null,
  ) {
    if (!file) throw new BadRequestException(apiError('documents.fileMissing'));
    await this.assertMatterInTenant(user, matterId);
    const resolvedFolderId = await this.resolveDocumentFolder(user, matterId, folderId);

    const document = await this.prisma.document.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        folderId: resolvedFolderId,
        name: name?.trim() || file.originalname,
      },
    });
    const version = await this.persistVersion(user, document.id, 1, file);
    await this.audit.log(user, 'document.uploaded', 'Document', document.id, { version: 1 });
    return { document, version };
  }

  /**
   * Importa un fichero desde un almacenamiento en la nube (Google Drive / OneDrive / SharePoint) al
   * expediente. El usuario elige el fichero en el selector del proveedor; el SERVIDOR descarga los bytes
   * (cadena de custodia) y los guarda como un Document + versión 1 pasando por el MISMO pipeline cifrado
   * que una subida normal (cifrado, hash SHA-256, versionado, revisión, auditoría).
   */
  async importFromCloud(
    user: RequestUser,
    input: {
      matterId: string;
      provider: string;
      name?: string;
    } & CloudFileRef,
  ) {
    await this.assertMatterInTenant(user, input.matterId);
    const { provider, matterId, name, ...ref } = input;
    const fetched = await this.cloudFiles.fetch(user, provider, ref);
    if (fetched.sizeBytes > MAX_IMPORT_BYTES) {
      throw new BadRequestException(apiError('documents.cloudTooLarge'));
    }
    const file: UploadedFile = {
      originalname: fetched.filename,
      mimetype: fetched.mimeType,
      size: fetched.sizeBytes,
      buffer: fetched.buffer,
    };
    const document = await this.prisma.document.create({
      data: { tenantId: user.tenantId, matterId, name: name?.trim() || fetched.filename },
    });
    const version = await this.persistVersion(user, document.id, 1, file);
    await this.audit.log(user, 'document.imported_from_cloud', 'Document', document.id, {
      version: 1,
      provider,
    });
    return { document, version };
  }

  /**
   * Genera un documento en el expediente a partir de una plantilla del despacho, sustituyendo los
   * marcadores {{campo}} con datos del cliente/expediente/despacho. El resultado se guarda como un
   * Document + versión 1 (HTML), pasando por el mismo pipeline cifrado que una subida normal.
   */
  async generateFromTemplate(
    user: RequestUser,
    input: { templateId: string; matterId: string; name?: string },
  ) {
    await this.assertMatterInTenant(user, input.matterId);

    const template = await this.prisma.documentTemplate.findFirst({
      where: { id: input.templateId, tenantId: user.tenantId },
    });
    if (!template) throw new NotFoundException(apiError('templates.notFound'));

    const matter = await this.prisma.matter.findFirst({
      where: { id: input.matterId, tenantId: user.tenantId },
      include: {
        client: { select: { name: true, taxId: true, email: true, address: true } },
        lawyer: { select: { fullName: true } },
      },
    });
    if (!matter) throw new BadRequestException(apiError('matters.notInFirm'));
    const tenant = await this.prisma.tenant.findFirst({ where: { id: user.tenantId } });

    const context: TemplateContext = {
      'cliente.nombre': matter.client.name,
      'cliente.nif': matter.client.taxId,
      'cliente.email': matter.client.email ?? '',
      'cliente.direccion': matter.client.address ?? '',
      'expediente.referencia': matter.reference,
      'expediente.titulo': matter.title,
      'expediente.tipo': matter.type,
      'expediente.abogado': matter.lawyer?.fullName ?? '',
      'despacho.nombre': tenant?.name ?? '',
      'despacho.nif': tenant?.taxId ?? '',
      fecha: new Date().toLocaleDateString('es-ES'),
      'fecha.larga': new Date().toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };

    const rendered = renderTemplate(template.body, context);
    const title = input.name?.trim() || template.name;
    // PDF con membrete del despacho (estética consistente con las facturas), no un HTML pelado.
    const pdf = await buildDocumentPdf({
      firmName: tenant?.name ?? 'Despacho',
      firmTaxId: tenant?.taxId ?? null,
      title,
      bodyText: rendered,
      generatedAt: new Date(),
    });
    const file: UploadedFile = {
      originalname: `${slugify(title)}.pdf`,
      mimetype: 'application/pdf',
      size: pdf.length,
      buffer: pdf,
    };

    const document = await this.prisma.document.create({
      data: {
        tenantId: user.tenantId,
        matterId: input.matterId,
        name: input.name?.trim() || template.name,
      },
    });
    const version = await this.persistVersion(user, document.id, 1, file);
    await this.audit.log(user, 'document.generated_from_template', 'Document', document.id, {
      templateId: template.id,
    });
    return { document, version };
  }

  /**
   * Ensamblado documental: genera de una pasada un paquete de documentos en el expediente, uno por cada
   * plantilla indicada (p. ej. el set de intake del despacho). Reutiliza generateFromTemplate por plantilla.
   */
  async generateFromTemplates(user: RequestUser, matterId: string, templateIds: string[]) {
    await this.assertMatterInTenant(user, matterId);
    const unique = [...new Set(templateIds)];
    const documents = [];
    for (const templateId of unique) {
      const { document } = await this.generateFromTemplate(user, { templateId, matterId });
      documents.push({ id: document.id, name: document.name });
    }
    return { count: documents.length, documents };
  }

  /** Tope de tamaño del cuerpo redactado por la IA (defensa anti-abuso; un escrito no es un libro). */
  private static readonly MAX_DRAFT_CHARS = 100_000;

  /**
   * Guarda un BORRADOR redactado por el asistente de IA como un Document + versión 1 en el expediente:
   * el cuerpo (texto) se renderiza a un PDF con el membrete del despacho y pasa por el MISMO pipeline
   * cifrado que una subida normal (almacenamiento, hash SHA-256, versionado, revisión PENDING, indexado).
   * No es fiscal y es reversible. El contenido lo redacta el modelo; aquí solo se persiste.
   */
  async saveAiDraft(
    user: RequestUser,
    input: { matterId: string; title: string; bodyText: string },
  ) {
    await this.assertMatterInTenant(user, input.matterId);
    const tenant = await this.prisma.tenant.findFirst({ where: { id: user.tenantId } });
    const title = input.title.trim().slice(0, 200) || 'Borrador';
    const bodyText = input.bodyText.slice(0, DocumentsService.MAX_DRAFT_CHARS);
    const pdf = await buildDocumentPdf({
      firmName: tenant?.name ?? 'Despacho',
      firmTaxId: tenant?.taxId ?? null,
      title,
      bodyText,
      generatedAt: new Date(),
    });
    const file: UploadedFile = {
      originalname: `${slugify(title)}.pdf`,
      mimetype: 'application/pdf',
      size: pdf.length,
      buffer: pdf,
    };
    const document = await this.prisma.document.create({
      data: { tenantId: user.tenantId, matterId: input.matterId, name: title },
    });
    const version = await this.persistVersion(user, document.id, 1, file);
    await this.audit.log(user, 'document.ai_drafted', 'Document', document.id, { title });
    return { document, version };
  }

  /** Añade una nueva versión a un documento existente. */
  async addVersion(user: RequestUser, documentId: string, file?: UploadedFile) {
    if (!file) throw new BadRequestException(apiError('documents.fileMissing'));
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!document) throw new NotFoundException(apiError('documents.notFound'));

    const last = await this.prisma.documentVersion.findFirst({
      where: { documentId, tenantId: user.tenantId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const next = (last?.version ?? 0) + 1;
    const version = await this.persistVersion(user, documentId, next, file);
    await this.audit.log(user, 'document.version_added', 'Document', documentId, { version: next });
    return version;
  }

  /** Mueve un documento a otra carpeta del mismo expediente (o a la raíz con `null`). */
  async move(user: RequestUser, documentId: string, folderId: string | null) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId: user.tenantId },
      select: { id: true, matterId: true },
    });
    if (!document) throw new NotFoundException(apiError('documents.notFound'));
    const resolved = await this.resolveDocumentFolder(user, document.matterId, folderId);
    await this.prisma.document.updateMany({
      where: { id: documentId, tenantId: user.tenantId },
      data: { folderId: resolved },
    });
    await this.audit.log(user, 'document.moved', 'Document', documentId, { folderId: resolved });
    return { success: true as const, folderId: resolved };
  }

  async listByMatter(user: RequestUser, matterId: string) {
    await this.assertMatterInTenant(user, matterId);
    return this.prisma.document.findMany({
      where: { tenantId: user.tenantId, matterId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            reviewStatus: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            uploadedBy: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: RequestUser, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { reviews: true, uploadedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!document) throw new NotFoundException(apiError('documents.notFound'));
    return document;
  }

  /** Devuelve el contenido binario de una versión (tras verificar pertenencia al tenant). */
  async download(user: RequestUser, versionId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, tenantId: user.tenantId },
      include: { document: { select: { name: true } } },
    });
    if (!version) throw new NotFoundException(apiError('documents.versionNotFound'));
    const buffer = await this.storage.get(version.storageKey);
    // Acceso a PII legal: deja traza de QUIÉN descarga QUÉ (D10-003). Sin esto, la exfiltración por un
    // usuario interno no genera ningún evento auditable (contraste con el data-room externo, que sí lo hace).
    await this.audit.log(user, 'document.downloaded', 'DocumentVersion', version.id, {
      documentId: version.documentId,
      version: version.version,
      sizeBytes: version.sizeBytes,
    });
    return { version, buffer };
  }

  /**
   * Compara dos versiones de un MISMO documento (redline a nivel de palabra). Extrae el texto de cada
   * versión (.docx/texto), calcula el diff y devuelve segmentos estructurados (igual/añadido/eliminado)
   * más el recuento de palabras añadidas/eliminadas. Verifica que ambas versiones son del documento y
   * del tenant del usuario.
   */
  async compare(
    user: RequestUser,
    documentId: string,
    baseVersionId: string,
    againstVersionId: string,
  ) {
    if (baseVersionId === againstVersionId) {
      throw new BadRequestException(apiError('documents.compareSameVersion'));
    }
    const versions = await this.prisma.documentVersion.findMany({
      where: {
        id: { in: [baseVersionId, againstVersionId] },
        documentId,
        tenantId: user.tenantId,
      },
      select: { id: true, version: true, storageKey: true, mimeType: true },
    });
    const base = versions.find((v) => v.id === baseVersionId);
    const against = versions.find((v) => v.id === againstVersionId);
    if (!base || !against) throw new NotFoundException(apiError('documents.versionNotFound'));

    const [baseBytes, againstBytes] = await Promise.all([
      this.storage.get(base.storageKey),
      this.storage.get(against.storageKey),
    ]);
    const [baseText, againstText] = await Promise.all([
      extractText(base.mimeType, baseBytes),
      extractText(against.mimeType, againstBytes),
    ]);

    if (!baseText.extractable || !againstText.extractable) {
      return {
        baseVersion: base.version,
        againstVersion: against.version,
        extractable: false,
        segments: [],
        added: 0,
        removed: 0,
      };
    }

    const redline = computeRedline(baseText.text, againstText.text);
    return {
      baseVersion: base.version,
      againstVersion: against.version,
      extractable: true,
      segments: redline.segments,
      added: redline.added,
      removed: redline.removed,
    };
  }

  /** Revisa una versión (aprobar/rechazar/requiere cambios/en revisión). Solo abogados/admin. */
  async review(
    user: RequestUser,
    versionId: string,
    status: DocumentReviewStatus,
    comment?: string,
  ) {
    if (status === DocumentReviewStatus.PENDING) {
      throw new BadRequestException(apiError('documents.invalidReviewStatus'));
    }
    if (!user.roles.includes(Role.LAWYER) && !user.roles.includes(Role.FIRM_ADMIN)) {
      throw new ForbiddenException(apiError('documents.reviewForbidden'));
    }
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, tenantId: user.tenantId },
      include: { document: { select: { id: true, name: true, matterId: true } } },
    });
    if (!version) throw new NotFoundException(apiError('documents.versionNotFound'));

    await tenantTransaction(this.prisma, async (tx) => {
      await tx.documentVersion.updateMany({
        where: { id: versionId, tenantId: user.tenantId },
        data: { reviewStatus: status },
      });
      await tx.documentReview.create({
        data: { tenantId: user.tenantId, versionId, reviewerId: user.userId, status, comment },
      });
    });

    // Notifica al autor de la versión (si no es el propio revisor).
    if (version.uploadedById !== user.userId) {
      await this.notifications.create({
        tenantId: user.tenantId,
        userId: version.uploadedById,
        type: 'document.review',
        title: `Documento "${version.document.name}" — ${status}`,
        body: comment,
        data: { documentId: version.document.id, versionId, status },
      });
    }
    await this.audit.log(user, 'document.reviewed', 'DocumentVersion', versionId, { status });
    return this.getOne(user, version.document.id);
  }
}
