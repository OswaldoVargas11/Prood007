import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Role } from '@legalflow/domain';
import { AiService } from './ai.service';
import { AiSearchService } from './ai-search.service';
import { AiAgentService } from './ai-agent.service';
import {
  AgentDto,
  AskDto,
  DraftEmailDto,
  DraftFromTemplateDto,
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
