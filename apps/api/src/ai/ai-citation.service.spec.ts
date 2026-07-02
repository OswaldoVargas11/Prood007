import { NotFoundException } from '@nestjs/common';
import { AiCitationService } from './ai-citation.service';
import type { RequestUser } from '../auth/auth.types';

// El texto del documento se simula: así la prueba no depende del extractor real de formatos.
jest.mock('../documents/text-extract', () => ({
  isExtractableMime: () => true,
  extractText: jest.fn(async () => ({
    extractable: true,
    text: 'Preámbulo. La cláusula de no competencia obliga a las partes. Fin.',
  })),
}));

const user = { tenantId: 't1', userId: 'u1', role: 'LAWYER' } as unknown as RequestUser;

function makeService(
  over: {
    documents?: Record<string, jest.Mock>;
    matter?: unknown;
    client?: unknown;
  } = {},
) {
  const prisma = {
    matter: {
      findFirst: jest.fn().mockResolvedValue(over.matter ?? null),
      count: jest.fn().mockResolvedValue(2),
    },
    client: { findFirst: jest.fn().mockResolvedValue(over.client ?? null) },
  };
  const documents = over.documents ?? {
    getOne: jest.fn().mockResolvedValue({
      id: 'doc-1',
      name: 'Contrato.docx',
      matterId: 'm-1',
      versions: [{ storageKey: 'k1', mimeType: 'application/vnd.openxmlformats' }],
    }),
  };
  const storage = { get: jest.fn().mockResolvedValue(Buffer.from('bytes')) };
  const service = new AiCitationService(prisma as never, documents as never, storage as never);
  return { service, prisma, documents, storage };
}

describe('AiCitationService', () => {
  it('cita a documento: PASA por DocumentsService.getOne (permiso/tenant) y localiza el fragmento', async () => {
    const { service, prisma, documents } = makeService({ matter: { reference: 'EXP-1' } });
    const res = await service.resolve(user, 'document', 'doc-1', 'cláusula de no competencia');
    // El control de acceso es el de documentos: getOne acotado por tenant (404 si no le pertenece).
    expect(documents.getOne).toHaveBeenCalledWith(user, 'doc-1');
    expect(res.kind).toBe('document');
    if (res.kind === 'document') {
      expect(res.snippet).toBe('cláusula de no competencia');
      expect(res.matter).toBe('EXP-1');
      expect(res.highlight).not.toBeNull();
      // El resaltado apunta al fragmento dentro del contexto.
      expect(res.context!.slice(res.highlight!.start, res.highlight!.end)).toBe(
        'cláusula de no competencia',
      );
    }
    expect(prisma.matter.findFirst).toHaveBeenCalled();
  });

  it('cita a documento sin acceso: propaga el 404 de getOne (no filtra nada)', async () => {
    const documents = {
      getOne: jest.fn().mockRejectedValue(new NotFoundException('documents.notFound')),
    };
    const { service } = makeService({ documents });
    await expect(service.resolve(user, 'document', 'doc-x', 'q')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('cita a expediente: consulta acotada por tenant y devuelve ficha segura', async () => {
    const { service, prisma } = makeService({
      matter: {
        reference: 'EXP-1',
        title: 'Compraventa',
        type: 'CIVIL',
        status: 'OPEN',
        opposingParty: null,
        court: null,
        caseNumber: null,
        proceduralPhase: null,
        client: { name: 'Acme SL' },
        lawyer: null,
      },
    });
    const res = await service.resolve(user, 'matter', 'EXP-1');
    expect(prisma.matter.findFirst.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(res).toMatchObject({ kind: 'matter', reference: 'EXP-1', client: 'Acme SL' });
  });

  it('cita a expediente inexistente → 404', async () => {
    const { service } = makeService({ matter: null });
    await expect(service.resolve(user, 'matter', 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refId vacío → 404', async () => {
    const { service } = makeService();
    await expect(service.resolve(user, 'matter', '   ')).rejects.toBeInstanceOf(NotFoundException);
  });
});
