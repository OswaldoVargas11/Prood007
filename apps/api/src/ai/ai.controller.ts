import { Body, Controller, Delete, Get, Param, Post, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { AiService } from './ai.service';
import { AiSearchService } from './ai-search.service';
import { AiChatService } from './ai-chat.service';
import { AiAgentService, type AgentStreamEvent } from './ai-agent.service';
import {
  AgentDto,
  AskDto,
  DraftEmailDto,
  DraftFromTemplateDto,
  SaveTurnsDto,
  SemanticSearchDto,
} from './dto/ai.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';

/**
 * Asistente de IA del despacho. Solo staff (FIRM_ADMIN/LAWYER) — NUNCA el portal del cliente. Todas las
 * respuestas van ancladas al contexto del expediente y citan fuentes (D-011/AI Act). Si el motor no está
 * configurado (`ANTHROPIC_API_KEY` ausente), los endpoints responden 503 `ai.notConfigured`; el front
 * usa `GET /ai/status` para mostrar la IA deshabilitada en vez de fallar.
 */
// Las llamadas a IA tienen coste real (clave compartida del proveedor). Además de la cuota diaria por
// tenant (AiQuotaService), se acota la RÁFAGA: 20/min frente al global de 300/min. `/ai/status` no llama
// al modelo, así que se exime más abajo.
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly search: AiSearchService,
    private readonly agent: AiAgentService,
    private readonly chat: AiChatService,
  ) {}

  /** ¿Está la IA disponible y con qué modelo? (para gating de la UI). No llama al modelo → sin throttle estricto. */
  @SkipThrottle()
  @Get('status')
  status() {
    return this.ai.status();
  }

  /** Pregunta sobre un expediente. */
  @RequiresFeature('ai')
  @Post('matters/:id/ask')
  ask(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AskDto) {
    return this.ai.askMatter(user, id, dto.question);
  }

  /** Resumen del expediente. */
  @RequiresFeature('ai')
  @Post('matters/:id/summary')
  summarizeMatter(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ai.summarizeMatter(user, id);
  }

  /** Resumen/extracción de un documento. */
  @RequiresFeature('ai')
  @Post('documents/:id/summarize')
  summarizeDocument(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.ai.summarizeDocument(user, id);
  }

  /** Borrador de escrito a partir de una plantilla + contexto del expediente. */
  @RequiresFeature('ai')
  @Post('templates/:id/draft')
  draftFromTemplate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: DraftFromTemplateDto,
  ) {
    return this.ai.draftFromTemplate(user, id, dto.matterId, dto.instructions);
  }

  /** Borrador de correo (asunto + cuerpo). */
  @RequiresFeature('ai')
  @Post('email/draft')
  draftEmail(@CurrentUser() user: RequestUser, @Body() dto: DraftEmailDto) {
    return this.ai.draftEmail(user, dto.instructions, dto.matterId);
  }

  /**
   * Asistente AGÉNTICO (tool-use): responde consultando datos reales del despacho con herramientas de
   * SOLO LECTURA (expedientes, tareas, clientes, documentos), no solo generando texto. Devuelve la
   * respuesta final + la traza de herramientas usadas.
   */
  @RequiresFeature('ai')
  @Post('agent')
  agentRun(@CurrentUser() user: RequestUser, @Body() dto: AgentDto) {
    return this.agent.run(user, dto.message, dto.history, dto.allowWrites);
  }

  /** Resumen del día para el dashboard (IA): brief accionable a partir del agregado del panel. */
  @RequiresFeature('ai')
  @Get('daily-brief')
  dailyBrief(@CurrentUser() user: RequestUser) {
    return this.ai.dailyBrief(user);
  }

  /**
   * Variante en STREAMING (NDJSON): emite eventos de progreso por herramienta ('tool' = thinking-traces)
   * y un 'done' final. El cliente puede abortar (botón Stop): al cerrarse la conexión, el turno se corta.
   */
  @RequiresFeature('ai')
  @Post('agent/stream')
  async agentStream(
    @CurrentUser() user: RequestUser,
    @Body() dto: AgentDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    let aborted = false;
    res.on('close', () => {
      aborted = true;
    });
    const write = (e: AgentStreamEvent) => {
      if (!res.writableEnded) res.write(`${JSON.stringify(e)}\n`);
    };
    try {
      await this.agent.runStream(user, dto.message, dto.history, dto.allowWrites, {
        onEvent: write,
        isAborted: () => aborted,
      });
    } catch {
      write({
        type: 'done',
        output: 'No se pudo completar la consulta.',
        steps: [],
        model: null,
        stopReason: 'error',
        pendingWrites: [],
      });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }

  // ── Persistencia del chat de Zora ─────────────────────────────────────────
  // CRUD del historial de conversaciones del usuario. NO llama al modelo (la generación va por
  // `/ai/agent/stream`), así que se exime del throttle estricto de IA. Cada conversación es privada del
  // usuario que la inició (el servicio filtra por userId además del aislamiento por tenant de RLS).

  /** Historial de conversaciones del usuario con Zora (recientes primero). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get('conversations')
  listConversations(@CurrentUser() user: RequestUser) {
    return this.chat.list(user);
  }

  /** Carga una conversación con sus mensajes (para restaurar el chat). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get('conversations/:id')
  getConversation(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.chat.get(user, id);
  }

  /** Crea una conversación con los mensajes de su primer turno. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Post('conversations')
  createConversation(@CurrentUser() user: RequestUser, @Body() dto: SaveTurnsDto) {
    return this.chat.create(user, dto.messages);
  }

  /** Añade los mensajes de un turno a una conversación existente. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Post('conversations/:id/messages')
  appendTurn(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: SaveTurnsDto) {
    return this.chat.append(user, id, dto.messages);
  }

  /** Borra una conversación del usuario. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Delete('conversations/:id')
  deleteConversation(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.chat.remove(user, id);
  }

  /** Búsqueda semántica en lo indexado del despacho. (Avanzado: indexación/RAG.) */
  @RequiresFeature('semantic-search')
  @Post('search')
  semanticSearch(@CurrentUser() user: RequestUser, @Body() dto: SemanticSearchDto) {
    return this.search.search(user, dto.query, dto.limit);
  }

  /** (Re)indexa un expediente para la búsqueda semántica. (Avanzado: indexación/RAG.) */
  @RequiresFeature('semantic-search')
  @Post('index/matters/:id')
  indexMatter(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.search.indexMatter(user, id);
  }
}
