import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';

/** Módulo de utilidades de diagnóstico. Solo se importa si SENTRY_DEBUG_KEY está definido (ver AppModule). */
@Module({ controllers: [DebugController] })
export class DebugModule {}
