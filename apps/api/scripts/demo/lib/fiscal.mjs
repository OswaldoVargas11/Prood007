/**
 * Emisión de facturas DEMO con registro fiscal Verifactu (ES) / e-CF (RD) en MODO SANDBOX.
 *
 * Reutiliza los providers PUROS de `@legalflow/compliance` (la MISMA matemática fiscal y la misma
 * huella/encadenamiento que la API) SIN red ni certificado: `buildInvoiceRecord` no transmite (su
 * `submission.status` es STUBBED en el MVP). NO se llama a AEAT/DGII, NO se usa ningún .p12.
 *   · ES  → complianceFormat VERIFACTU, ecfStatus NOT_APPLICABLE, cadena recordHash/previousRecordHash.
 *   · RD  → complianceFormat ECF, ecfStatus STUBBED (transmisión apagada), e-CF sin enviar.
 *
 * El identificador fiscal del despacho y de los clientes es ficticio pero con dígito de control válido.
 */
import { SpainComplianceProvider, DominicanComplianceProvider } from '@legalflow/compliance';

const ES = new SpainComplianceProvider();
const DO = new DominicanComplianceProvider();

function round2(n) {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * Emite una factura y sus líneas. `chain` es un Map por (formato) con el último recordHash, para
 * encadenar Verifactu/e-CF de forma coherente dentro del despacho.
 *
 * @returns {Promise<{ invoice: object }>}
 */
export async function issueInvoice(
  prisma,
  {
    tenant,
    client,
    matter,
    format, // 'es' | 'do'
    currency, // 'EUR' | 'USD' | 'DOP'
    lines, // [{ description, quantity, unitPrice, taxCode }]
    withholdingTaxCode = undefined,
    issueDate,
    dueDate,
    state = 'ISSUED', // 'ISSUED' | 'PAID' | 'OVERDUE'
    seq, // número correlativo dentro de la serie del despacho
    chain,
  },
) {
  const provider = format === 'do' ? DO : ES;
  const number = `${tenant.invoiceSeries || 'FAC'}-${issueDate.getFullYear()}-${String(seq).padStart(4, '0')}`;
  const previousRecordHash = chain.get(format) ?? undefined;

  const record = await provider.buildInvoiceRecord({
    invoiceNumber: number,
    issueDate: issueDate.toISOString().slice(0, 10),
    currency,
    seller: { name: tenant.name, taxId: tenant.taxId },
    buyer: { name: client.name, taxId: client.taxId },
    lines: lines.map((l) => ({
      description: l.description,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      taxCode: l.taxCode,
    })),
    withholdingTaxCode: format === 'do' ? undefined : withholdingTaxCode,
    previousRecordHash,
  });
  if (record.recordHash) chain.set(format, record.recordHash);

  const totals = record.totals;
  const paid = state === 'PAID';
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      matterId: matter.id,
      clientId: client.id,
      number,
      status: state,
      issueDate,
      dueDate: dueDate ?? null,
      paidAt: paid ? issueDate : null,
      currency,
      invoiceFormat: format,
      taxableBase: totals.taxableBase,
      taxAmount: totals.taxAmount,
      withholdingAmount: totals.withholdingAmount ?? '0',
      withholdingTaxCode: format === 'do' ? null : (withholdingTaxCode ?? null),
      total: totals.total,
      amountPaid: paid ? totals.total : '0',
      complianceRecord: record.payload,
      complianceFormat: record.format, // 'VERIFACTU' | 'ECF'
      recordHash: record.recordHash ?? null,
      previousRecordHash: previousRecordHash ?? null,
      ecfStatus: format === 'do' ? 'STUBBED' : 'NOT_APPLICABLE',
      ecfStatusDetail:
        format === 'do'
          ? 'Demo/sandbox: transmisión a la DGII apagada (sin DGII_ENV ni .p12).'
          : null,
      documentType: 'NORMAL',
      lines: {
        create: lines.map((l) => ({
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          taxCode: l.taxCode,
          lineTotal: round2(Number(l.quantity) * Number(l.unitPrice)),
        })),
      },
    },
  });

  // Cobro registrado para las pagadas (alimenta KPIs de tesorería).
  if (paid) {
    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        amount: totals.total,
        currency,
        status: 'SUCCEEDED',
        method: 'MANUAL',
        note: 'Cobro registrado (demo)',
        paidAt: issueDate,
      },
    });
  }

  return { invoice };
}
