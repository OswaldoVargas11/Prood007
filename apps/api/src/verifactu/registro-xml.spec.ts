import { buildRegistroAltaXml, computeHuellaAeat, type RegistroAltaInput } from './registro-xml';

const SISTEMA = {
  nombreRazon: 'Lawzora',
  nif: 'B00000000',
  nombreSistemaInformatico: 'Lawzora',
  idSistemaInformatico: 'LZ',
  version: '1.0',
  numeroInstalacion: 'tenant-1',
};

function baseInput(overrides: Partial<RegistroAltaInput> = {}): RegistroAltaInput {
  return {
    nifEmisor: 'B12345674',
    nombreRazonEmisor: 'Despacho ES SL',
    numSerieFactura: 'FAC-2026-0001',
    fechaExpedicion: '2026-01-15',
    tipoFactura: 'F1',
    descripcionOperacion: 'Prestación de servicios de asistencia jurídica',
    destinatario: { nombreRazon: 'Cliente SA', nif: 'A58818501' },
    desglose: [{ tipoImpositivo: '21.00', baseImponible: '1000.00', cuotaRepercutida: '210.00' }],
    cuotaTotal: '210.00',
    importeTotal: '1210.00',
    registroAnterior: null,
    fechaHoraHusoGenRegistro: '2026-01-15T09:00:00+00:00',
    sistema: SISTEMA,
    ...overrides,
  };
}

describe('buildRegistroAltaXml', () => {
  it('es determinista y marca PrimerRegistro cuando no hay registro anterior', () => {
    const a = buildRegistroAltaXml(baseInput());
    const b = buildRegistroAltaXml(baseInput());
    expect(a.xml).toBe(b.xml);
    expect(a.huella).toBe(b.huella);
    expect(a.huella).toMatch(/^[0-9A-F]{64}$/); // SHA-256 hex MAYÚSCULAS (espec. AEAT)
    expect(a.xml).toContain('<sum1:PrimerRegistro>S</sum1:PrimerRegistro>');
    expect(a.xml).toContain('<sum1:TipoFactura>F1</sum1:TipoFactura>');
    expect(a.xml).toContain(
      '<sum1:FechaExpedicionFactura>15-01-2026</sum1:FechaExpedicionFactura>',
    );
    expect(a.xml).toContain(`<sum1:Huella>${a.huella}</sum1:Huella>`);
  });

  it('encadena con la huella AEAT del registro anterior (cadena separada de recordHash)', () => {
    const first = buildRegistroAltaXml(baseInput());
    const second = buildRegistroAltaXml(
      baseInput({
        numSerieFactura: 'FAC-2026-0002',
        registroAnterior: {
          nifEmisor: 'B12345674',
          numSerieFactura: 'FAC-2026-0001',
          fechaExpedicion: '2026-01-15',
          huella: first.huella,
        },
      }),
    );
    expect(second.xml).toContain('<sum1:RegistroAnterior>');
    expect(second.xml).toContain(`<sum1:Huella>${first.huella}</sum1:Huella>`);
    expect(second.huella).not.toBe(first.huella);
    // La huella del segundo registro incorpora la del primero (algoritmo oficial).
    expect(second.huella).toBe(
      computeHuellaAeat({
        nifEmisor: 'B12345674',
        numSerieFactura: 'FAC-2026-0002',
        fechaExpedicionAeat: '15-01-2026',
        tipoFactura: 'F1',
        cuotaTotal: '210.00',
        importeTotal: '1210.00',
        huellaAnterior: first.huella,
        fechaHoraHusoGenRegistro: '2026-01-15T09:00:00+00:00',
      }),
    );
  });

  it('una rectificativa emite R1 con el bloque de facturas rectificadas', () => {
    const { xml } = buildRegistroAltaXml(
      baseInput({
        tipoFactura: 'R1',
        tipoRectificativa: 'S',
        facturasRectificadas: [{ numSerieFactura: 'FAC-2026-0001', fechaExpedicion: '2026-01-10' }],
      }),
    );
    expect(xml).toContain('<sum1:TipoFactura>R1</sum1:TipoFactura>');
    expect(xml).toContain('<sum1:TipoRectificativa>S</sum1:TipoRectificativa>');
    expect(xml).toContain('<sum1:NumSerieFactura>FAC-2026-0001</sum1:NumSerieFactura>');
    expect(xml).toContain('<sum1:FechaExpedicionFactura>10-01-2026</sum1:FechaExpedicionFactura>');
  });

  it('escapa los caracteres XML de los datos del despacho/cliente', () => {
    const { xml } = buildRegistroAltaXml(baseInput({ nombreRazonEmisor: 'Bufete <A&B> "Legal"' }));
    expect(xml).toContain('Bufete &lt;A&amp;B&gt; &quot;Legal&quot;');
  });
});
