import JSZip from 'jszip';
import { AiTabularService, locateQuote, parseExtractionResponse } from './ai-tabular.service';
import { buildXlsx, columnRef, toCsv } from './ai-tabular.export';
import type { RequestUser } from '../auth/auth.types';

/**
 * Tests del MOTOR de revisión tabular con documentos fixture: extracción correcta con cita verificada,
 * guardrail "no consta" (doc de control sin la respuesta), cita alucinada → FAILED (nunca se persiste un
 * valor sin ancla comprobada) y agotamiento de cuota. Sin BD ni proveedor: Prisma/engine/storage mockeados.
 */

// ── Helpers puros ────────────────────────────────────────────────────────────

describe('AiTabular — parseExtractionResponse', () => {
  it('acepta la respuesta JSON canónica', () => {
    const r = parseExtractionResponse(
      '{"found": true, "value": "31/12/2027", "quote": "vigencia hasta el 31 de diciembre de 2027", "confidence": "alta"}',
    );
    expect(r).toEqual({
      found: true,
      value: '31/12/2027',
      quote: 'vigencia hasta el 31 de diciembre de 2027',
      confidence: 'alta',
    });
  });

  it('tolera vallas markdown alrededor del JSON', () => {
    const r = parseExtractionResponse(
      '```json\n{"found": false, "value": null, "quote": null, "confidence": "media"}\n```',
    );
    expect(r).toEqual({ found: false, value: null, quote: null, confidence: 'baja' });
  });

  it('fuerza confianza baja cuando found=false (guardrail "no consta")', () => {
    const r = parseExtractionResponse(
      '{"found": false, "value": null, "quote": null, "confidence": "alta"}',
    );
    expect(r?.confidence).toBe('baja');
  });

  it('rechaza found=true sin cita (la cita es obligatoria)', () => {
    expect(
      parseExtractionResponse(
        '{"found": true, "value": "algo", "quote": null, "confidence": "alta"}',
      ),
    ).toBeNull();
    expect(
      parseExtractionResponse('{"found": true, "value": "", "quote": "x", "confidence": "alta"}'),
    ).toBeNull();
  });

  it('rechaza respuestas que no son JSON', () => {
    expect(parseExtractionResponse('No lo sé.')).toBeNull();
    expect(parseExtractionResponse('{found: sí}')).toBeNull();
  });
});

describe('AiTabular — locateQuote', () => {
  const text =
    'CLÁUSULA 5ª. DURACIÓN.\nEl presente contrato estará vigente\nhasta el 31 de diciembre de 2027.';

  it('localiza una cita exacta y devuelve offsets reales', () => {
    const span = locateQuote(text, 'hasta el 31 de diciembre de 2027');
    expect(span).not.toBeNull();
    expect(text.slice(span!.start, span!.end)).toBe('hasta el 31 de diciembre de 2027');
  });

  it('tolera espacios colapsados (el modelo aplana saltos de línea)', () => {
    const span = locateQuote(text, 'estará vigente hasta el 31 de diciembre');
    expect(span).not.toBeNull();
    expect(text.slice(span!.start, span!.end)).toBe('estará vigente\nhasta el 31 de diciembre');
  });

  it('devuelve null si la cita no aparece en el texto (anti-alucinación)', () => {
    expect(locateQuote(text, 'la renta se actualizará con el IPC')).toBeNull();
    expect(locateQuote(text, '')).toBeNull();
  });
});

describe('AiTabular — export', () => {
  const table = {
    title: 'Due diligence',
    headers: ['Documento', 'Ley aplicable', 'Notas, varias'],
    rows: [['contrato "A".docx', 'España', 'línea1\nlínea2']],
  };

  it('genera CSV con BOM, escapando comillas, comas y saltos', () => {
    const csv = toCsv(table);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Notas, varias"');
    expect(csv).toContain('"contrato ""A"".docx"');
    expect(csv).toContain('"línea1\nlínea2"');
  });

  it('columnRef produce referencias de hoja de cálculo', () => {
    expect(columnRef(0)).toBe('A');
    expect(columnRef(25)).toBe('Z');
    expect(columnRef(26)).toBe('AA');
  });

  it('genera un XLSX abrible con la hoja y los valores', async () => {
    const buffer = await buildXlsx(table);
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK');
    const zip = await JSZip.loadAsync(buffer);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toContain('Ley aplicable');
    expect(sheet).toContain('España');
  });
});

// ── Motor con documentos fixture (Prisma/engine/storage mockeados) ──────────

const USER: RequestUser = {
  userId: 'u1',
  tenantId: 't1',
  jurisdiction: 'es' as RequestUser['jurisdiction'],
  email: 'l@x.test',
  roles: ['LAWYER'],
};

/** Contrato fixture: contiene ley aplicable y duración. */
const CONTRACT_TEXT =
  'CONTRATO DE PRESTACIÓN DE SERVICIOS.\n' +
  'CLÁUSULA 5ª. DURACIÓN. El presente contrato estará vigente hasta el 31 de diciembre de 2027.\n' +
  'CLÁUSULA 9ª. LEY APLICABLE. Este contrato se rige por la legislación española.';

/** Documento de CONTROL: no contiene ni ley aplicable ni fechas (acta de una reunión). */
const CONTROL_TEXT =
  'ACTA DE REUNIÓN. Asistentes: ambas partes. Se revisó el estado del proyecto y se acordó ' +
  'convocar una nueva sesión de seguimiento. Sin más asuntos que tratar, se levanta la sesión.';

interface CellRow {
  id: string;
  tenantId: string;
  reviewId: string;
  documentId: string;
  columnId: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  value: string | null;
  notFound: boolean;
  confidence: string | null;
  snippet: string | null;
  charStart: number | null;
  charEnd: number | null;
  page: number | null;
  context: string | null;
  error: string | null;
  model: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeCell(id: string, documentId: string, columnId: string): CellRow {
  return {
    id,
    tenantId: 't1',
    reviewId: 'r1',
    documentId,
    columnId,
    status: 'PENDING',
    value: null,
    notFound: false,
    confidence: null,
    snippet: null,
    charStart: null,
    charEnd: null,
    page: null,
    context: null,
    error: null,
    model: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

interface Harness {
  service: AiTabularService;
  cells: Map<string, CellRow>;
  engineCalls: Array<{ system?: string; content: string; model?: string }>;
  quotaConsumed: { count: number };
  usage: Array<{ input: number; output: number }>;
}

/**
 * Monta el servicio con un mini-almacén en memoria: una revisión 'r1' con las columnas/documentos dados
 * y celdas PENDING. `engineReply` decide la respuesta del modelo por (documento, columna).
 */
function makeHarness(opts: {
  columns: Array<{ id: string; label: string }>;
  docs: Array<{ id: string; source: string; name: string; mime: string; body: string }>;
  cells: CellRow[];
  engineReply: (doc: string, column: string) => string;
  quotaLimit?: number;
}): Harness {
  const cells = new Map(opts.cells.map((c) => [c.id, c]));
  const review = {
    id: 'r1',
    tenantId: 't1',
    matterId: 'm1',
    createdByUserId: 'u1',
    title: 'Revisión',
    columns: opts.columns,
    documents: opts.docs.map(({ id, source, name }) => ({ id, source, name })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const docsById = new Map(opts.docs.map((d) => [d.id, d]));

  const prisma = {
    tabularReview: {
      findFirst: jest.fn(async () => review),
    },
    tabularReviewCell: {
      findMany: jest.fn(async ({ where }: { where: { status?: string } }) =>
        [...cells.values()].filter((c) => !where.status || c.status === where.status),
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<CellRow> }) => {
          const cell = cells.get(where.id)!;
          Object.assign(cell, data);
          return cell;
        },
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: { status?: string }; data: Partial<CellRow> }) => {
          let count = 0;
          for (const cell of cells.values()) {
            if (where.status && cell.status !== where.status) continue;
            Object.assign(cell, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
    documentVersion: {
      findFirst: jest.fn(async ({ where }: { where: { documentId: string } }) => {
        const doc = docsById.get(where.documentId);
        return doc && doc.source === 'document'
          ? { storageKey: `key/${doc.id}`, mimeType: doc.mime }
          : null;
      }),
    },
    dataRoomDocument: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const doc = docsById.get(where.id);
        return doc && doc.source === 'dataroom'
          ? { storageKey: `key/${doc.id}`, mimeType: doc.mime }
          : null;
      }),
    },
  };

  const storage = {
    get: jest.fn(async (key: string) => {
      const doc = [...docsById.values()].find((d) => `key/${d.id}` === key)!;
      return Buffer.from(doc.body, 'utf8');
    }),
  };

  const quotaConsumed = { count: 0 };
  const usage: Array<{ input: number; output: number }> = [];
  const limit = opts.quotaLimit ?? Infinity;
  const quota = {
    consume: jest.fn(async () => {
      quotaConsumed.count += 1;
      if (quotaConsumed.count > limit) {
        const { HttpException, HttpStatus } = await import('@nestjs/common');
        throw new HttpException('quota', HttpStatus.TOO_MANY_REQUESTS);
      }
    }),
    recordUsage: jest.fn(async (_u: unknown, input: number, output: number) => {
      usage.push({ input, output });
    }),
  };

  const engineCalls: Harness['engineCalls'] = [];
  const engine = {
    isEnabled: () => true,
    model: () => 'claude-opus-4-8',
    complete: jest.fn(
      async (req: { system?: string; messages: Array<{ content: string }>; model?: string }) => {
        const content = req.messages[0]!.content;
        engineCalls.push({ system: req.system, content, model: req.model });
        const doc = /Documento: ([^\n]+)/.exec(content)![1]!;
        const column = /Columna a extraer: ([^\n]+)/.exec(content)![1]!;
        return {
          text: opts.engineReply(doc, column),
          model: 'claude-opus-4-8',
          usage: { inputTokens: 100, outputTokens: 20 },
        };
      },
    ),
    runAgent: jest.fn(),
  };

  const config = { get: jest.fn(() => undefined) };

  const service = new AiTabularService(
    prisma as never,
    quota as never,
    engine as never,
    storage as never,
    config as never,
  );
  return { service, cells, engineCalls, quotaConsumed, usage };
}

/** Accede a la pasada privada (el disparo público es fire-and-forget vía `kick`). */
async function runPass(service: AiTabularService): Promise<void> {
  await (
    service as unknown as { processReview(u: RequestUser, id: string): Promise<void> }
  ).processReview(USER, 'r1');
}

describe('AiTabular — motor de extracción', () => {
  const columns = [
    { id: 'col_ley', label: 'Ley aplicable' },
    { id: 'col_fecha', label: 'Fecha de vencimiento' },
  ];

  it('extrae el dato con cita verificada (offsets reales sobre el texto extraído)', async () => {
    const h = makeHarness({
      columns: [columns[0]!],
      docs: [
        {
          id: 'd1',
          source: 'document',
          name: 'contrato.txt',
          mime: 'text/plain',
          body: CONTRACT_TEXT,
        },
      ],
      cells: [makeCell('c1', 'd1', 'col_ley')],
      engineReply: () =>
        '{"found": true, "value": "Legislación española", "quote": "se rige por la legislación española", "confidence": "alta"}',
    });
    await runPass(h.service);

    const cell = h.cells.get('c1')!;
    expect(cell.status).toBe('DONE');
    expect(cell.value).toBe('Legislación española');
    expect(cell.notFound).toBe(false);
    expect(cell.confidence).toBe('alta');
    // La cita es válida: los offsets apuntan al fragmento LITERAL del texto extraído.
    expect(cell.snippet).toBe('se rige por la legislación española');
    expect(CONTRACT_TEXT.slice(cell.charStart!, cell.charEnd!)).toBe(cell.snippet);
    // Y el contexto contiene la cita (para resaltarla en el panel sin re-extraer).
    expect(cell.context).toContain(cell.snippet!);
    expect(cell.model).toBe('claude-opus-4-8');
    // Cuota respetada: consume antes + tokens reales después.
    expect(h.quotaConsumed.count).toBe(1);
    expect(h.usage).toEqual([{ input: 100, output: 20 }]);
  });

  it('doc de control sin la respuesta → "no consta" con confianza baja (nunca inventa)', async () => {
    const h = makeHarness({
      columns: [columns[1]!],
      docs: [
        { id: 'd2', source: 'document', name: 'acta.txt', mime: 'text/plain', body: CONTROL_TEXT },
      ],
      cells: [makeCell('c2', 'd2', 'col_fecha')],
      engineReply: () => '{"found": false, "value": null, "quote": null, "confidence": "baja"}',
    });
    await runPass(h.service);

    const cell = h.cells.get('c2')!;
    expect(cell.status).toBe('DONE');
    expect(cell.notFound).toBe(true);
    expect(cell.value).toBeNull();
    expect(cell.confidence).toBe('baja');
    expect(cell.snippet).toBeNull();
  });

  it('cita alucinada (no aparece en el texto) → FAILED citationNotFound, sin persistir el valor', async () => {
    const h = makeHarness({
      columns: [columns[1]!],
      docs: [
        { id: 'd3', source: 'document', name: 'acta.txt', mime: 'text/plain', body: CONTROL_TEXT },
      ],
      cells: [makeCell('c3', 'd3', 'col_fecha')],
      engineReply: () =>
        '{"found": true, "value": "31/12/2030", "quote": "vencerá el 31 de diciembre de 2030", "confidence": "alta"}',
    });
    await runPass(h.service);

    const cell = h.cells.get('c3')!;
    expect(cell.status).toBe('FAILED');
    expect(cell.error).toBe('citationNotFound');
    expect(cell.value).toBeNull();
  });

  it('documento no extraíble (PDF) → FAILED notExtractable sin llamar al modelo', async () => {
    const h = makeHarness({
      columns: [columns[0]!],
      docs: [
        {
          id: 'd4',
          source: 'dataroom',
          name: 'escaneado.pdf',
          mime: 'application/pdf',
          body: '%PDF',
        },
      ],
      cells: [makeCell('c4', 'd4', 'col_ley')],
      engineReply: () => '{}',
    });
    await runPass(h.service);

    const cell = h.cells.get('c4')!;
    expect(cell.status).toBe('FAILED');
    expect(cell.error).toBe('notExtractable');
    expect(h.engineCalls).toHaveLength(0);
    expect(h.quotaConsumed.count).toBe(0);
  });

  it('cuota agotada a mitad → celdas restantes FAILED quotaExceeded (relanzables)', async () => {
    const h = makeHarness({
      columns,
      docs: [
        {
          id: 'd5',
          source: 'document',
          name: 'contrato.txt',
          mime: 'text/plain',
          body: CONTRACT_TEXT,
        },
      ],
      cells: [makeCell('c5', 'd5', 'col_ley'), makeCell('c6', 'd5', 'col_fecha')],
      engineReply: () =>
        '{"found": true, "value": "x", "quote": "legislación española", "confidence": "media"}',
      quotaLimit: 1,
    });
    await runPass(h.service);

    const states = [...h.cells.values()].map((c) => `${c.status}:${c.error ?? ''}`).sort();
    expect(states).toContain('DONE:');
    expect(states).toContain('FAILED:quotaExceeded');
  });

  it('cachea el texto por documento: N columnas = 1 sola descarga del almacén', async () => {
    const h = makeHarness({
      columns,
      docs: [
        {
          id: 'd7',
          source: 'document',
          name: 'contrato.txt',
          mime: 'text/plain',
          body: CONTRACT_TEXT,
        },
      ],
      cells: [makeCell('c7', 'd7', 'col_ley'), makeCell('c8', 'd7', 'col_fecha')],
      engineReply: (_doc, column) =>
        column === 'Ley aplicable'
          ? '{"found": true, "value": "España", "quote": "legislación española", "confidence": "alta"}'
          : '{"found": true, "value": "31/12/2027", "quote": "hasta el 31 de diciembre de 2027", "confidence": "alta"}',
    });
    await runPass(h.service);

    expect([...h.cells.values()].every((c) => c.status === 'DONE')).toBe(true);
    expect(h.engineCalls).toHaveLength(2);
    // El guardrail viaja en el system prompt de TODAS las llamadas.
    expect(h.engineCalls.every((c) => c.system?.includes('"found": false'))).toBe(true);
  });
});
