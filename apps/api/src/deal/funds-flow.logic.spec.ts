import { EscrowStatus } from '@legalflow/domain';
import {
  canRelease,
  computeEscrow,
  fromCents,
  reconcileFundsFlow,
  toCents,
  type FundsFlowLineInput,
} from './funds-flow.logic';

/**
 * Lógica PURA del funds-flow / escrow (sin BD): cuadre del closing statement POR moneda y derivación del
 * estado de un depósito (HELD → PARTIALLY_RELEASED → RELEASED). Cubre los criterios de aceptación de T-1.
 */
describe('funds-flow logic', () => {
  describe('toCents / fromCents', () => {
    it('convierte strings decimales a céntimos enteros y de vuelta', () => {
      expect(toCents('1000.00')).toBe(100000);
      expect(toCents('0.10')).toBe(10);
      expect(toCents(250.5)).toBe(25050);
      expect(fromCents(100000)).toBe(1000);
      expect(fromCents(10)).toBe(0.1);
    });

    it('redondea sin acumular error de coma flotante', () => {
      // 0.1 + 0.2 en floats = 0.30000000000000004; en céntimos es exacto.
      const cents = toCents('0.10') + toCents('0.20');
      expect(cents).toBe(30);
      expect(fromCents(cents)).toBe(0.3);
    });

    it('trata valores no finitos como 0', () => {
      expect(toCents('no-es-numero')).toBe(0);
    });
  });

  describe('reconcileFundsFlow', () => {
    const buyer = 'party-buyer';
    const seller = 'party-seller';

    it('cuadra cuando cada flujo tiene pagador y beneficiario (misma moneda)', () => {
      const lines: FundsFlowLineInput[] = [
        { payerPartyId: buyer, payeePartyId: seller, amount: '1000000.00', currency: 'EUR' },
        { payerPartyId: buyer, payeePartyId: seller, amount: '250000.00', currency: 'EUR' },
      ];
      const r = reconcileFundsFlow(lines);
      expect(r.balanced).toBe(true);
      const eur = r.byCurrency.find((c) => c.currency === 'EUR')!;
      expect(eur.totalPaid).toBe(1250000);
      expect(eur.totalReceived).toBe(1250000);
      expect(eur.imbalance).toBe(0);
      expect(eur.balanced).toBe(true);
    });

    it('marca descuadre cuando un flujo no registra beneficiario', () => {
      const lines: FundsFlowLineInput[] = [
        { payerPartyId: buyer, payeePartyId: seller, amount: '1000000.00', currency: 'EUR' },
        { payerPartyId: buyer, payeePartyId: null, amount: '50000.00', currency: 'EUR' },
      ];
      const r = reconcileFundsFlow(lines);
      expect(r.balanced).toBe(false);
      const eur = r.byCurrency.find((c) => c.currency === 'EUR')!;
      expect(eur.totalPaid).toBe(1050000);
      expect(eur.totalReceived).toBe(1000000);
      expect(eur.imbalance).toBe(50000);
      expect(eur.balanced).toBe(false);
    });

    it('cuadra cada moneda por separado (no mezcla EUR con USD)', () => {
      const lines: FundsFlowLineInput[] = [
        { payerPartyId: buyer, payeePartyId: seller, amount: '1000.00', currency: 'EUR' },
        { payerPartyId: buyer, payeePartyId: null, amount: '500.00', currency: 'USD' },
      ];
      const r = reconcileFundsFlow(lines);
      const eur = r.byCurrency.find((c) => c.currency === 'EUR')!;
      const usd = r.byCurrency.find((c) => c.currency === 'USD')!;
      expect(eur.balanced).toBe(true);
      expect(usd.balanced).toBe(false);
      expect(usd.imbalance).toBe(500);
      expect(r.balanced).toBe(false);
    });

    it('calcula el saldo neto por parte y moneda', () => {
      const lines: FundsFlowLineInput[] = [
        { payerPartyId: buyer, payeePartyId: seller, amount: '1000000.00', currency: 'EUR' },
        { payerPartyId: seller, payeePartyId: buyer, amount: '40000.00', currency: 'EUR' },
      ];
      const r = reconcileFundsFlow(lines);
      const buyerBal = r.byParty.find((p) => p.partyId === buyer && p.currency === 'EUR')!;
      const sellerBal = r.byParty.find((p) => p.partyId === seller && p.currency === 'EUR')!;
      expect(buyerBal.paid).toBe(1000000);
      expect(buyerBal.received).toBe(40000);
      expect(buyerBal.net).toBe(-960000);
      expect(sellerBal.net).toBe(960000);
    });

    it('un statement vacío cuadra trivialmente', () => {
      const r = reconcileFundsFlow([]);
      expect(r.balanced).toBe(true);
      expect(r.byCurrency).toHaveLength(0);
      expect(r.byParty).toHaveLength(0);
    });
  });

  describe('computeEscrow', () => {
    it('sin liberaciones: HELD, remanente = importe', () => {
      const e = computeEscrow('500000.00', []);
      expect(e.status).toBe(EscrowStatus.HELD);
      expect(e.released).toBe(0);
      expect(e.remaining).toBe(500000);
    });

    it('liberación parcial: PARTIALLY_RELEASED con remanente correcto', () => {
      const e = computeEscrow('500000.00', [{ amount: '200000.00' }]);
      expect(e.status).toBe(EscrowStatus.PARTIALLY_RELEASED);
      expect(e.released).toBe(200000);
      expect(e.remaining).toBe(300000);
    });

    it('transición HELD → RELEASED al liberar el total en varios tramos', () => {
      const e = computeEscrow('500000.00', [{ amount: '300000.00' }, { amount: '200000.00' }]);
      expect(e.status).toBe(EscrowStatus.RELEASED);
      expect(e.released).toBe(500000);
      expect(e.remaining).toBe(0);
    });

    it('sobre-liberación: RELEASED y remanente acotado a 0 (no negativo)', () => {
      const e = computeEscrow('500000.00', [{ amount: '600000.00' }]);
      expect(e.status).toBe(EscrowStatus.RELEASED);
      expect(e.remaining).toBe(0);
    });
  });

  describe('canRelease', () => {
    it('admite una liberación dentro del remanente y rechaza la que lo excede o ≤ 0', () => {
      expect(canRelease(300000, 200000)).toBe(true);
      expect(canRelease(300000, 300000)).toBe(true);
      expect(canRelease(300000, 300001)).toBe(false);
      expect(canRelease(300000, 0)).toBe(false);
      expect(canRelease(0, 100)).toBe(false);
    });
  });
});
