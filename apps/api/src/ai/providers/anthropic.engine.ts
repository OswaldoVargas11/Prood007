import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type {
  AiAgentRequest,
  AiAgentResult,
  AiAgentStep,
  AiCompletion,
  AiCompletionRequest,
  AiEngine,
  AiToolExecutor,
} from '@legalflow/domain';

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
  /** Tope absoluto de iteraciones de herramienta por turno agéntico (defensa anti-bucle/coste). */
  private static readonly HARD_MAX_STEPS = 12;

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

  /**
   * Turno AGÉNTICO: pasa `tools` a Claude y resuelve el protocolo tool-use. Mientras el modelo responda
   * con `stop_reason === 'tool_use'`, ejecuta cada herramienta vía `exec`, le devuelve el resultado como
   * `tool_result` y reitera, hasta una respuesta final o `maxSteps`. Acumula el coste real (tokens) de
   * TODAS las llamadas del turno para que la cuota lo contabilice (un turno = varias llamadas).
   */
  async runAgent(req: AiAgentRequest, exec: AiToolExecutor): Promise<AiAgentResult> {
    const maxTokens = Math.min(
      req.maxTokens ?? this.defaultMaxTokens,
      AnthropicEngine.HARD_MAX_TOKENS,
    );
    const maxSteps = Math.min(Math.max(req.maxSteps ?? 6, 1), AnthropicEngine.HARD_MAX_STEPS);
    const tools: Anthropic.Tool[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
    const system = req.system
      ? [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }]
      : undefined;

    const messages: Anthropic.MessageParam[] = [
      ...(req.history ?? []).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: req.userMessage },
    ];
    const steps: AiAgentStep[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let model = this.modelId;

    for (let step = 0; step < maxSteps; step++) {
      const res = await this.client.messages.create({
        model: this.modelId,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        tools,
        messages,
      });
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      model = res.model;

      if (res.stop_reason !== 'tool_use') {
        return {
          text: this.textFrom(res.content),
          steps,
          usage: { inputTokens, outputTokens },
          model,
          stopReason: res.stop_reason ?? 'end_turn',
        };
      }

      // El modelo pide herramientas: registra su turno y ejecuta cada bloque tool_use.
      messages.push({ role: 'assistant', content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        const input = (block.input ?? {}) as Record<string, unknown>;
        let outcome: { content: string; isError?: boolean };
        try {
          outcome = await exec({ name: block.name, input });
        } catch (e) {
          outcome = {
            content: `Error al ejecutar la herramienta: ${(e as Error).message}`,
            isError: true,
          };
        }
        steps.push({
          tool: block.name,
          input,
          output: outcome.content,
          isError: Boolean(outcome.isError),
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: outcome.content,
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    // Tope de pasos alcanzado: pide la respuesta final SIN herramientas para cerrar el turno limpiamente.
    const final = await this.client.messages.create({
      model: this.modelId,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages,
    });
    inputTokens += final.usage.input_tokens;
    outputTokens += final.usage.output_tokens;
    model = final.model;
    return {
      text: this.textFrom(final.content),
      steps,
      usage: { inputTokens, outputTokens },
      model,
      stopReason: 'max_steps',
    };
  }

  private textFrom(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }
}
