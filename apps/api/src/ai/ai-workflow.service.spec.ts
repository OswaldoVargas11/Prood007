import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiWorkflowService } from './ai-workflow.service';
import { AGENT_TOOLS } from './ai-agent.tools';
import type { AiAgentService, PendingWrite } from './ai-agent.service';
import type { AiToolInvocation, AiToolOutcome } from '@legalflow/domain';
import type { RequestUser } from '../auth/auth.types';

/**
 * Pruebas del MOTOR de workflows (LAW-22) sin BD ni proveedor de IA: se mockean `AiAgentService` (el
 * dispatch real de tools + gate HITL) y Prisma. Verifican que un flujo de ≥2 pasos encadena herramientas
 * en orden y que el gate HITL detiene el flujo en un paso de escritura no confirmado.
 */

const user = { tenantId: 't1', userId: 'u1', roles: ['LAWYER'] } as unknown as RequestUser;

/** Un agente FALSO: `executeTool` devuelve un outcome fijo por tool y simula el gate HITL para escrituras. */
function makeAgent(opts: {
  writeTools?: Set<string>;
  outputs?: Record<string, string>;
  errors?: Set<string>;
}): { agent: AiAgentService; calls: AiToolInvocation[] } {
  const writeTools = opts.writeTools ?? new Set<string>();
  const calls: AiToolInvocation[] = [];
  const agent = {
    isWriteTool: (name: string) => writeTools.has(name),
    toolCatalog: () =>
      AGENT_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        isWrite: writeTools.has(t.name),
      })),
    executeTool: jest.fn(
      async (
        _u: RequestUser,
        inv: AiToolInvocation,
        allowWrites: boolean,
      ): Promise<{ outcome: AiToolOutcome; pendingWrites: PendingWrite[] }> => {
        calls.push(inv);
        // Gate HITL: una escritura sin confirmación NO se ejecuta; se propone (pendingWrites).
        if (writeTools.has(inv.name) && !allowWrites) {
          return {
            outcome: {
              content: JSON.stringify({ status: 'requires_confirmation', action: inv.name }),
            },
            pendingWrites: [{ action: inv.name, summary: `Crear ${inv.name}` }],
          };
        }
        const isError = opts.errors?.has(inv.name) ?? false;
        return {
          outcome: { content: opts.outputs?.[inv.name] ?? `ok:${inv.name}`, isError },
          pendingWrites: [],
        };
      },
    ),
  } as unknown as AiAgentService;
  return { agent, calls };
}

function makePrisma(steps: { tool: string; input?: Record<string, unknown> }[]) {
  const created: unknown[] = [];
  const prisma = {
    aiWorkflow: {
      findFirst: jest.fn().mockResolvedValue({ id: 'wf1', name: 'Flujo', steps }),
    },
    aiWorkflowRun: {
      create: jest.fn(async ({ data }: { data: unknown }) => {
        created.push(data);
        return { id: 'run1' };
      }),
    },
  };
  return { prisma, created };
}

describe('AiWorkflowService (motor multi-paso)', () => {
  it('ejecuta un flujo de ≥2 pasos encadenando tools de lectura → completed', async () => {
    const steps = [
      { tool: 'search_matters', input: { query: 'Acme' } },
      { tool: 'list_open_tasks', input: {} },
    ];
    const { agent, calls } = makeAgent({
      outputs: { search_matters: 'EXP-1', list_open_tasks: '2 tareas' },
    });
    const { prisma, created } = makePrisma(steps);
    const svc = new AiWorkflowService(prisma as never, agent);

    const res = await svc.run(user, 'wf1', false);

    expect(res.status).toBe('completed');
    expect(res.stepResults).toHaveLength(2);
    // Encadena en ORDEN: primer paso search_matters, segundo list_open_tasks.
    expect(calls.map((c) => c.name)).toEqual(['search_matters', 'list_open_tasks']);
    expect(res.stepResults[0]).toMatchObject({
      tool: 'search_matters',
      output: 'EXP-1',
      status: 'completed',
    });
    expect(res.stepResults[1]).toMatchObject({ tool: 'list_open_tasks', status: 'completed' });
    // Persiste el run con la traza.
    expect((created[0] as { status: string }).status).toBe('completed');
  });

  it('respeta el gate HITL: se detiene en un paso de escritura sin confirmación', async () => {
    const steps = [
      { tool: 'search_matters', input: { query: 'Acme' } },
      { tool: 'create_task', input: { title: 'Llamar al cliente' } },
      { tool: 'list_open_tasks', input: {} },
    ];
    const { agent, calls } = makeAgent({ writeTools: new Set(['create_task']) });
    const { prisma } = makePrisma(steps);
    const svc = new AiWorkflowService(prisma as never, agent);

    const res = await svc.run(user, 'wf1', false);

    expect(res.status).toBe('requires_confirmation');
    expect(res.pendingWrites).toEqual([{ action: 'create_task', summary: 'Crear create_task' }]);
    // El flujo se DETUVO en create_task: el tercer paso (list_open_tasks) NO se ejecutó.
    expect(calls.map((c) => c.name)).toEqual(['search_matters', 'create_task']);
    expect(res.stepResults).toHaveLength(2);
    expect(res.stepResults[1]?.status).toBe('requires_confirmation');
  });

  it('con allowWrites=true ejecuta también los pasos de escritura hasta el final', async () => {
    const steps = [
      { tool: 'search_matters', input: { query: 'Acme' } },
      { tool: 'create_task', input: { title: 'Llamar al cliente' } },
    ];
    const { agent, calls } = makeAgent({ writeTools: new Set(['create_task']) });
    const { prisma } = makePrisma(steps);
    const svc = new AiWorkflowService(prisma as never, agent);

    const res = await svc.run(user, 'wf1', true);

    expect(res.status).toBe('completed');
    expect(res.pendingWrites).toHaveLength(0);
    expect(calls.map((c) => c.name)).toEqual(['search_matters', 'create_task']);
  });

  it('se detiene (failed) si un paso devuelve error', async () => {
    const steps = [
      { tool: 'search_matters', input: {} },
      { tool: 'get_matter', input: { reference: 'NOPE' } },
      { tool: 'list_open_tasks', input: {} },
    ];
    const { agent, calls } = makeAgent({ errors: new Set(['get_matter']) });
    const { prisma } = makePrisma(steps);
    const svc = new AiWorkflowService(prisma as never, agent);

    const res = await svc.run(user, 'wf1', false);

    expect(res.status).toBe('failed');
    expect(calls.map((c) => c.name)).toEqual(['search_matters', 'get_matter']);
    expect(res.stepResults).toHaveLength(2);
  });

  it('rechaza crear un flujo con una tool que no existe en el catálogo', async () => {
    const { agent } = makeAgent({});
    const { prisma } = makePrisma([]);
    const svc = new AiWorkflowService(prisma as never, agent);

    await expect(
      svc.create(user, { name: 'Malo', steps: [{ tool: 'no_existe', input: {} }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('instala una plantilla → crea un AiWorkflow válido con sus pasos', async () => {
    const { agent } = makeAgent({});
    const created: { name: string; steps: unknown }[] = [];
    const prisma = {
      aiWorkflow: {
        create: jest.fn(async ({ data }: { data: { name: string; steps: unknown } }) => {
          created.push(data);
          return { id: 'wf-new', name: data.name };
        }),
      },
    };
    const svc = new AiWorkflowService(prisma as never, agent);

    // La primera plantilla del catálogo (onboarding) debe instalarse sin problemas.
    const res = await svc.installTemplate(user, 'onboarding-cliente-completo');

    expect(res).toEqual({ id: 'wf-new', name: 'Onboarding de cliente completo' });
    expect(created).toHaveLength(1);
    // Los pasos se copian y quedan referenciando tools del catálogo (normalizeSteps no lanzó).
    expect((created[0]?.steps as unknown[]).length).toBeGreaterThan(0);
  });

  it('lanza NotFound al instalar una plantilla inexistente', async () => {
    const { agent } = makeAgent({});
    const svc = new AiWorkflowService({} as never, agent);
    await expect(svc.installTemplate(user, 'no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('dry-run: ejecuta las lecturas y se DETIENE ante la primera escritura (sin ejecutarla)', async () => {
    const { agent, calls } = makeAgent({ writeTools: new Set(['create_task']) });
    const svc = new AiWorkflowService({} as never, agent);

    const res = await svc.dryRun(user, [
      { tool: 'search_matters', input: { query: 'Acme' } },
      { tool: 'firm_overview', input: {} },
      { tool: 'create_task', input: { title: 'X' } },
      { tool: 'list_open_tasks', input: {} },
    ]);

    expect(res.status).toBe('requires_confirmation');
    // Solo se EJECUTARON las lecturas; la escritura NUNCA se invocó (el paso posterior tampoco).
    expect(calls.map((c) => c.name)).toEqual(['search_matters', 'firm_overview']);
    expect(res.stepResults).toHaveLength(3);
    expect(res.stepResults[2]).toMatchObject({
      tool: 'create_task',
      status: 'requires_confirmation',
    });
    expect(res.pendingWrites).toEqual([
      { action: 'create_task', summary: 'Escritura pendiente: create_task' },
    ]);
  });

  it('dry-run: una lectura con error NO aborta la prueba (sigue hasta la escritura)', async () => {
    const { agent, calls } = makeAgent({
      writeTools: new Set(['create_task']),
      errors: new Set(['get_matter']),
    });
    const svc = new AiWorkflowService({} as never, agent);

    const res = await svc.dryRun(user, [
      { tool: 'get_matter', input: { reference: '<sin rellenar>' } },
      { tool: 'firm_overview', input: {} },
      { tool: 'create_task', input: { title: 'X' } },
    ]);

    // La lectura fallida se anota (failed) pero la prueba continúa y llega a la escritura.
    expect(calls.map((c) => c.name)).toEqual(['get_matter', 'firm_overview']);
    expect(res.stepResults[0]).toMatchObject({ tool: 'get_matter', status: 'failed' });
    expect(res.status).toBe('requires_confirmation');
  });

  it('dry-run: un flujo de solo lectura completa sin detenerse', async () => {
    const { agent, calls } = makeAgent({});
    const svc = new AiWorkflowService({} as never, agent);

    const res = await svc.dryRun(user, [
      { tool: 'firm_overview', input: {} },
      { tool: 'list_open_tasks', input: {} },
    ]);

    expect(res.status).toBe('completed');
    expect(res.pendingWrites).toHaveLength(0);
    expect(calls.map((c) => c.name)).toEqual(['firm_overview', 'list_open_tasks']);
  });
});
