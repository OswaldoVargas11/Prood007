import { ConfigService } from '@nestjs/config';
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
 * Motor de IA sobre cualquier API compatible con OpenAI (Chat Completions + function calling): OpenAI,
 * Azure OpenAI, Groq, OpenRouter, Cerebras, Mistral, Together, el endpoint compatible de Gemini, o un
 * modelo local (Ollama). Es ADITIVO al `AnthropicEngine`: el factory de `AiModule` elige uno por config.
 * Permite probar el agente con proveedores gratuitos y deja la IP sin lock-in de proveedor.
 *
 * Config: `OPENAI_API_KEY` (clave), `OPENAI_BASE_URL` (por defecto api.openai.com/v1), `AI_MODEL` (modelo).
 * Sin dependencias nuevas: usa `fetch` (Node 20). Las herramientas (JSON Schema) se portan tal cual.
 */
interface OpenAiToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}
interface OpenAiMessage {
  role: string;
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
}
type OutContent = string | Array<Record<string, unknown>> | null;
interface OutMessage {
  role: string;
  content?: OutContent;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}
interface ChatResult {
  message: OpenAiMessage;
  usage: { input: number; output: number };
  model: string;
  finishReason: string;
}

export class OpenAiCompatEngine implements AiEngine {
  private readonly baseURL: string;
  private readonly modelId: string;
  private readonly defaultMaxTokens: number;
  private static readonly HARD_MAX_TOKENS = 8192;
  private static readonly HARD_MAX_STEPS = 12;

  constructor(
    private readonly apiKey: string,
    config: ConfigService,
  ) {
    const base = config.get<string>('OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    this.baseURL = base.replace(/\/+$/, '');
    this.modelId = config.get<string>('AI_MODEL') || 'gpt-4o-mini';
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
      OpenAiCompatEngine.HARD_MAX_TOKENS,
    );
    const messages: OutMessage[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    req.messages.forEach((m, i) => {
      // Las imágenes se pasan como parte de visión (data URL); los PDF no se soportan en OpenAI-compat.
      if (i === 0 && m.role === 'user' && req.attachments?.length) {
        const parts: Array<Record<string, unknown>> = [{ type: 'text', text: m.content }];
        for (const att of req.attachments) {
          if (att.mediaType.startsWith('image/')) {
            parts.push({
              type: 'image_url',
              image_url: { url: `data:${att.mediaType};base64,${att.dataBase64}` },
            });
          }
        }
        messages.push({ role: 'user', content: parts });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    });

    const res = await this.chat({ messages, max_tokens: maxTokens });
    return {
      text: (res.message.content ?? '').trim(),
      model: res.model,
      usage: { inputTokens: res.usage.input, outputTokens: res.usage.output },
    };
  }

  async runAgent(req: AiAgentRequest, exec: AiToolExecutor): Promise<AiAgentResult> {
    const maxTokens = Math.min(
      req.maxTokens ?? this.defaultMaxTokens,
      OpenAiCompatEngine.HARD_MAX_TOKENS,
    );
    const maxSteps = Math.min(Math.max(req.maxSteps ?? 6, 1), OpenAiCompatEngine.HARD_MAX_STEPS);
    const tools = req.tools.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));

    const messages: OutMessage[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const m of req.history ?? []) messages.push({ role: m.role, content: m.content });
    messages.push({ role: 'user', content: req.userMessage });

    const steps: AiAgentStep[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let model = this.modelId;

    for (let step = 0; step < maxSteps; step++) {
      const res = await this.chat({ messages, tools, tool_choice: 'auto', max_tokens: maxTokens });
      inputTokens += res.usage.input;
      outputTokens += res.usage.output;
      model = res.model;

      const toolCalls = res.message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return {
          text: (res.message.content ?? '').trim(),
          steps,
          usage: { inputTokens, outputTokens },
          model,
          stopReason: res.finishReason || 'stop',
        };
      }

      // El modelo pide herramientas: añade su turno (con tool_calls) y luego un mensaje 'tool' por cada una.
      messages.push({
        role: 'assistant',
        content: res.message.content ?? null,
        tool_calls: toolCalls,
      });
      for (const tc of toolCalls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          input = {};
        }
        let outcome: { content: string; isError?: boolean };
        try {
          outcome = await exec({ name: tc.function.name, input });
        } catch (e) {
          outcome = {
            content: `Error al ejecutar la herramienta: ${(e as Error).message}`,
            isError: true,
          };
        }
        steps.push({
          tool: tc.function.name,
          input,
          output: outcome.content,
          isError: Boolean(outcome.isError),
        });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: outcome.content });
      }
    }

    // Tope de pasos alcanzado: pide la respuesta final SIN herramientas.
    const final = await this.chat({ messages, max_tokens: maxTokens });
    inputTokens += final.usage.input;
    outputTokens += final.usage.output;
    model = final.model;
    return {
      text: (final.message.content ?? '').trim(),
      steps,
      usage: { inputTokens, outputTokens },
      model,
      stopReason: 'max_steps',
    };
  }

  /** POST a /chat/completions y normaliza la respuesta. Lanza si la API responde no-2xx. */
  private async chat(body: Record<string, unknown>): Promise<ChatResult> {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.modelId, ...body }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenAI-compat ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: OpenAiMessage; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const choice = data.choices?.[0] ?? {};
    return {
      message: choice.message ?? { role: 'assistant', content: '' },
      usage: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
      model: data.model ?? this.modelId,
      finishReason: choice.finish_reason ?? 'stop',
    };
  }
}
