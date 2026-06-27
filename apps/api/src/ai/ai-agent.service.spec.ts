import { AiAgentService } from './ai-agent.service';
import type {
  AiAgentRequest,
  AiAgentResult,
  AiEngine,
  AiToolExecutor,
  AiToolInvocation,
} from '@legalflow/domain';
import type { RequestUser } from '../auth/auth.types';

/**
 * Motor de IA FALSO que simula el protocolo agéntico: invoca el `exec` real del servicio con la lista de
 * herramientas que le pasemos (como haría Claude con tool-use) y guarda la traza. Así probamos el executor
 * (dispatch + tenant-scoping + manejo de errores) sin llamar al proveedor real.
 */
class FakeEngine implements AiEngine {
  lastExec?: AiToolExecutor;
  lastRequest?: AiAgentRequest;

  constructor(private readonly invocations: AiToolInvocation[]) {}

  isEnabled(): boolean {
    return true;
  }
  model(): string {
    return 'fake-model';
  }
  async complete(): Promise<never> {
    throw new Error('no usado');
  }
  async runAgent(req: AiAgentRequest, exec: AiToolExecutor): Promise<AiAgentResult> {
    this.lastExec = exec;
    this.lastRequest = req;
    const steps = [];
    for (const inv of this.invocations) {
      const out = await exec(inv);
      steps.push({
        tool: inv.name,
        input: inv.input,
        output: out.content,
        isError: Boolean(out.isError),
      });
    }
    return {
      text: 'RESPUESTA FINAL',
      steps,
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'fake-model',
      stopReason: 'end_turn',
    };
  }
}

const user = { tenantId: 't1', userId: 'u1', role: 'LAWYER' } as unknown as RequestUser;

function makePrisma() {
  return {
    matter: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    task: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    document: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    client: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeDeps(invocations: AiToolInvocation[]) {
  const prisma = makePrisma();
  const quota = {
    consume: jest.fn().mockResolvedValue(undefined),
    recordUsage: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const tasks = {
    create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'X', dueDate: null }),
  };
  const documents = {
    saveAiDraft: jest.fn().mockResolvedValue({ document: { id: 'doc-1', name: 'Escrito' } }),
  };
  const engine = new FakeEngine(invocations);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const service = new AiAgentService(
    prisma as any,
    quota as any,
    audit as any,
    tasks as any,
    documents as any,
    engine,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { service, prisma, quota, audit, tasks, documents, engine };
}

describe('AiAgentService', () => {
  it('consume cuota, ejecuta el turno y devuelve respuesta + traza + uso contabilizado', async () => {
    const { service, prisma, quota, audit } = makeDeps([
      { name: 'search_matters', input: { query: 'acme' } },
    ]);
    prisma.matter.findMany.mockResolvedValue([
      {
        reference: 'EXP-1',
        title: 'Acme',
        type: 'CIVIL',
        status: 'OPEN',
        client: { name: 'Acme SL' },
      },
    ]);

    const res = await service.run(user, 'busca el expediente de acme');

    expect(quota.consume).toHaveBeenCalledWith(user);
    expect(res.output).toBe('RESPUESTA FINAL');
    expect(res.model).toBe('fake-model');
    expect(res.stopReason).toBe('end_turn');
    expect(res.steps).toEqual([{ tool: 'search_matters', isError: false }]);
    // El coste real (tokens) de TODO el turno se contabiliza para la cuota.
    expect(quota.recordUsage).toHaveBeenCalledWith(user, 100, 50);
    expect(audit.log).toHaveBeenCalledWith(
      user,
      'ai.agent_run',
      'AiUsage',
      expect.any(String),
      expect.objectContaining({ tools: ['search_matters'], steps: 1, stopReason: 'end_turn' }),
    );
  });

  it('acota TODA consulta por tenantId (defensa sobre la RLS)', async () => {
    const { service, prisma } = makeDeps([{ name: 'search_matters', input: { query: 'x' } }]);
    await service.run(user, 'hola');
    const where = prisma.matter.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
  });

  it('search_matters sin coincidencias devuelve count 0', async () => {
    const { service, engine } = makeDeps([]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({ name: 'search_matters', input: {} });
    expect(JSON.parse(out.content)).toMatchObject({ count: 0 });
  });

  it('get_matter sin referencia devuelve error de validación, no consulta', async () => {
    const { service, engine, prisma } = makeDeps([]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({ name: 'get_matter', input: {} });
    expect(JSON.parse(out.content)).toMatchObject({ error: expect.any(String) });
    expect(prisma.matter.findFirst).not.toHaveBeenCalled();
  });

  it('herramienta desconocida se marca como error', async () => {
    const { service, engine } = makeDeps([]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({ name: 'no_existe', input: {} });
    expect(out.isError).toBe(true);
    expect(out.content).toContain('desconocida');
  });

  it('list_open_tasks acotado por expediente filtra por referencia y estado abierto', async () => {
    const { service, engine, prisma } = makeDeps([]);
    prisma.task.findMany.mockResolvedValue([
      {
        title: 'Contestar demanda',
        status: 'TODO',
        dueDate: new Date('2026-07-01T00:00:00Z'),
        matter: { reference: 'EXP-1' },
      },
    ]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({
      name: 'list_open_tasks',
      input: { matterReference: 'EXP-1' },
    });
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.matter).toEqual({ reference: 'EXP-1' });
    expect(JSON.parse(out.content)).toMatchObject({ count: 1, tasks: [{ dueDate: '2026-07-01' }] });
  });

  it('legal_research devuelve fuentes oficiales (ES por defecto) sin tocar la BD', async () => {
    const { service, engine, prisma } = makeDeps([]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({ name: 'legal_research', input: { query: 'despido' } });
    const parsed = JSON.parse(out.content) as {
      jurisdiction: string;
      sources: { source: string }[];
    };
    expect(parsed.jurisdiction).toBe('es');
    expect(parsed.sources.map((s) => s.source)).toEqual(expect.arrayContaining(['BOE']));
    expect(prisma.matter.findFirst).not.toHaveBeenCalled();
  });

  it('legal_research respeta la jurisdicción indicada (do)', async () => {
    const { service, engine } = makeDeps([]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({
      name: 'legal_research',
      input: { query: 'amparo', jurisdiction: 'do' },
    });
    expect((JSON.parse(out.content) as { jurisdiction: string }).jurisdiction).toBe('do');
  });

  it('create_task crea la tarea vía TasksService resolviendo la referencia del expediente', async () => {
    const { service, engine, prisma, tasks } = makeDeps([]);
    prisma.matter.findFirst.mockResolvedValue({ id: 'm-1' });
    tasks.create.mockResolvedValue({
      id: 'task-9',
      title: 'Contestar demanda',
      dueDate: new Date('2026-07-10T00:00:00Z'),
    });
    await service.run(user, 'hola');
    const out = await engine.lastExec!({
      name: 'create_task',
      input: { title: 'Contestar demanda', matterReference: 'EXP-1', dueDate: '2026-07-10' },
    });
    expect(prisma.matter.findFirst).toHaveBeenCalled();
    expect(tasks.create).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ title: 'Contestar demanda', matterId: 'm-1' }),
    );
    expect(JSON.parse(out.content)).toMatchObject({
      created: true,
      taskId: 'task-9',
      dueDate: '2026-07-10',
    });
  });

  it('create_task sin título no escribe', async () => {
    const { service, engine, tasks } = makeDeps([]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({ name: 'create_task', input: {} });
    expect(JSON.parse(out.content)).toMatchObject({ error: expect.any(String) });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('draft_and_save_document guarda el escrito vía DocumentsService resolviendo el expediente', async () => {
    const { service, engine, prisma, documents } = makeDeps([]);
    prisma.matter.findFirst.mockResolvedValue({ id: 'm-1' });
    documents.saveAiDraft.mockResolvedValue({ document: { id: 'doc-9', name: 'Demanda' } });
    await service.run(user, 'hola');
    const out = await engine.lastExec!({
      name: 'draft_and_save_document',
      input: { matterReference: 'EXP-1', title: 'Demanda', content: 'En la ciudad de...' },
    });
    expect(documents.saveAiDraft).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        matterId: 'm-1',
        title: 'Demanda',
        bodyText: 'En la ciudad de...',
      }),
    );
    expect(JSON.parse(out.content)).toMatchObject({ created: true, documentId: 'doc-9' });
  });

  it('draft_and_save_document sin contenido no escribe', async () => {
    const { service, engine, documents } = makeDeps([]);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({
      name: 'draft_and_save_document',
      input: { matterReference: 'EXP-1', title: 'X', content: '   ' },
    });
    expect(JSON.parse(out.content)).toMatchObject({ error: expect.any(String) });
    expect(documents.saveAiDraft).not.toHaveBeenCalled();
  });

  it('create_task con expediente inexistente no escribe', async () => {
    const { service, engine, prisma, tasks } = makeDeps([]);
    prisma.matter.findFirst.mockResolvedValue(null);
    await service.run(user, 'hola');
    const out = await engine.lastExec!({
      name: 'create_task',
      input: { title: 'Algo', matterReference: 'NOPE' },
    });
    expect(JSON.parse(out.content)).toMatchObject({ created: false });
    expect(tasks.create).not.toHaveBeenCalled();
  });
});
