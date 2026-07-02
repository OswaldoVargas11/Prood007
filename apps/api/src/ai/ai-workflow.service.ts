import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@legalflow/domain';
import { PrismaService } from '../prisma/prisma.service';
import { apiError } from '../common/api-messages';
import { AiAgentService } from './ai-agent.service';
import { AGENT_TOOLS } from './ai-agent.tools';
import { WORKFLOW_TEMPLATES } from './ai-workflow.templates';
import type { PendingWrite } from './ai-agent.service';
import type { RequestUser } from '../auth/auth.types';

const STAFF_ROLES = [Role.FIRM_ADMIN, Role.LAWYER];
/** Máximo de flujos que se listan. */
const LIST_LIMIT = 100;
/** Nombres de herramientas válidas del catálogo (para validar los pasos al crear/lanzar). */
const KNOWN_TOOLS = new Set(AGENT_TOOLS.map((t) => t.name));

/** Un paso declarativo de un workflow: invoca una tool del catálogo por nombre + input. */
export interface WorkflowStep {
  tool: string;
  input: Record<string, unknown>;
}

/** Resultado de ejecutar un paso (traza persistida en el run). */
export interface WorkflowStepResult {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  /** 'completed' | 'failed' | 'requires_confirmation' (paso de escritura sin confirmar). */
  status: 'completed' | 'failed' | 'requires_confirmation';
}

type RunStatus = 'completed' | 'failed' | 'requires_confirmation';

/**
 * Constructor y motor de FLUJOS agénticos multi-paso (Zora workflows builder, LAW-22). Un workflow es una
 * definición declarativa de pasos ordenados; cada paso invoca una herramienta del catálogo del agente
 * (`AGENT_TOOLS`) por nombre + input. La ejecución es SECUENCIAL y reutiliza `AiAgentService.executeTool`
 * (misma fuente de verdad de dispatch + gate HITL): si un paso es de ESCRITURA y no se concedió
 * `allowWrites`, el flujo se DETIENE en ese paso (status 'requires_confirmation') y expone los
 * `pendingWrites` para que el letrado confirme y lo relance con `allowWrites=true`.
 *
 * Solo staff (FIRM_ADMIN/LAWYER); los clientes nunca usan la IA. Aislamiento por tenant (RLS) + acotado
 * por `tenantId` en cada consulta. El workflow es COMPARTIDO por el despacho (activo reutilizable), no
 * privado por usuario.
 */
@Injectable()
export class AiWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AiAgentService,
  ) {}

  private assertStaff(user: RequestUser): void {
    if (!user.roles.some((r) => STAFF_ROLES.includes(r as Role))) {
      throw new ForbiddenException(apiError('auth.forbidden'));
    }
  }

  /** Valida y normaliza los pasos: cada uno debe referenciar una tool conocida del catálogo. */
  private normalizeSteps(
    steps: { tool: string; input?: Record<string, unknown> }[],
  ): WorkflowStep[] {
    return steps.map((s) => {
      if (!KNOWN_TOOLS.has(s.tool)) {
        throw new BadRequestException(
          apiError('ai.unknownWorkflowTool', { params: { tool: s.tool } }),
        );
      }
      return { tool: s.tool, input: s.input ?? {} };
    });
  }

  /** Catálogo de herramientas disponibles para el builder (nombre + descripción + si es de escritura). */
  catalog(user: RequestUser) {
    this.assertStaff(user);
    return this.agent.toolCatalog();
  }

  /** Biblioteca de plantillas instalables (global, no por tenant). Solo staff con IA. */
  templates(user: RequestUser) {
    this.assertStaff(user);
    return WORKFLOW_TEMPLATES;
  }

  /**
   * INSTALA una plantilla: copia sus pasos a un `AiWorkflow` del despacho (queda editable después). Revalida
   * que cada paso referencie una tool del catálogo (una plantilla podría quedar obsoleta si el catálogo
   * cambia). Devuelve el id del nuevo flujo.
   */
  async installTemplate(user: RequestUser, key: string) {
    this.assertStaff(user);
    const tpl = WORKFLOW_TEMPLATES.find((t) => t.key === key);
    if (!tpl) throw new NotFoundException(apiError('ai.workflowTemplateNotFound'));
    const steps = this.normalizeSteps(tpl.steps);
    const wf = await this.prisma.aiWorkflow.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.userId,
        name: tpl.name,
        description: tpl.description,
        steps: steps as unknown as object,
      },
      select: { id: true, name: true },
    });
    return { id: wf.id, name: wf.name };
  }

  /** Lista los flujos del despacho por actividad reciente. */
  async list(user: RequestUser) {
    this.assertStaff(user);
    const wfs = await this.prisma.aiWorkflow.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
      select: { id: true, name: true, description: true, steps: true, updatedAt: true },
    });
    return wfs.map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      steps: w.steps as unknown as WorkflowStep[],
      updatedAt: w.updatedAt.toISOString(),
    }));
  }

  /** Devuelve un flujo del despacho por id. */
  async get(user: RequestUser, id: string) {
    this.assertStaff(user);
    const wf = await this.prisma.aiWorkflow.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, name: true, description: true, steps: true, updatedAt: true },
    });
    if (!wf) throw new NotFoundException(apiError('ai.workflowNotFound'));
    return {
      id: wf.id,
      name: wf.name,
      description: wf.description,
      steps: wf.steps as unknown as WorkflowStep[],
      updatedAt: wf.updatedAt.toISOString(),
    };
  }

  /** Crea un flujo. Valida que cada paso referencie una tool del catálogo. */
  async create(
    user: RequestUser,
    dto: {
      name: string;
      description?: string;
      steps: { tool: string; input?: Record<string, unknown> }[];
    },
  ) {
    this.assertStaff(user);
    const steps = this.normalizeSteps(dto.steps);
    const wf = await this.prisma.aiWorkflow.create({
      data: {
        tenantId: user.tenantId,
        createdByUserId: user.userId,
        name: dto.name,
        description: dto.description ?? null,
        steps: steps as unknown as object,
      },
      select: { id: true, name: true },
    });
    return { id: wf.id, name: wf.name };
  }

  /** Actualiza la definición de un flujo. */
  async update(
    user: RequestUser,
    id: string,
    dto: {
      name: string;
      description?: string;
      steps: { tool: string; input?: Record<string, unknown> }[];
    },
  ) {
    this.assertStaff(user);
    const existing = await this.prisma.aiWorkflow.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(apiError('ai.workflowNotFound'));
    const steps = this.normalizeSteps(dto.steps);
    await this.prisma.aiWorkflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? null,
        steps: steps as unknown as object,
      },
    });
    return { id };
  }

  /** Borra un flujo (y en cascada sus runs). */
  async remove(user: RequestUser, id: string) {
    this.assertStaff(user);
    const existing = await this.prisma.aiWorkflow.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(apiError('ai.workflowNotFound'));
    await this.prisma.aiWorkflow.delete({ where: { id } });
    return { id };
  }

  /**
   * EJECUTA un flujo: corre sus pasos en orden encadenando herramientas del catálogo. Respeta el gate HITL:
   * al alcanzar un paso de escritura sin `allowWrites`, se DETIENE (status 'requires_confirmation') y expone
   * los `pendingWrites`. Persiste un `AiWorkflowRun` con la traza. Si un paso devuelve error, se detiene
   * (status 'failed'). Devuelve el resumen del run.
   */
  async run(user: RequestUser, id: string, allowWrites = false) {
    this.assertStaff(user);
    const wf = await this.prisma.aiWorkflow.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, name: true, steps: true },
    });
    if (!wf) throw new NotFoundException(apiError('ai.workflowNotFound'));

    // Re-valida los pasos en cada ejecución: el catálogo pudo cambiar desde que se definió el flujo.
    const steps = this.normalizeSteps(wf.steps as unknown as WorkflowStep[]);

    const stepResults: WorkflowStepResult[] = [];
    const pendingWrites: PendingWrite[] = [];
    let status: RunStatus = 'completed';

    for (const step of steps) {
      const { outcome, pendingWrites: pw } = await this.agent.executeTool(
        user,
        { name: step.tool, input: step.input },
        allowWrites,
      );

      // Gate HITL: la tool de escritura no se ejecutó; se requiere confirmación. Detenemos el flujo aquí
      // (los pasos posteriores podrían depender de esta escritura), exponiendo lo pendiente de confirmar.
      if (pw.length > 0) {
        pendingWrites.push(...pw);
        stepResults.push({
          tool: step.tool,
          input: step.input,
          output: outcome.content,
          isError: false,
          status: 'requires_confirmation',
        });
        status = 'requires_confirmation';
        break;
      }

      const isError = Boolean(outcome.isError);
      stepResults.push({
        tool: step.tool,
        input: step.input,
        output: outcome.content,
        isError,
        status: isError ? 'failed' : 'completed',
      });
      if (isError) {
        status = 'failed';
        break;
      }
    }

    const runRow = await this.prisma.aiWorkflowRun.create({
      data: {
        tenantId: user.tenantId,
        workflowId: wf.id,
        startedByUserId: user.userId,
        status,
        stepResults: stepResults as unknown as object,
        pendingWrites: pendingWrites as unknown as object,
      },
      select: { id: true },
    });

    return {
      runId: runRow.id,
      workflowId: wf.id,
      status,
      stepResults,
      pendingWrites,
    };
  }

  /**
   * DRY-RUN (prueba en seco) de una definición de pasos SIN persistir: ejecuta SOLO los pasos de LECTURA en
   * orden y se DETIENE ante el primer paso de ESCRITURA, que NO se ejecuta (se marca 'requires_confirmation').
   * Sirve para validar el cableado del flujo y previsualizar lo que devuelven las lecturas antes de guardarlo.
   *
   * A diferencia de `run`, un error en una lectura NO aborta la prueba (los marcadores `<...>` sin rellenar
   * pueden hacer que una lectura no encuentre datos): así el dry-run siempre llega a la primera escritura y
   * demuestra dónde está el gate HITL. NO modifica nada: las escrituras nunca se invocan.
   */
  async dryRun(user: RequestUser, rawSteps: { tool: string; input?: Record<string, unknown> }[]) {
    this.assertStaff(user);
    const steps = this.normalizeSteps(rawSteps);

    const stepResults: WorkflowStepResult[] = [];
    const pendingWrites: PendingWrite[] = [];
    let status: RunStatus = 'completed';

    for (const step of steps) {
      // Gate HITL en seco: al alcanzar una escritura, se DETIENE sin ejecutarla (cero efectos secundarios).
      if (this.agent.isWriteTool(step.tool)) {
        stepResults.push({
          tool: step.tool,
          input: step.input,
          output: 'Escritura — la prueba en seco se detiene aquí (no se ejecuta).',
          isError: false,
          status: 'requires_confirmation',
        });
        pendingWrites.push({ action: step.tool, summary: `Escritura pendiente: ${step.tool}` });
        status = 'requires_confirmation';
        break;
      }

      const { outcome } = await this.agent.executeTool(
        user,
        { name: step.tool, input: step.input },
        false,
      );
      const isError = Boolean(outcome.isError);
      // Una lectura fallida (p. ej. marcador sin rellenar) se anota pero NO detiene la prueba.
      stepResults.push({
        tool: step.tool,
        input: step.input,
        output: outcome.content,
        isError,
        status: isError ? 'failed' : 'completed',
      });
    }

    return { status, stepResults, pendingWrites };
  }
}
