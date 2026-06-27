import { OpenAiCompatEngine } from './openai-compat.engine';
import type { ConfigService } from '@nestjs/config';

/* eslint-disable @typescript-eslint/no-explicit-any */
const config = {
  get: (k: string) =>
    k === 'OPENAI_BASE_URL' ? 'https://api.test/v1' : k === 'AI_MODEL' ? 'test-model' : undefined,
} as unknown as ConfigService;

function jsonRes(data: unknown) {
  return { ok: true, json: async () => data } as any;
}

describe('OpenAiCompatEngine', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('complete envía el modelo y devuelve texto + uso', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonRes({
        choices: [{ message: { role: 'assistant', content: '  hola  ' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        model: 'srv-model',
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const engine = new OpenAiCompatEngine('key', config);

    const res = await engine.complete({
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(res.text).toBe('hola');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/chat/completions');
    expect(opts.headers.authorization).toBe('Bearer key');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('test-model');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('runAgent resuelve el protocolo de tool-use (function calling) y acumula uso', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        jsonRes({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  { id: 'c1', type: 'function', function: { name: 't1', arguments: '{"q":"x"}' } },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 7, completion_tokens: 3 },
          model: 'srv',
        }),
      )
      .mockResolvedValueOnce(
        jsonRes({
          choices: [
            { message: { role: 'assistant', content: 'RESPUESTA' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
          model: 'srv',
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    const engine = new OpenAiCompatEngine('key', config);
    const exec = jest.fn().mockResolvedValue({ content: 'RESULT' });

    const res = await engine.runAgent(
      {
        system: 'sys',
        userMessage: 'haz algo',
        tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object', properties: {} } }],
      },
      exec,
    );

    expect(exec).toHaveBeenCalledWith({ name: 't1', input: { q: 'x' } });
    expect(res.text).toBe('RESPUESTA');
    expect(res.steps).toEqual([
      { tool: 't1', input: { q: 'x' }, output: 'RESULT', isError: false },
    ]);
    expect(res.usage).toEqual({ inputTokens: 11, outputTokens: 5 });
    // La segunda llamada incluye el mensaje 'tool' con el resultado.
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.messages.some((m: any) => m.role === 'tool' && m.content === 'RESULT')).toBe(
      true,
    );
  });

  it('lanza si la API responde no-2xx', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' } as any) as any;
    const engine = new OpenAiCompatEngine('key', config);
    await expect(engine.complete({ messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(
      /401/,
    );
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
