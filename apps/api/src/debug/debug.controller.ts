import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Endpoint de verificación de Sentry (NO es funcionalidad de usuario): lanza a propósito un error de
 * servidor para comprobar que Sentry captura las excepciones no controladas (5xx).
 *
 * Doble protección: el módulo SOLO se registra si `SENTRY_DEBUG_KEY` está definido (ver AppModule), y el
 * endpoint SOLO lanza si el query `key` coincide con ese valor (si no, responde 404 como si no existiera).
 * No expone ni toca datos. Tras verificar, basta con quitar el secret `SENTRY_DEBUG_KEY`.
 */
@Public()
@Controller('debug')
export class DebugController {
  @Get('sentry-check')
  sentryCheck(@Query('key') key?: string): never {
    if (!process.env.SENTRY_DEBUG_KEY || key !== process.env.SENTRY_DEBUG_KEY) {
      throw new NotFoundException();
    }
    throw new Error(`Sentry verification (manual trigger) — ${new Date().toISOString()}`);
  }
}
