import { AiWorkflowService } from './ai-workflow.service';
import { WORKFLOW_TEMPLATES } from './ai-workflow.templates';
import { AGENT_TOOLS } from './ai-agent.tools';
import { isWriteToolName } from './ai-agent.service';
import type { AiAgentService, PendingWrite } from './ai-agent.service';
import type { AiToolInvocation, AiToolOutcome } from '@legalflow/domain';
import type { RequestUser } from '../auth/auth.types';

/**
 * Verifica la BIBLIOTECA de plantillas (integridad del catálogo, sin BD): (1) cada plantilla referencia
 * SOLO tools existentes; (2) el dry-run de CADA plantilla ejecuta las lecturas y se detiene ante la primera
 * escritura (o completa si es de solo lectura) — el criterio "cada plantilla pasa el dry-run". El agente se
 * mockea; la clasificación lectura/escritura usa la REAL (`isWriteToolName`), así que la prueba refleja el
 * comportamiento real del gate HITL sin tocar BD ni proveedor de IA.
 */

const user = { tenantId: 't1', userId: 'u1', roles: ['LAWYER'] } as unknown as RequestUser;
const KNOWN_TOOLS = new Set(AGENT_TOOLS.map((t) => t.name));

/** Agente falso: clasificación lectura/escritura REAL; las lecturas devuelven ok. */
function fakeAgent(): { agent: AiAgentService; calls: AiToolInvocation[] } {
  const calls: AiToolInvocation[] = [];
  const agent = {
    isWriteTool: (name: string) => isWriteToolName(name),
    executeTool: async (
      _u: RequestUser,
      inv: AiToolInvocation,
    ): Promise<{ outcome: AiToolOutcome; pendingWrites: PendingWrite[] }> => {
      calls.push(inv);
      return { outcome: { content: `ok:${inv.name}` }, pendingWrites: [] };
    },
  } as unknown as AiAgentService;
  return { agent, calls };
}

describe('WORKFLOW_TEMPLATES (biblioteca de plantillas)', () => {
  it('hay entre 15 y 20 plantillas con claves únicas', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(15);
    expect(WORKFLOW_TEMPLATES.length).toBeLessThanOrEqual(20);
    const keys = WORKFLOW_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cada paso de cada plantilla referencia una tool EXISTENTE del catálogo', () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      expect(tpl.steps.length).toBeGreaterThan(0);
      for (const step of tpl.steps) {
        expect(KNOWN_TOOLS.has(step.tool)).toBe(true);
      }
    }
  });

  it('en cada plantilla las LECTURAS preceden a las escrituras (no hay lecturas tras la 1ª escritura)', () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      const firstWrite = tpl.steps.findIndex((s) => isWriteToolName(s.tool));
      if (firstWrite === -1) continue;
      const after = tpl.steps.slice(firstWrite + 1);
      // Tras la primera escritura puede haber más escrituras, pero NO lecturas (que quedarían sin ejecutar).
      expect(after.every((s) => isWriteToolName(s.tool))).toBe(true);
    }
  });

  it.each(WORKFLOW_TEMPLATES.map((t) => [t.key, t] as const))(
    'dry-run de "%s": ejecuta lecturas y se detiene ante la 1ª escritura',
    async (_key, tpl) => {
      const { agent, calls } = fakeAgent();
      const svc = new AiWorkflowService({} as never, agent);

      const res = await svc.dryRun(user, tpl.steps);

      const firstWrite = tpl.steps.findIndex((s) => isWriteToolName(s.tool));
      if (firstWrite === -1) {
        // Solo lectura: completa y ejecuta todos los pasos.
        expect(res.status).toBe('completed');
        expect(calls.length).toBe(tpl.steps.length);
      } else {
        // Se detiene en la escritura: solo se ejecutaron las lecturas previas.
        expect(res.status).toBe('requires_confirmation');
        expect(calls.length).toBe(firstWrite);
        expect(calls.every((c) => !isWriteToolName(c.name))).toBe(true);
        expect(res.stepResults[firstWrite]).toMatchObject({ status: 'requires_confirmation' });
      }
    },
  );
});
