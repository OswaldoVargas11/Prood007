import { UnprocessableEntityException } from '@nestjs/common';
import { Jurisdiction } from '@legalflow/domain';
import { assertCanEmitFormat, type EmissionGuardInput } from './emission-guard';

const NOW = Date.UTC(2026, 6, 2); // 2026-07-02, reloj fijo (determinista)

/** Base válida: RD, rango vigente, sin caducidad, con certificado, DGII apagada. */
function input(overrides: Partial<EmissionGuardInput> = {}): EmissionGuardInput {
  return {
    invoiceFormat: Jurisdiction.DO,
    ncfType: '31',
    ecfRange: { expiresAt: null, next: 1, rangeEnd: 1000 },
    hasEcfCertificate: true,
    dgiiEnabled: false,
    now: NOW,
    ...overrides,
  };
}

/** Ejecuta la verja y devuelve la messageKey del 422 (o null si no lanza). */
function messageKeyOf(inp: EmissionGuardInput): string | null {
  try {
    assertCanEmitFormat(inp);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    const body = (err as UnprocessableEntityException).getResponse() as { messageKey?: string };
    return body.messageKey ?? '__no_key__';
  }
}

describe('assertCanEmitFormat — verja de capacidad de emisión (Parte A)', () => {
  describe('ES / Verifactu: sin verja (régimen aplazado)', () => {
    it('nunca lanza, ni sin rango ni sin certificado ni con la AEAT activada', () => {
      expect(
        messageKeyOf(
          input({
            invoiceFormat: Jurisdiction.ES,
            ecfRange: null,
            hasEcfCertificate: false,
            dgiiEnabled: true,
          }),
        ),
      ).toBeNull();
    });
  });

  describe('RD / e-CF con la DGII APAGADA (stub): se conserva el arranque gradual', () => {
    it('sin rango registrado NO lanza (cae a la serie interna en emitInvoiceInTx)', () => {
      expect(messageKeyOf(input({ ecfRange: null, hasEcfCertificate: false }))).toBeNull();
    });

    it('con rango vigente NO lanza', () => {
      expect(messageKeyOf(input())).toBeNull();
    });

    it('rango VENCIDO lanza 422 (aunque la DGII esté apagada: el rango no sirve)', () => {
      expect(
        messageKeyOf(
          input({ ecfRange: { expiresAt: new Date(NOW - 1), next: 1, rangeEnd: 1000 } }),
        ),
      ).toBe('dgii.encfRangeExpired');
    });

    it('rango AGOTADO (next > rangeEnd) lanza 422', () => {
      expect(
        messageKeyOf(input({ ecfRange: { expiresAt: null, next: 1001, rangeEnd: 1000 } })),
      ).toBe('dgii.encfRangeExhausted');
    });

    it('caducidad en el futuro NO lanza', () => {
      expect(
        messageKeyOf(
          input({ ecfRange: { expiresAt: new Date(NOW + 86_400_000), next: 1, rangeEnd: 1000 } }),
        ),
      ).toBeNull();
    });
  });

  describe('RD / e-CF con la DGII ACTIVADA: exige rango vigente + certificado', () => {
    it('sin rango registrado lanza 422 (encfRangeMissing)', () => {
      expect(messageKeyOf(input({ dgiiEnabled: true, ecfRange: null }))).toBe(
        'dgii.encfRangeMissing',
      );
    });

    it('con rango vigente pero SIN certificado lanza 422 (ecfCertRequired)', () => {
      expect(messageKeyOf(input({ dgiiEnabled: true, hasEcfCertificate: false }))).toBe(
        'ledger.ecfCertRequired',
      );
    });

    it('con rango vigente + certificado NO lanza', () => {
      expect(messageKeyOf(input({ dgiiEnabled: true }))).toBeNull();
    });

    it('rango VENCIDO tiene prioridad sobre la falta de certificado', () => {
      expect(
        messageKeyOf(
          input({
            dgiiEnabled: true,
            hasEcfCertificate: false,
            ecfRange: { expiresAt: new Date(NOW - 1), next: 1, rangeEnd: 1000 },
          }),
        ),
      ).toBe('dgii.encfRangeExpired');
    });
  });
});
