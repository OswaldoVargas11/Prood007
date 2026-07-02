// Verificación SIN base de datos: resolución de imports, validez de identificadores fiscales contra
// el validador real, construcción de factura en sandbox (STUBBED), PDF y plazos procesales.
import assert from 'node:assert';
import { SpainComplianceProvider, DominicanComplianceProvider } from '@legalflow/compliance';
import { nif, cif, rnc, cedula, taxIdKind } from './lib/identifiers.mjs';
import { pdfDoc, textBlob } from './lib/artifacts.mjs';
import { SCENARIOS, ALL_DEMO_ADMIN_EMAILS } from './scenarios/registry.mjs';

const ES = new SpainComplianceProvider();
const DO = new DominicanComplianceProvider();

// 1) Identificadores generados deben pasar el validador real.
const ids = [cif(8810017), cif(4410101), nif(50112233), rnc(13405067), cedula(40212345678)];
for (const id of ids) {
  const isDo = /^\d{9}$|^\d{11}$/.test(id);
  const r = (isDo ? DO : ES).validateTaxId(id);
  assert(r.valid, `Identificador inválido: ${id} (${JSON.stringify(r.error)})`);
  console.log(`  ✓ ${id} → válido (${taxIdKind(id)})`);
}

// 2) Construcción de factura Verifactu (ES) en sandbox.
const esRec = await ES.buildInvoiceRecord({
  invoiceNumber: 'QM-2026-0001',
  issueDate: '2026-05-10',
  currency: 'EUR',
  seller: { name: 'Quórum Corporate Abogados', taxId: cif(8810017) },
  buyer: { name: 'Atlas Capital Partners, S.L.', taxId: cif(5510111) },
  lines: [
    { description: 'Honorarios', quantity: '1', unitPrice: '30000.00', taxCode: 'IVA_STANDARD' },
  ],
  withholdingTaxCode: 'IRPF_GENERAL',
});
assert.equal(esRec.submission.status, 'STUBBED', 'ES no STUBBED');
assert.equal(esRec.format, 'VERIFACTU');
assert(esRec.recordHash, 'sin recordHash ES');
console.log(
  `  ✓ Verifactu totals: base=${esRec.totals.taxableBase} iva=${esRec.totals.taxAmount} ret=${esRec.totals.withholdingAmount} total=${esRec.totals.total}`,
);

// 3) Construcción de e-CF (RD) en sandbox (sin retención).
const doRec = await DO.buildInvoiceRecord({
  invoiceNumber: 'QM-2026-0005',
  issueDate: '2026-05-15',
  currency: 'DOP',
  seller: { name: 'Quórum Corporate Abogados', taxId: cif(8810017) },
  buyer: { name: 'Inversiones Quisqueya del Este, SRL', taxId: rnc(13405067) },
  lines: [
    { description: 'Honorarios', quantity: '1', unitPrice: '480000.00', taxCode: 'ITBIS_STANDARD' },
  ],
});
assert.equal(doRec.submission.status, 'STUBBED', 'DO no STUBBED');
assert.equal(doRec.format, 'ECF');
console.log(
  `  ✓ e-CF totals: base=${doRec.totals.taxableBase} itbis=${doRec.totals.taxAmount} total=${doRec.totals.total}`,
);

// 4) PDF y texto.
const pdf = await pdfDoc('Hoja de encargo', ['Párrafo de prueba con acentos: ñ á é í ó ú € ¿¡.']);
assert(pdf.bytes.length > 400 && pdf.mimeType === 'application/pdf', 'PDF inválido');
const txt = textBlob('línea 1\nlínea 2');
assert(txt.mimeType === 'text/plain', 'texto inválido');
console.log(`  ✓ PDF=${pdf.sizeBytes}B, texto=${txt.sizeBytes}B`);

// 5) Plazo procesal computado (días hábiles ES).
const dl = ES.getProceduralDeadlines({
  deadlineType: 'Contestación a la demanda',
  startDate: '2026-06-01',
  days: 20,
});
assert(dl.dueDate, 'sin dueDate');
console.log(`  ✓ Plazo procesal: ${dl.dueDate}`);

// 6) Importar los 3 escenarios (resolución/sintaxis de todo el árbol de imports).
for (const key of [1, 2, 3]) {
  const mod = await SCENARIOS[key].loader();
  assert.equal(typeof mod.seed, 'function', `escenario ${key} sin seed()`);
}
console.log(
  `  ✓ 3 escenarios importan y exponen seed(). Emails: ${ALL_DEMO_ADMIN_EMAILS.join(', ')}`,
);

console.log('\n✓ SELF-CHECK OK (sin base de datos).');
