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
import { OpenAiCompatEngine } from './providers/openai-compat.engine';
import { DisabledEngine } from './providers/disabled.engine';
import { AssistantProvider } from './providers/assistant.provider';
import { VoyageEmbeddingsProvider } from './providers/voyage-embeddings.provider';
import { DisabledEmbeddingsProvider } from './providers/disabled-embeddings.provider';
import { AiService } from './ai.service';
import { AiSearchService } from './ai-search.service';
import { AiAgentService } from './ai-agent.service';
import { AiQuotaService } from './ai-quota.service';
import { AiIndexCron } from './ai-index.cron';
import { AiController } from './ai.controller';
import { TasksModule } from '../tasks/tasks.module';
import { DocumentsModule } from '../documents/documents.module';
import { TemplatesModule } from '../templates/templates.module';
import { ClientsModule } from '../clients/clients.module';
import { MattersModule } from '../matters/matters.module';
import { PresentationsModule } from '../presentations/presentations.module';
import { DashboardModule } from '../dashboard/dashboard.module';

/**
 * Núcleo de IA, agnóstico del modelo. El factory elige el motor por configuración:
 *   · `ANTHROPIC_API_KEY` presente → `AnthropicEngine` (modelo por `AI_MODEL`, default claude-opus-4-6).
 *   · ausente → `DisabledEngine` (todo cableado; las features se muestran apagadas, nada se rompe).
 * Igual para embeddings con `VOYAGE_API_KEY`. "Enchufar el agente" = añadir la clave a los secrets.
 */
@Global()
@Module({
  imports: [
    TasksModule,
    DocumentsModule,
    TemplatesModule,
    DashboardModule,
    ClientsModule,
    MattersModule,
    PresentationsModule,
  ],
  controllers: [AiController],
  providers: [
    {
      provide: AI_ENGINE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiEngine => {
        // Selección de proveedor: AI_PROVIDER ('anthropic'|'openai') decide; si no se fija, se prefiere
        // Anthropic cuando hay su clave, y si no, OpenAI-compat. Esto deja la IA multi-proveedor (sin
        // lock-in) y permite probar con proveedores compatibles con OpenAI (Groq, Gemini, OpenRouter...).
        const log = new Logger('AiModule');
        const anthropicKey = config.get<string>('ANTHROPIC_API_KEY');
        const openaiKey = config.get<string>('OPENAI_API_KEY');
        const provider = (config.get<string>('AI_PROVIDER') || '').toLowerCase();
        const preferOpenAi = provider === 'openai' || (provider !== 'anthropic' && !anthropicKey);

        if (openaiKey && preferOpenAi) {
          const engine = new OpenAiCompatEngine(openaiKey, config);
          log.log(`IA habilitada (OpenAI-compat, modelo ${engine.model()}).`);
          return engine;
        }
        if (anthropicKey) {
          const engine = new AnthropicEngine(anthropicKey, config);
          log.log(`IA habilitada (Anthropic, modelo ${engine.model()}).`);
          return engine;
        }
        if (openaiKey) {
          const engine = new OpenAiCompatEngine(openaiKey, config);
          log.log(`IA habilitada (OpenAI-compat, modelo ${engine.model()}).`);
          return engine;
        }
        log.warn(
          'Sin ANTHROPIC_API_KEY ni OPENAI_API_KEY: IA deshabilitada. Añade una clave para activarla.',
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
    AiAgentService,
    AiQuotaService,
    AiIndexCron,
  ],
  exports: [
    AI_ENGINE,
    AI_ASSISTANT_PROVIDER,
    AI_EMBEDDINGS,
    AiService,
    AiSearchService,
    AiAgentService,
  ],
})
export class AiModule {}
