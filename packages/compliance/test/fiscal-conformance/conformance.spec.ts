import * as fs from 'fs';
import * as path from 'path';
import { normalizeFiscalRecord } from './normalize';

// ─────────────────────────────────────────────────────────────────────────
// Harness de conformidad fiscal (golden-file) — GATEKEEPER DETERMINISTA.
//
// Usa los builders fiscales REALES de @legalflow/compliance. Requisito clave
// que ya cumplen los providers: `buildInvoiceRecord` es PURO (sin BD, sin
// reloj de sistema, sin random). El número de factura, la fecha de emisión y
// la semilla de encadenamiento (`previousRecordHash`) se inyectan desde el
// fixture ⇒ la salida —incluida la huella SHA-256— es 100% reproducible.
//
// Si cualquier campo fiscal (base, IVA/ITBIS, retención, numeración, huella,
// encadenamiento, QR, e-CF…) deriva respecto al golden committeado, este test
// FALLA y bloquea el merge. Ningún LLM interviene aquí.
// ─────────────────────────────────────────────────────────────────────────
import { ComplianceProviderFactory } from '../../src/factory';
import type { InvoiceInput } from '../../src/types';
import type { Jurisdiction } from '@legalflow/domain';

const GOLDEN_DIR = path.join(__dirname, 'golden');
const DIFF_DIR = path.join(__dirname, '.diff');
const UPDATE = process.env.UPDATE_GOLDENS === '1'; // solo en local, NUNCA en CI

/** Forma del fixture de entrada: la jurisdicción selecciona el provider; `invoice` es el InvoiceInput puro. */
interface Fixture {
  jurisdiction: Jurisdiction;
  invoice: InvoiceInput;
}

// Cada caso cubre un camino fiscal crítico. Añade aquí cada regla nueva.
const CASES = [
  { name: 'es-factura-simple', fixture: 'es-factura-simple.input.json' },
  { name: 'es-anticipo-iva-al-cobro-D026', fixture: 'es-anticipo-d026.input.json' },
  { name: 'es-factura-final-deduccion-anticipo', fixture: 'es-final-deduccion.input.json' },
  { name: 'es-rectificativa-sustitucion', fixture: 'es-rectificativa.input.json' },
  { name: 'rd-ecf-credito-fiscal', fixture: 'rd-ecf.input.json' },
];

describe('Conformidad fiscal (golden-file)', () => {
  beforeAll(() => fs.rmSync(DIFF_DIR, { recursive: true, force: true }));

  for (const c of CASES) {
    it(c.name, async () => {
      const { jurisdiction, invoice } = readJson<Fixture>(path.join(GOLDEN_DIR, c.fixture));
      const provider = ComplianceProviderFactory.get(jurisdiction);

      // Salida determinista: mismo input ⇒ misma huella SIEMPRE.
      const record = await provider.buildInvoiceRecord(invoice);
      const actual = normalizeFiscalRecord(record);

      const goldenPath = path.join(GOLDEN_DIR, `${c.name}.golden.json`);

      if (UPDATE) {
        // Regeneración MANUAL del golden (tras revisar y, si toca, ratificar por
        // ADR). Ejecuta:  UPDATE_GOLDENS=1 pnpm test:fiscal-conformance
        fs.writeFileSync(goldenPath, JSON.stringify(actual, null, 2) + '\n');
        return;
      }

      const golden = readJson<unknown>(goldenPath);
      try {
        expect(actual).toEqual(golden);
      } catch (err) {
        writeDiff(c.name, golden, actual);
        throw err;
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Encadenamiento MULTI-REGISTRO (D8-006). Los casos golden validan la huella
// de UN registro aislado; esto valida la propiedad que de verdad importa en
// runtime: que la cadena fiscal es continua y reproducible. Una cadena rota
// (re-enraizada, con hueco o con génesis incorrecta) NO debe pasar el gate.
// ─────────────────────────────────────────────────────────────────────────
const GENESIS = '0'.repeat(64);

describe('Encadenamiento fiscal multi-registro', () => {
  it('encadena N facturas: cada huellaAnterior = huella del registro previo (génesis = 64 ceros)', async () => {
    const { jurisdiction, invoice } = readJson<Fixture>(
      path.join(GOLDEN_DIR, 'es-factura-simple.input.json'),
    );
    const provider = ComplianceProviderFactory.get(jurisdiction);

    let previousRecordHash = GENESIS;
    const hashes: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const input: InvoiceInput = {
        ...invoice,
        invoiceNumber: `FAC-2026-${String(i).padStart(4, '0')}`,
        previousRecordHash,
      };
      const record = await provider.buildInvoiceRecord(input);
      // La cadena enlaza de verdad: este registro referencia la huella del anterior.
      const payload = record.payload as { encadenamiento: { huellaAnterior: string } };
      expect(payload.encadenamiento.huellaAnterior).toBe(previousRecordHash);
      const hash = record.recordHash;
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      hashes.push(hash as string);
      previousRecordHash = hash as string;
    }
    // Sin colisiones: tres números distintos ⇒ tres huellas distintas, todas enlazadas.
    expect(new Set(hashes).size).toBe(3);
  });

  it('es determinista: mismo input ⇒ misma huella; alterar un importe cambia la huella (detección de manipulación)', async () => {
    const { jurisdiction, invoice } = readJson<Fixture>(
      path.join(GOLDEN_DIR, 'es-factura-simple.input.json'),
    );
    const provider = ComplianceProviderFactory.get(jurisdiction);

    const a = await provider.buildInvoiceRecord({ ...invoice, previousRecordHash: GENESIS });
    const b = await provider.buildInvoiceRecord({ ...invoice, previousRecordHash: GENESIS });
    expect(a.recordHash).toBe(b.recordHash); // reproducible

    const tampered = await provider.buildInvoiceRecord({
      ...invoice,
      previousRecordHash: GENESIS,
      lines: [{ ...invoice.lines[0]!, unitPrice: '999' }],
    });
    expect(tampered.recordHash).not.toBe(a.recordHash); // un cambio de importe rompe la huella
  });
});

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function writeDiff(name: string, golden: unknown, actual: unknown): void {
  fs.mkdirSync(DIFF_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIFF_DIR, `${name}.golden.json`), JSON.stringify(golden, null, 2));
  fs.writeFileSync(path.join(DIFF_DIR, `${name}.actual.json`), JSON.stringify(actual, null, 2));
}
