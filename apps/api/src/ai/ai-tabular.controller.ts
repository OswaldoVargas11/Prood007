import { Body, Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Role } from '@legalflow/domain';
import { AiTabularService } from './ai-tabular.service';
import { CreateTabularReviewDto, TabularColumnDto } from './dto/ai.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresFeature } from '../auth/decorators/requires-feature.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { safeContentDisposition } from '../common/safe-download';
import type { RequestUser } from '../auth/auth.types';

/**
 * Revisión TABULAR de documentos (estilo Legora). Solo staff, nunca el portal del cliente. Crear la
 * revisión / añadir columna / relanzar disparan extracciones con el modelo (throttle de IA + cuota
 * diaria); las lecturas y el export no llaman al modelo y quedan eximidas del throttle estricto.
 * Sin `ANTHROPIC_API_KEY`, las rutas que extraen responden 503 `ai.notConfigured` (gating estándar).
 */
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Roles(Role.FIRM_ADMIN, Role.LAWYER)
@Controller('ai/tabular-reviews')
export class AiTabularController {
  constructor(private readonly tabular: AiTabularService) {}

  /** Lista revisiones (opcionalmente filtradas por expediente) con progreso por estados. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get()
  list(@CurrentUser() user: RequestUser, @Query('matterId') matterId?: string) {
    return this.tabular.list(user, matterId);
  }

  /** Crea una revisión (documentos × columnas) y arranca la extracción en background. */
  @RequiresFeature('ai')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTabularReviewDto) {
    return this.tabular.create(user, dto);
  }

  /** Detalle: definición + celdas (la UI sondea mientras haya PENDING). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.tabular.get(user, id);
  }

  /** Añade una columna (crea sus celdas y las procesa en background). */
  @RequiresFeature('ai')
  @Post(':id/columns')
  addColumn(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: TabularColumnDto,
  ) {
    return this.tabular.addColumn(user, id, dto.label);
  }

  /** Quita una columna y borra sus celdas. */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Delete(':id/columns/:columnId')
  removeColumn(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('columnId') columnId: string,
  ) {
    return this.tabular.removeColumn(user, id, columnId);
  }

  /** Relanza las celdas FAILED. */
  @RequiresFeature('ai')
  @Post(':id/retry')
  retry(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.tabular.retryFailed(user, id);
  }

  /** Export CSV (default) o XLSX (`?format=xlsx`). Siempre como descarga (attachment). */
  @SkipThrottle()
  @RequiresFeature('ai')
  @Get(':id/export')
  async export(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.tabular.export(user, id, format === 'xlsx' ? 'xlsx' : 'csv');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', safeContentDisposition(file.mimeType, file.filename));
    res.send(file.body);
  }
}
