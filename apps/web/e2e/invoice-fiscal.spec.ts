import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { CREDS_PATH, type SeedCreds } from './global-setup';

const creds = (): SeedCreds => JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as SeedCreds;
const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:4000';

/**
 * Cumplimiento fiscal por jurisdicción (modo SANDBOX): la factura ES sale en EUR con formato
 * Verifactu y la DO en DOP con e-CF en stub. Además, la numeración es correlativa sin huecos
 * (requisito legal): dos emisiones consecutivas difieren en exactamente +1.
 */
test.describe('Facturación fiscal y numeración', () => {
  test('la factura sembrada ES es EUR + Verifactu; la DO es DOP + e-CF stub', async () => {
    const { esInvoice, doInvoice } = creds();
    expect(esInvoice, 'se sembró una factura ES').not.toBeNull();
    expect(esInvoice!.currency).toBe('EUR');
    expect(esInvoice!.complianceFormat).toBe('VERIFACTU');

    expect(doInvoice, 'se sembró una factura DO').not.toBeNull();
    expect(doInvoice!.currency).toBe('DOP');
    expect(doInvoice!.ecfStatus).toBe('STUBBED');
  });

  test('numeración correlativa sin huecos en emisiones consecutivas (ES)', async ({ request }) => {
    const { esMatterId } = creds();
    const tok = creds().tokens.admin;

    const issue = async () => {
      const res = await request.post(`${API}/api/ledger/invoices`, {
        headers: { Authorization: `Bearer ${tok}` },
        data: {
          matterId: esMatterId,
          issueDate: '2026-06-22T00:00:00.000Z',
          withholdingTaxCode: 'IRPF_GENERAL',
          lines: [
            {
              description: 'Honorarios',
              quantity: '1',
              unitPrice: '100.00',
              taxCode: 'IVA_STANDARD',
            },
          ],
        },
      });
      expect(res.ok(), `emisión: ${res.status()}`).toBeTruthy();
      const body = (await res.json()) as { invoice?: { number: string }; number?: string };
      return body.invoice?.number ?? body.number ?? '';
    };

    const n1 = await issue();
    const n2 = await issue();
    const seq = (n: string) => Number(n.split('-').pop());
    expect(seq(n2) - seq(n1), `correlativo sin hueco: ${n1} → ${n2}`).toBe(1);
  });
});
