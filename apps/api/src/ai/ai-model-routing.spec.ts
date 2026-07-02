import { AI_MODEL_LIGHT_DEFAULT, resolveLightModel } from './ai-model-routing';

describe('resolveLightModel', () => {
  const original = process.env.AI_MODEL_LIGHT;
  afterEach(() => {
    if (original === undefined) delete process.env.AI_MODEL_LIGHT;
    else process.env.AI_MODEL_LIGHT = original;
  });

  it('devuelve el default (Haiku) si AI_MODEL_LIGHT no está fijado', () => {
    delete process.env.AI_MODEL_LIGHT;
    expect(resolveLightModel()).toBe(AI_MODEL_LIGHT_DEFAULT);
  });

  it('respeta AI_MODEL_LIGHT si está fijado', () => {
    process.env.AI_MODEL_LIGHT = 'claude-sonnet-5';
    expect(resolveLightModel()).toBe('claude-sonnet-5');
  });
});
