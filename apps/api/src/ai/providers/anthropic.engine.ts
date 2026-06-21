import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { AiCompletion, AiCompletionRequest, AiEngine } from '@legalflow/domain';

/**
 * Motor de IA sobre la API de Anthropic (Claude). Es la implementación REAL del `AiEngine`: enchufar el
 * agente = tener `ANTHROPIC_API_KEY` (el factory de `AiModule` inyecta esta clase en ese caso). El modelo
 * se elige por `AI_MODEL` (default `claude-opus-4-6`) — cambiarlo es una sola variable de entorno.
 *
 * Notas de diseño:
 * - System como bloque con `cache_control` efímero: en conversaciones/resúmenes repetidos el prefijo de
 *   sistema se cachea (~0,1× el coste de entrada).
 * - Adjuntos PDF/imagen se pasan como bloques nativos (Claude los entiende sin extracción local de texto).
 * - Sin parámetros de muestreo ni `thinking` explícito → portable a cualquier modelo Claude que se enchufe.
 * - `max_tokens` acotado para evitar timeouts HTTP en peticiones no-streaming.
 */
export class AnthropicEngine implements AiEngine {
  private readonly client: Anthropic;
  private readonly modelId: string;
  private readonly defaultMaxTokens: number;
  private static readonly HARD_MAX_TOKENS = 8192;

  constructor(apiKey: string, config: ConfigService) {
    this.client = new Anthropic({ apiKey });
    this.modelId = config.get<string>('AI_MODEL') || 'claude-opus-4-6';
    const configured = Number(config.get<string>('AI_MAX_OUTPUT_TOKENS'));
    this.defaultMaxTokens = Number.isFinite(configured) && configured > 0 ? configured : 4096;
  }

  isEnabled(): boolean {
    return true;
  }

  model(): string {
    return this.modelId;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletion> {
    const maxTokens = Math.min(
      req.maxTokens ?? this.defaultMaxTokens,
      AnthropicEngine.HARD_MAX_TOKENS,
    );

    const messages: Anthropic.MessageParam[] = req.messages.map((m, i) => {
      // Los adjuntos (si hay) se cuelgan del primer turno de usuario como bloques de documento/imagen.
      if (i === 0 && m.role === 'user' && req.attachments?.length) {
        const blocks: Anthropic.ContentBlockParam[] = [];
        for (const att of req.attachments) {
          if (att.mediaType === 'application/pdf') {
            blocks.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: att.dataBase64 },
            });
          } else if (att.mediaType.startsWith('image/')) {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mediaType as
                  | 'image/png'
                  | 'image/jpeg'
                  | 'image/gif'
                  | 'image/webp',
                data: att.dataBase64,
              },
            });
          }
        }
        blocks.push({ type: 'text', text: m.content });
        return { role: 'user', content: blocks };
      }
      return { role: m.role, content: m.content };
    });

    const res = await this.client.messages.create({
      model: this.modelId,
      max_tokens: maxTokens,
      ...(req.system
        ? { system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }] }
        : {}),
      messages,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return {
      text,
      model: res.model,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }
}
