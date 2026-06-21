import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_ASSISTANT_PROVIDER,
  AI_EMBEDDINGS,
  AI_ENGINE,
  type AiAssistantProvider,
  type AiEngine,
  type EmbeddingsProvider,
} from '@legalflow/domain';
import { AnthropicEngine } from './providers/anthropic.engine';
import { DisabledEngine } from './providers/disabled.engine';
import { AssistantProvider } from './providers/assistant.provider';
import { VoyageEmbeddingsProvider } from './providers/voyage-embeddings.provider';
import { DisabledEmbeddingsProvider } from './providers/disabled-embeddings.provider';
import { AiService } from './ai.service';
import { AiSearchService } from './ai-search.service';
import { AiIndexCron } from './ai-index.cron';
import { AiController } from './ai.controller';

/**
 * Núcleo de IA, agnóstico del modelo. El factory elige el motor por configuración:
 *   · `ANTHROPIC_API_KEY` presente → `AnthropicEngine` (modelo por `AI_MODEL`, default claude-opus-4-6).
 *   · ausente → `DisabledEngine` (todo cableado; las features se muestran apagadas, nada se rompe).
 * Igual para embeddings con `VOYAGE_API_KEY`. "Enchufar el agente" = añadir la clave a los secrets.
 */
@Global()
@Module({
  controllers: [AiController],
  providers: [
    {
      provide: AI_ENGINE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiEngine => {
        const key = config.get<string>('ANTHROPIC_API_KEY');
        if (key) {
          const engine = new AnthropicEngine(key, config);
          new Logger('AiModule').log(`IA habilitada (modelo ${engine.model()}).`);
          return engine;
        }
        new Logger('AiModule').warn(
          'ANTHROPIC_API_KEY no definido: IA deshabilitada. Añade la clave para activarla.',
        );
        return new DisabledEngine();
      },
    },
    {
      provide: AI_ASSISTANT_PROVIDER,
      inject: [AI_ENGINE],
      useFactory: (engine: AiEngine): AiAssistantProvider => new AssistantProvider(engine),
    },
    {
      provide: AI_EMBEDDINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmbeddingsProvider => {
        const key = config.get<string>('VOYAGE_API_KEY');
        if (key) return new VoyageEmbeddingsProvider(key, config);
        new Logger('AiModule').warn(
          'VOYAGE_API_KEY no definido: búsqueda semántica deshabilitada (cae a búsqueda por texto).',
        );
        return new DisabledEmbeddingsProvider();
      },
    },
    AiService,
    AiSearchService,
    AiIndexCron,
  ],
  exports: [AI_ENGINE, AI_ASSISTANT_PROVIDER, AI_EMBEDDINGS, AiService, AiSearchService],
})
export class AiModule {}
