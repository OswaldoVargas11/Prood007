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

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function writeDiff(name: string, golden: unknown, actual: unknown): void {
  fs.mkdirSync(DIFF_DIR, { recursive: true });
  fs.writeFileSync(path.join(DIFF_DIR, `${name}.golden.json`), JSON.stringify(golden, null, 2));
  fs.writeFileSync(path.join(DIFF_DIR, `${name}.actual.json`), JSON.stringify(actual, null, 2));
}
