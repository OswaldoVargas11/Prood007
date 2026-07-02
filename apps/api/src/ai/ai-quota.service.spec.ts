import { AiQuotaService } from './ai-quota.service';
import { AI_MODEL_LIGHT_DEFAULT } from './ai-model-routing';
import type { RequestUser } from '../auth/auth.types';

const user = { tenantId: 't1', userId: 'u1', role: 'LAWYER' } as unknown as RequestUser;

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeService(configOverrides: Record<string, string> = {}) {
  const upsert = jest.fn().mockResolvedValue({ calls: 1, inputTokens: 0, outputTokens: 0 });
  const prisma = { aiUsage: { upsert } } as any;
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (k: string) => configOverrides[k] } as any;
  const service = new AiQuotaService(prisma, audit as any, config);
  return { service, upsert };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('AiQuotaService.recordUsage', () => {
  it('sin modelo, solo incrementa los contadores totales (comportamiento previo intacto)', async () => {
    const { service, upsert } = makeService();
    await service.recordUsage(user, 100, 40);
    const call = upsert.mock.calls[0][0];
    expect(call.update).toEqual({
      inputTokens: { increment: 100 },
      outputTokens: { increment: 40 },
    });
  });

  it('con el modelo LIGERO por defecto, desglosa también en lightModel*', async () => {
    const { service, upsert } = makeService();
    await service.recordUsage(user, 100, 40, AI_MODEL_LIGHT_DEFAULT);
    const call = upsert.mock.calls[0][0];
    expect(call.update).toEqual({
      inputTokens: { increment: 100 },
      outputTokens: { increment: 40 },
      lightModelInputTokens: { increment: 100 },
      lightModelOutputTokens: { increment: 40 },
    });
  });

  it('respeta AI_MODEL_LIGHT configurado para decidir qué cuenta como "ligero"', async () => {
    const { service, upsert } = makeService({ AI_MODEL_LIGHT: 'claude-custom-light' });
    await service.recordUsage(user, 10, 5, 'claude-custom-light');
    expect(upsert.mock.calls[0][0].update).toMatchObject({
      lightModelInputTokens: { increment: 10 },
    });
  });

  it('un modelo que NO es el ligero (p. ej. el principal) no toca lightModel*', async () => {
    const { service, upsert } = makeService();
    await service.recordUsage(user, 100, 40, 'claude-opus-4-8');
    const call = upsert.mock.calls[0][0];
    expect(call.update).toEqual({
      inputTokens: { increment: 100 },
      outputTokens: { increment: 40 },
    });
  });
});
