import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { AiPlaybookService } from './ai-playbook.service';
import { CreatePlaybookDto, CreatePlaybookReviewDto, UpdatePlaybookDto } from './dto/ai.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { safeContentDisposition } from '../common/safe-download';
import type { RequestUser } from '../auth/auth.types';

/**
 * Playbooks de REVISIÓN de contratos (estilo Spellbook/Ironclad). Solo staff, nunca el portal del
 * cliente. El CRUD de playbooks no llama al modelo; lanzar una revisión (o relanzar hallazgos) dispara
 * llamadas con IA (throttle + cuota diaria) y sin `ANTHROPIC_API_KEY` responde 503 `ai.notConfigured`
 * (gating estándar). NOTA de rutas: las de `reviews/...` van ANTES que las de `:id` (orden de registro).
 */
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('ai/playbooks')
export class AiPlaybookController {
  constructor(private readonly playbooks: AiPlaybookService) {}

  // ── Revisiones ─────────────────────────────────────────────────────────────

  /** Lista revisiones (opcionalmente filtradas por expediente) con progreso por estados. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get('reviews')
  listReviews(@CurrentUser() user: RequestUser, @Query('matterId') matterId?: string) {
    return this.playbooks.listReviews(user, matterId);
  }

  /** Lanza la revisión de un documento contra un playbook (procesa en background). */
  @RequiresFeature('ai')
  @Post('reviews')
  createReview(@CurrentUser() user: RequestUser, @Body() dto: CreatePlaybookReviewDto) {
    return this.playbooks.createReview(user, dto);
  }

  /** Detalle del informe: cabecera + hallazgos (la UI sondea mientras haya PENDING). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get('reviews/:id')
  getReview(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.playbooks.getReview(user, id);
  }

  /** Relanza los hallazgos FAILED. */
  @RequiresFeature('ai')
  @Post('reviews/:id/retry')
  retry(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.playbooks.retryFailed(user, id);
  }

  /** Informe PDF de la revisión, siempre como descarga (attachment). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get('reviews/:id/pdf')
  async exportPdf(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.playbooks.exportPdf(user, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', safeContentDisposition(file.mimeType, file.filename));
    res.send(file.body);
  }

  // ── CRUD de playbooks ──────────────────────────────────────────────────────

  /** Lista los playbooks del despacho (con nº de reglas). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.playbooks.list(user);
  }

  /** Crea un playbook con su juego de reglas. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePlaybookDto) {
    return this.playbooks.create(user, dto);
  }

  /** Instala el playbook SEMILLA de la jurisdicción del despacho (idempotente por nombre). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Post('seed')
  installSeed(@CurrentUser() user: RequestUser) {
    return this.playbooks.installSeed(user);
  }

  /** Detalle de un playbook con sus reglas. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.playbooks.get(user, id);
  }

  /** Actualiza el playbook (si llegan `rules`, reemplazan el juego completo). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlaybookDto,
  ) {
    return this.playbooks.update(user, id, dto);
  }

  /** Borra el playbook (las revisiones ya emitidas sobreviven con su snapshot). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.playbooks.remove(user, id);
  }
}
