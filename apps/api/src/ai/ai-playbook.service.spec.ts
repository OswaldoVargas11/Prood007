import { AiPlaybookService, parsePlaybookVerdict } from './ai-playbook.service';
import { playbookSeedFor } from './ai-playbook.seeds';
import { buildPlaybookReviewPdf } from './ai-playbook-pdf';
import type { RequestUser } from '../auth/auth.types';

/**
 * Tests del MOTOR de revisión por playbook con un contrato fixture y un playbook fixture: detecta la
 * cláusula DESVIADA plantada (responsabilidad ilimitada, deal-breaker) con cita verificada, marca como
 * AUSENTE el tema que el contrato no trata (confidencialidad) sin rellenarlo, y NO alucina en la regla
 * de control que sí se cumple (ley aplicable). Sin BD ni proveedor: Prisma/engine/storage mockeados.
 */

// ── Helpers puros ────────────────────────────────────────────────────────────

describe('AiPlaybook — parsePlaybookVerdict', () => {
  it('acepta el veredicto JSON canónico (desviación con cita)', () => {
    const v = parsePlaybookVerdict(
      '{"outcome": "deviation", "quote": "responderá de forma ilimitada", "analysis": "Se aparta del tope de 12 meses.", "dealBreaker": true, "confidence": "alta"}',
    );
    expect(v).toEqual({
      outcome: 'deviation',
      quote: 'responderá de forma ilimitada',
      analysis: 'Se aparta del tope de 12 meses.',
      dealBreaker: true,
      confidence: 'alta',
    });
  });

  it('tolera vallas markdown alrededor del JSON', () => {
    const v = parsePlaybookVerdict(
      '```json\n{"outcome": "compliant", "quote": "se rige por la legislación española", "analysis": "Coincide.", "dealBreaker": false, "confidence": "alta"}\n```',
    );
    expect(v?.outcome).toBe('compliant');
  });

  it('missing fuerza quote null, dealBreaker false y confianza baja (guardrail "ausente")', () => {
    const v = parsePlaybookVerdict(
      '{"outcome": "missing", "quote": "algo inventado", "analysis": "No aparece.", "dealBreaker": true, "confidence": "alta"}',
    );
    expect(v).toEqual({
      outcome: 'missing',
      quote: null,
      analysis: 'No aparece.',
      dealBreaker: false,
      confidence: 'baja',
    });
  });

  it('rechaza compliant/deviation sin cita o sin análisis (la cita es obligatoria)', () => {
    expect(
      parsePlaybookVerdict(
        '{"outcome": "deviation", "quote": null, "analysis": "x", "dealBreaker": false, "confidence": "alta"}',
      ),
    ).toBeNull();
    expect(
      parsePlaybookVerdict(
        '{"outcome": "compliant", "quote": "x", "analysis": "", "dealBreaker": false, "confidence": "alta"}',
      ),
    ).toBeNull();
  });

  it('dealBreaker solo cuenta en desviaciones (compliant lo ignora)', () => {
    const v = parsePlaybookVerdict(
      '{"outcome": "compliant", "quote": "x", "analysis": "ok", "dealBreaker": true, "confidence": "media"}',
    );
    expect(v?.dealBreaker).toBe(false);
  });

  it('rechaza respuestas que no son JSON o sin outcome válido', () => {
    expect(parsePlaybookVerdict('No lo sé.')).toBeNull();
    expect(parsePlaybookVerdict('{"outcome": "maybe", "quote": "x", "analysis": "x"}')).toBeNull();
  });
});

describe('AiPlaybook — semillas por jurisdicción', () => {
  it('ES y DO tienen reglas completas (tema + posición preferida) y jurisdicción correcta', () => {
    for (const jur of ['es', 'do'] as const) {
      const seed = playbookSeedFor(jur);
      expect(seed.jurisdiction).toBe(jur);
      expect(seed.rules.length).toBeGreaterThanOrEqual(5);
      for (const rule of seed.rules) {
        expect(rule.topic.length).toBeGreaterThan(3);
        expect(rule.preferredText.length).toBeGreaterThan(40);
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(rule.severity);
      }
    }
    // Las referencias legales son las de cada jurisdicción.
    expect(JSON.stringify(playbookSeedFor('es').rules)).toContain('RGPD');
    expect(JSON.stringify(playbookSeedFor('do').rules)).toContain('172-13');
  });
});

// ── Motor con contrato fixture (Prisma/engine/storage mockeados) ────────────

const USER: RequestUser = {
  userId: 'u1',
  tenantId: 't1',
  jurisdiction: 'es' as RequestUser['jurisdiction'],
  email: 'l@x.test',
  roles: ['LAWYER'],
};

/**
 * Contrato fixture: cláusula de responsabilidad DESVIADA plantada (ilimitada, deal-breaker), ley
 * aplicable que CUMPLE la posición del despacho, y SIN cláusula de confidencialidad (tema ausente).
 */
const CONTRACT_TEXT =
  'CONTRATO DE PRESTACIÓN DE SERVICIOS.\n' +
  'CLÁUSULA 7ª. RESPONSABILIDAD. El Prestador responderá de forma ilimitada de cualesquiera daños y ' +
  'perjuicios, directos o indirectos, incluido el lucro cesante, causados al Cliente.\n' +
  'CLÁUSULA 9ª. LEY APLICABLE. Este contrato se rige por la legislación española y las partes se ' +
  'someten a los Juzgados y Tribunales de Madrid.';

interface FindingRow {
  id: string;
  tenantId: string;
  reviewId: string;
  ruleId: string | null;
  topic: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  preferredText: string | null;
  acceptableText: string | null;
  dealBreakers: string | null;
  order: number;
  status: 'PENDING' | 'DONE' | 'FAILED';
  outcome: 'COMPLIANT' | 'DEVIATION' | 'MISSING' | null;
  dealBreaker: boolean;
  analysis: string | null;
  confidence: string | null;
  snippet: string | null;
  charStart: number | null;
  charEnd: number | null;
  context: string | null;
  error: string | null;
  model: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeFinding(id: string, topic: string, extras: Partial<FindingRow> = {}): FindingRow {
  return {
    id,
    tenantId: 't1',
    reviewId: 'r1',
    ruleId: `rule-${id}`,
    topic,
    severity: 'HIGH',
    preferredText: `Posición preferida sobre ${topic}.`,
    acceptableText: null,
    dealBreakers: null,
    order: 0,
    status: 'PENDING',
    outcome: null,
    dealBreaker: false,
    analysis: null,
    confidence: null,
    snippet: null,
    charStart: null,
    charEnd: null,
    context: null,
    error: null,
    model: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extras,
  };
}

interface Harness {
  service: AiPlaybookService;
  findings: Map<string, FindingRow>;
  engineCalls: Array<{ system?: string; content: string; model?: string }>;
  quotaConsumed: { count: number };
  storageGets: { count: number };
}

/**
 * Monta el servicio con un mini-almacén en memoria: una revisión 'r1' sobre 'contrato.txt' con los
 * hallazgos PENDING dados. `engineReply` decide la respuesta del modelo por tema de la regla.
 */
function makeHarness(opts: {
  findings: FindingRow[];
  engineReply: (topic: string) => string;
  quotaLimit?: number;
  docBody?: string;
  docMime?: string;
  locale?: string;
}): Harness {
  const findings = new Map(opts.findings.map((f) => [f.id, f]));
  const review = {
    id: 'r1',
    tenantId: 't1',
    playbookId: 'p1',
    matterId: 'm1',
    documentId: 'd1',
    createdByUserId: 'u1',
    playbookName: 'Playbook servicios',
    documentName: 'contrato.txt',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const prisma = {
    playbookReview: {
      findFirst: jest.fn(async () => review),
    },
    playbookReviewFinding: {
      findMany: jest.fn(async ({ where }: { where: { status?: string } }) =>
        [...findings.values()].filter((f) => !where.status || f.status === where.status),
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<FindingRow> }) => {
          const finding = findings.get(where.id)!;
          Object.assign(finding, data);
          return finding;
        },
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: { status?: string }; data: Partial<FindingRow> }) => {
          let count = 0;
          for (const finding of findings.values()) {
            if (where.status && finding.status !== where.status) continue;
            Object.assign(finding, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
    documentVersion: {
      findFirst: jest.fn(async () => ({
        storageKey: 'key/d1',
        mimeType: opts.docMime ?? 'text/plain',
      })),
    },
    tenant: {
      findUnique: jest.fn(async () => ({ locale: opts.locale ?? 'es' })),
    },
  };

  const storageGets = { count: 0 };
  const storage = {
    get: jest.fn(async () => {
      storageGets.count += 1;
      return Buffer.from(opts.docBody ?? CONTRACT_TEXT, 'utf8');
    }),
  };

  const quotaConsumed = { count: 0 };
  const limit = opts.quotaLimit ?? Infinity;
  const quota = {
    consume: jest.fn(async () => {
      quotaConsumed.count += 1;
      if (quotaConsumed.count > limit) {
        const { HttpException, HttpStatus } = await import('@nestjs/common');
        throw new HttpException('quota', HttpStatus.TOO_MANY_REQUESTS);
      }
    }),
    recordUsage: jest.fn(async () => undefined),
  };

  const engineCalls: Harness['engineCalls'] = [];
  const engine = {
    isEnabled: () => true,
    model: () => 'claude-opus-4-8',
    complete: jest.fn(
      async (req: { system?: string; messages: Array<{ content: string }>; model?: string }) => {
        const content = req.messages[0]!.content;
        engineCalls.push({ system: req.system, content, model: req.model });
        const topic = /- Tema: ([^\n]+)/.exec(content)![1]!;
        return {
          text: opts.engineReply(topic),
          model: 'claude-opus-4-8',
          usage: { inputTokens: 100, outputTokens: 20 },
        };
      },
    ),
    runAgent: jest.fn(),
  };

  const config = { get: jest.fn(() => undefined) };

  const service = new AiPlaybookService(
    prisma as never,
    quota as never,
    engine as never,
    storage as never,
    config as never,
  );
  return { service, findings, engineCalls, quotaConsumed, storageGets };
}

/** Accede a la pasada privada (el disparo público es fire-and-forget vía `kick`). */
async function runPass(service: AiPlaybookService): Promise<void> {
  await (
    service as unknown as { processReview(u: RequestUser, id: string): Promise<void> }
  ).processReview(USER, 'r1');
}

describe('AiPlaybook — motor de revisión', () => {
  it('detecta la cláusula DESVIADA plantada con cita verificada y marca de deal-breaker', async () => {
    const h = makeHarness({
      findings: [
        makeFinding('f1', 'Limitación de responsabilidad', {
          preferredText: 'Responsabilidad limitada a 12 meses de honorarios.',
          dealBreakers: 'Responsabilidad ilimitada de nuestra parte.',
        }),
      ],
      engineReply: () =>
        '{"outcome": "deviation", "quote": "El Prestador responderá de forma ilimitada de cualesquiera daños", "analysis": "El contrato impone responsabilidad ilimitada al prestador, contra el tope de 12 meses del despacho.", "dealBreaker": true, "confidence": "alta"}',
    });
    await runPass(h.service);

    const f = h.findings.get('f1')!;
    expect(f.status).toBe('DONE');
    expect(f.outcome).toBe('DEVIATION');
    expect(f.dealBreaker).toBe(true);
    expect(f.confidence).toBe('alta');
    // La cita es válida: los offsets apuntan al fragmento LITERAL del texto extraído.
    expect(CONTRACT_TEXT.slice(f.charStart!, f.charEnd!)).toBe(f.snippet);
    expect(f.context).toContain(f.snippet!);
    // La redacción alternativa sugerida (posición preferida) sigue intacta en el snapshot.
    expect(f.preferredText).toBe('Responsabilidad limitada a 12 meses de honorarios.');
    expect(f.model).toBe('claude-opus-4-8');
  });

  it('regla de CONTROL que el contrato cumple → COMPLIANT con cita verificada (no alucina desviación)', async () => {
    const h = makeHarness({
      findings: [
        makeFinding('f2', 'Ley aplicable y jurisdicción', {
          preferredText: 'Ley española y tribunales de Madrid.',
        }),
      ],
      engineReply: () =>
        '{"outcome": "compliant", "quote": "se rige por la legislación española y las partes se someten a los Juzgados y Tribunales de Madrid", "analysis": "Coincide con la posición del despacho.", "dealBreaker": false, "confidence": "alta"}',
    });
    await runPass(h.service);

    const f = h.findings.get('f2')!;
    expect(f.status).toBe('DONE');
    expect(f.outcome).toBe('COMPLIANT');
    expect(f.dealBreaker).toBe(false);
    expect(CONTRACT_TEXT.slice(f.charStart!, f.charEnd!)).toBe(f.snippet);
  });

  it('tema AUSENTE (confidencialidad) → MISSING sin cita y confianza baja (se reporta, no se rellena)', async () => {
    const h = makeHarness({
      findings: [makeFinding('f3', 'Confidencialidad')],
      engineReply: () =>
        '{"outcome": "missing", "quote": null, "analysis": "El contrato no contiene cláusula de confidencialidad.", "dealBreaker": false, "confidence": "alta"}',
    });
    await runPass(h.service);

    const f = h.findings.get('f3')!;
    expect(f.status).toBe('DONE');
    expect(f.outcome).toBe('MISSING');
    expect(f.snippet).toBeNull();
    expect(f.charStart).toBeNull();
    expect(f.confidence).toBe('baja');
    expect(f.dealBreaker).toBe(false);
  });

  it('cita alucinada (no aparece en el texto) → FAILED citationNotFound, sin persistir veredicto', async () => {
    const h = makeHarness({
      findings: [makeFinding('f4', 'Limitación de responsabilidad')],
      engineReply: () =>
        '{"outcome": "deviation", "quote": "la responsabilidad se limita a un millón de euros", "analysis": "x", "dealBreaker": false, "confidence": "alta"}',
    });
    await runPass(h.service);

    const f = h.findings.get('f4')!;
    expect(f.status).toBe('FAILED');
    expect(f.error).toBe('citationNotFound');
    expect(f.outcome).toBeNull();
    expect(f.snippet).toBeNull();
  });

  it('documento no extraíble (PDF) → FAILED notExtractable sin llamar al modelo', async () => {
    const h = makeHarness({
      findings: [makeFinding('f5', 'Confidencialidad')],
      engineReply: () => '{}',
      docMime: 'application/pdf',
      docBody: '%PDF',
    });
    await runPass(h.service);

    const f = h.findings.get('f5')!;
    expect(f.status).toBe('FAILED');
    expect(f.error).toBe('notExtractable');
    expect(h.engineCalls).toHaveLength(0);
    expect(h.quotaConsumed.count).toBe(0);
  });

  it('cuota agotada a mitad → hallazgos restantes FAILED quotaExceeded (relanzables)', async () => {
    const h = makeHarness({
      findings: [
        makeFinding('f6', 'Ley aplicable y jurisdicción'),
        makeFinding('f7', 'Limitación de responsabilidad', { order: 1 }),
      ],
      engineReply: () =>
        '{"outcome": "compliant", "quote": "se rige por la legislación española", "analysis": "ok", "dealBreaker": false, "confidence": "media"}',
      quotaLimit: 1,
    });
    await runPass(h.service);

    const states = [...h.findings.values()].map((f) => `${f.status}:${f.error ?? ''}`).sort();
    expect(states).toContain('DONE:');
    expect(states).toContain('FAILED:quotaExceeded');
  });

  it('cachea el texto del contrato: N reglas = 1 sola descarga; la salida se pide en el idioma del tenant', async () => {
    const h = makeHarness({
      findings: [
        makeFinding('f8', 'Ley aplicable y jurisdicción'),
        makeFinding('f9', 'Limitación de responsabilidad', { order: 1 }),
      ],
      engineReply: (topic) =>
        topic === 'Ley aplicable y jurisdicción'
          ? '{"outcome": "compliant", "quote": "se rige por la legislación española", "analysis": "ok", "dealBreaker": false, "confidence": "alta"}'
          : '{"outcome": "deviation", "quote": "responderá de forma ilimitada", "analysis": "se aparta", "dealBreaker": true, "confidence": "alta"}',
    });
    await runPass(h.service);

    expect([...h.findings.values()].every((f) => f.status === 'DONE')).toBe(true);
    expect(h.engineCalls).toHaveLength(2);
    expect(h.storageGets.count).toBe(1);
    // El guardrail anti-invención viaja en el system prompt y el idioma en el mensaje de usuario.
    expect(h.engineCalls.every((c) => c.system?.includes('"missing"'))).toBe(true);
    expect(h.engineCalls.every((c) => c.content.includes('Redacta "analysis" en español'))).toBe(
      true,
    );
  });
});

describe('AiPlaybook — informe PDF', () => {
  it('genera un PDF válido con veredictos, citas y redacción sugerida', async () => {
    const buffer = await buildPlaybookReviewPdf({
      firmName: 'Despacho Demo',
      firmTaxId: 'B12345678',
      playbookName: 'Playbook servicios',
      documentName: 'contrato.txt',
      matterReference: 'EXP-2026-0001',
      matterTitle: 'Asunto demo',
      generatedAt: new Date('2026-07-02T12:00:00Z'),
      findings: [
        {
          topic: 'Limitación de responsabilidad',
          severity: 'HIGH',
          preferredText: 'Responsabilidad limitada a 12 meses.',
          status: 'DONE',
          outcome: 'DEVIATION',
          dealBreaker: true,
          analysis: 'Responsabilidad ilimitada del prestador.',
          confidence: 'alta',
          snippet: 'El Prestador responderá de forma ilimitada',
        },
        {
          topic: 'Confidencialidad',
          severity: 'MEDIUM',
          preferredText: 'Confidencialidad mutua 3 años.',
          status: 'DONE',
          outcome: 'MISSING',
          dealBreaker: false,
          analysis: 'No hay cláusula de confidencialidad.',
          confidence: 'baja',
          snippet: null,
        },
      ],
    });
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
