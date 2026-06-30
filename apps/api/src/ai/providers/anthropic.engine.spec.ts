import type { ConfigService } from '@nestjs/config';
import { AnthropicEngine } from './anthropic.engine';

/** ConfigService falso: devuelve lo que le pasemos en el mapa (resto undefined → defaults del motor). */
function fakeConfig(values: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('AnthropicEngine', () => {
  it('usa claude-opus-4-8 como modelo por defecto (sin AI_MODEL)', () => {
    const engine = new AnthropicEngine('test-key', fakeConfig());
    expect(engine.model()).toBe('claude-opus-4-8');
    expect(engine.isEnabled()).toBe(true);
  });

  it('AI_MODEL sobreescribe el modelo por defecto (una sola variable de entorno)', () => {
    const engine = new AnthropicEngine('test-key', fakeConfig({ AI_MODEL: 'claude-sonnet-4-6' }));
    expect(engine.model()).toBe('claude-sonnet-4-6');
  });

  it('runAgent con signal ya abortado (botón Stop) corta el turno SIN llamar al proveedor', async () => {
    const engine = new AnthropicEngine('test-key', fakeConfig());
    const controller = new AbortController();
    controller.abort(); // simula la conexión cerrada por el cliente antes del primer paso
    const exec = jest.fn();

    const res = await engine.runAgent({ userMessage: 'hola', tools: [] }, exec, {
      signal: controller.signal,
    });

    // No se ejecutó ninguna herramienta ni se generó texto: se cortó de verdad (no solo entre pasos).
    expect(exec).not.toHaveBeenCalled();
    expect(res.stopReason).toBe('aborted');
    expect(res.text).toBe('');
    expect(res.steps).toEqual([]);
  });
});
