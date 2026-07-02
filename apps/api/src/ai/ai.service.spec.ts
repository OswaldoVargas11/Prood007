import { AiService } from './ai.service';
import { AI_MODEL_LIGHT_DEFAULT } from './ai-model-routing';
import type { RequestUser } from '../auth/auth.types';

const user = { tenantId: 't1', userId: 'u1', role: 'LAWYER' } as unknown as RequestUser;

/* eslint-disable @typescript-eslint/no-explicit-any */
function makeDeps() {
  const prisma = {} as any;
  const quota = {
    consume: jest.fn().mockResolvedValue(undefined),
    recordUsage: jest.fn().mockResolvedValue(undefined),
  };
  const dashboard = {
    summary: jest.fn().mockResolvedValue({
      kpis: {
        activeMatters: 3,
        totalMatters: 5,
        totalClients: 2,
        openTasks: 4,
        upcomingDeadlines: 1,
        urgentDeadlines: 0,
        pendingReviews: 0,
      },
      deadlines: [],
    }),
  };
  const engine = {
    isEnabled: () => true,
    model: () => 'claude-opus-4-8',
    complete: jest.fn().mockResolvedValue({
      text: 'brief',
      model: AI_MODEL_LIGHT_DEFAULT,
      usage: { inputTokens: 20, outputTokens: 10 },
    }),
    runAgent: jest.fn(),
  };
  const assistant = {};
  const embeddings = { isEnabled: () => true };
  const storage = {};
  const service = new AiService(
    prisma,
    quota as any,
    dashboard as any,
    engine as any,
    assistant as any,
    embeddings as any,
    storage as any,
  );
  return { service, quota, dashboard, engine };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('AiService.dailyBrief', () => {
  it('enruta el resumen del día al modelo LIGERO (no al principal del agente)', async () => {
    const { service, engine } = makeDeps();
    await service.dailyBrief(user);
    expect(engine.complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: AI_MODEL_LIGHT_DEFAULT }),
    );
  });

  it('contabiliza en AiQuota el modelo LIGERO realmente usado (para medir ahorro por tenant)', async () => {
    const { service, quota } = makeDeps();
    await service.dailyBrief(user);
    expect(quota.recordUsage).toHaveBeenCalledWith(user, 20, 10, AI_MODEL_LIGHT_DEFAULT);
  });
});
