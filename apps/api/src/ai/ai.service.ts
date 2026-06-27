import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AI_ASSISTANT_PROVIDER,
  AI_EMBEDDINGS,
  AI_ENGINE,
  STORAGE_PROVIDER,
  type AiAssistantProvider,
  type AiEngine,
  type AiResult,
  type AiSource,
  type EmbeddingsProvider,
  type StorageProvider,
} from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { AiQuotaService } from './ai-quota.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { apiError } from '../common/api-messages';
import type { RequestUser } from '../auth/auth.types';

/** Respuesta de IA enriquecida con el modelo que la produjo (trazabilidad). */
export interface AiResponse extends AiResult {
  model: string | null;
}

const LOCALE = 'es';
/** Adjuntos por encima de este tamaño no se mandan al modelo (coste/latencia). */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Resumen del día del dashboard: conciso, accionable y SIN inventar (solo datos dados). */
const DAILY_BRIEF_SYSTEM =
  'Eres el asistente de un despacho de abogados. A partir de los DATOS del panel (KPIs y próximos ' +
  'vencimientos), redacta el "resumen del día" para el equipo: 3-5 viñetas en español, concisas y ' +
  'ACCIONABLES, priorizando lo urgente (plazos que vencen hoy/esta semana, tareas y expedientes que ' +
  'requieren atención). Usa Markdown (negritas y lista). NO inventes datos ni cifras: usa solo lo dado; ' +
  'si no hay nada urgente, dilo en una frase. No añadas saludos ni cierres.';

/**
 * Orquesta las capacidades de IA del despacho sobre el `AiAssistantProvider`/`AiEngine`. Ensambla el
 * CONTEXTO (expediente, cliente, tareas, documentos) como FUENTES citables, de modo que las respuestas
 * queden ancladas y trazables (D-011 / AI Act). No expone nada al portal del cliente (gating en el
 * controlador). Si el motor está deshabilitado, las llamadas devuelven 503 `ai.notConfigured`.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: AiQuotaService,
    private readonly dashboard: DashboardService,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
    @Inject(AI_ASSISTANT_PROVIDER) private readonly assistant: AiAssistantProvider,
    @Inject(AI_EMBEDDINGS) private readonly embeddings: EmbeddingsProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Estado para que el front muestre/oculte la IA. */
  status(): { enabled: boolean; model: string | null; searchEnabled: boolean } {
    return {
      enabled: this.engine.isEnabled(),
      // El modelo subyacente no se expone al cliente (se oculta en la UI); basta el flag de disponibilidad.
      model: null,
      searchEnabled: this.embeddings.isEnabled(),
    };
  }

  /**
   * Resumen del día para el dashboard: reutiliza el agregado de `DashboardService.summary` (ya acotado
   * por tenant) y pide al modelo un brief accionable. Devuelve Markdown (lo renderiza el dashboard).
   */
  async dailyBrief(user: RequestUser): Promise<{ brief: string; model: string | null }> {
    await this.quota.consume(user);
    const s = await this.dashboard.summary(user);
    const k = s.kpis;
    const deadlines = (s.deadlines ?? [])
      .slice(0, 12)
      .map((d: { title?: string; dueDate?: Date | string | null; reference?: string | null }) => {
        const due = d.dueDate ? new Date(d.dueDate).toISOString().slice(0, 10) : '—';
        return `- ${d.title ?? 'Tarea'}${d.reference ? ` (${d.reference})` : ''} — vence ${due}`;
      })
      .join('\n');
    const context =
      `KPIs del despacho:\n` +
      `- Expedientes activos: ${k.activeMatters} (total ${k.totalMatters})\n` +
      `- Clientes: ${k.totalClients}\n` +
      `- Tareas abiertas: ${k.openTasks}\n` +
      `- Plazos próximos: ${k.upcomingDeadlines} (urgentes: ${k.urgentDeadlines})\n` +
      `- Documentos pendientes de revisión: ${k.pendingReviews}\n\n` +
      `Próximos vencimientos:\n${deadlines || '- (ninguno registrado)'}\n`;
    const res = await this.engine.complete({
      system: DAILY_BRIEF_SYSTEM,
      messages: [{ role: 'user', content: context }],
      maxTokens: 700,
    });
    await this.quota.recordUsage(user, res.usage?.inputTokens ?? 0, res.usage?.outputTokens ?? 0);
    return { brief: res.text, model: res.model ?? this.engine.model() };
  }

  /** Pregunta libre sobre un expediente, anclada a su contexto. */
  async askMatter(user: RequestUser, matterId: string, question: string): Promise<AiResponse> {
    await this.quota.consume(user);
    const { sources } = await this.matterContext(user, matterId);
    const res = await this.assistant.draft({
      prompt: `Responde de forma precisa a la siguiente pregunta sobre el expediente, citando las fuentes pertinentes:\n\n${question}`,
      sources,
      locale: LOCALE,
    });
    return this.withModel(res);
  }

  /** Resumen estructurado del expediente. */
  async summarizeMatter(user: RequestUser, matterId: string): Promise<AiResponse> {
    await this.quota.consume(user);
    const { sources } = await this.matterContext(user, matterId);
    const res = await this.assistant.summarize({ sources, locale: LOCALE });
    return this.withModel(res);
  }

  /** Resumen/extracción de un documento (se pasa al modelo como adjunto nativo cuando es PDF/imagen). */
  async summarizeDocument(user: RequestUser, documentId: string): Promise<AiResponse> {
    await this.quota.consume(user);
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId: user.tenantId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    const version = doc?.versions[0];
    if (!doc || !version) throw new NotFoundException(apiError('documents.notFound'));

    const bytes = await this.storage.get(version.storageKey);
    const isAttachment =
      version.mimeType === 'application/pdf' || version.mimeType.startsWith('image/');
    const tooBig = bytes.byteLength > MAX_ATTACHMENT_BYTES;

    const system =
      'Eres un asistente jurídico. Resume de forma fiel y estructurada el documento aportado ' +
      '(partes, objeto, obligaciones, plazos, importes y riesgos). No inventes nada que no aparezca en él.';

    const completion = await this.engine.complete({
      system,
      messages: [
        {
          role: 'user',
          content:
            isAttachment && !tooBig
              ? `Resume el documento adjunto "${doc.name}".`
              : `Resume el siguiente documento "${doc.name}":\n\n${bytes.toString('utf8').slice(0, 100_000)}`,
        },
      ],
      attachments:
        isAttachment && !tooBig
          ? [{ mediaType: version.mimeType, dataBase64: bytes.toString('base64'), name: doc.name }]
          : undefined,
    });

    // Contabiliza el coste real (tokens) del adjunto: este es el peor caso de denial-of-wallet (PDF 8 MB).
    await this.quota.recordUsage(
      user,
      completion.usage?.inputTokens ?? 0,
      completion.usage?.outputTokens ?? 0,
    );

    return {
      output: completion.text,
      citations: [{ sourceId: `documento:${doc.id}` }],
      confidence: 0.7,
      warnings: tooBig ? ['El documento es grande; el resumen puede ser parcial.'] : [],
      model: completion.model ?? this.engine.model(),
    };
  }

  /** Genera un borrador de escrito a partir de una plantilla del despacho + contexto del expediente. */
  async draftFromTemplate(
    user: RequestUser,
    templateId: string,
    matterId: string,
    instructions?: string,
  ): Promise<AiResponse> {
    await this.quota.consume(user);
    const tpl = await this.prisma.documentTemplate.findFirst({
      where: { id: templateId, tenantId: user.tenantId },
    });
    if (!tpl) throw new NotFoundException(apiError('templates.notFound'));

    const { sources } = await this.matterContext(user, matterId);
    sources.unshift({ id: 'plantilla', title: tpl.name, excerpt: tpl.body });

    const res = await this.assistant.draft({
      prompt: [
        'Redacta el documento tomando como base la PLANTILLA [[plantilla]] y rellenando sus marcadores',
        '{{campo}} con los datos reales del expediente y del cliente que aparecen en las fuentes.',
        instructions ? `Instrucciones adicionales: ${instructions}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      sources,
      locale: LOCALE,
    });
    return this.withModel(res);
  }

  /** Redacta un correo (asunto + cuerpo). Si se indica expediente, lo usa como contexto. */
  async draftEmail(
    user: RequestUser,
    instructions: string,
    matterId?: string,
  ): Promise<AiResponse & { subject: string; body: string }> {
    await this.quota.consume(user);
    const sources = matterId ? (await this.matterContext(user, matterId)).sources : [];
    const res = await this.assistant.draft({
      prompt: [
        'Redacta un correo profesional para un cliente o contraparte.',
        'Empieza la respuesta con una línea exactamente así: "Asunto: <asunto>", y a continuación el cuerpo.',
        `Instrucciones: ${instructions}`,
      ].join('\n'),
      sources,
      locale: LOCALE,
    });
    const { subject, body } = this.splitEmail(res.output);
    return { ...this.withModel(res), subject, body };
  }

  // ── Contexto ────────────────────────────────────────────────────────────────

  /** Carga el expediente y construye las FUENTES citables (cabecera, cliente, tareas, documentos). */
  private async matterContext(
    user: RequestUser,
    matterId: string,
  ): Promise<{ sources: AiSource[] }> {
    const matter = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      include: {
        client: { select: { name: true, taxId: true } },
        lawyer: { select: { fullName: true } },
        documents: { select: { id: true, name: true }, take: 50 },
        tasks: {
          select: { id: true, title: true, status: true, dueDate: true },
          orderBy: { dueDate: 'asc' },
          take: 30,
        },
      },
    });
    if (!matter) throw new NotFoundException(apiError('matters.notFound'));

    const header = [
      `Referencia: ${matter.reference}`,
      `Título: ${matter.title}`,
      `Tipo: ${matter.type}`,
      `Estado: ${matter.status}`,
      `Cliente: ${matter.client.name} (${matter.client.taxId})`,
      matter.lawyer?.fullName ? `Letrado responsable: ${matter.lawyer.fullName}` : '',
      matter.opposingParty ? `Parte contraria: ${matter.opposingParty}` : '',
      matter.court ? `Juzgado/Tribunal: ${matter.court}` : '',
      matter.caseNumber ? `Nº de autos: ${matter.caseNumber}` : '',
      matter.proceduralPhase ? `Fase procesal: ${matter.proceduralPhase}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const sources: AiSource[] = [
      { id: 'expediente', title: `Expediente ${matter.reference}`, excerpt: header },
    ];

    for (const task of matter.tasks) {
      const due = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : 'sin fecha';
      sources.push({
        id: `tarea:${task.id}`,
        title: 'Tarea / plazo',
        excerpt: `${task.title} — estado ${task.status} — vence ${due}`,
      });
    }
    for (const d of matter.documents) {
      sources.push({ id: `documento:${d.id}`, title: 'Documento', excerpt: d.name });
    }
    return { sources };
  }

  private withModel(res: AiResult): AiResponse {
    return { ...res, model: this.engine.model() };
  }

  /** Separa "Asunto: ..." del cuerpo en el borrador de correo. */
  private splitEmail(output: string): { subject: string; body: string } {
    const m = output.match(/^\s*Asunto:\s*(.+?)\s*\n([\s\S]*)$/i);
    if (m) return { subject: (m[1] ?? '').trim(), body: (m[2] ?? '').trim() };
    return { subject: '', body: output.trim() };
  }
}
