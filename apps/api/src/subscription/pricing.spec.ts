import {
  Currency,
  FOUNDER,
  Jurisdiction,
  PLAN_TIERS,
  buildPlanCatalog,
  convertEur,
  effectiveMonthlyEur,
  perSeatPeriodEur,
  planCurrencyForJurisdiction,
  planPriceKey,
  savingsPct,
  toStripeMinor,
} from '@legalflow/domain';

/**
 * Lógica del catálogo de precios de suscripción (única fuente de verdad). Cubre los importes canónicos
 * (45/69/99 · anual ×10 · bienal ×18 · Fundador 39), ahorros, FX, claves de Stripe y la moneda por
 * jurisdicción. NO toca golden files de facturación (esos son del cumplimiento fiscal, no del SaaS).
 */
describe('Catálogo de precios de suscripción (@legalflow/domain)', () => {
  it('precios lista de los tiers (EUR/plaza/mes)', () => {
    const byId = Object.fromEntries(PLAN_TIERS.map((t) => [t.id, t.monthlyEur]));
    expect(byId.ESENCIAL).toBe(45);
    expect(byId.PROFESIONAL).toBe(69);
    expect(byId.AVANZADO).toBe(99);
    // Profesional es el ancla "más popular".
    expect(PLAN_TIERS.find((t) => t.id === 'PROFESIONAL')?.popular).toBe(true);
  });

  it('anual = mensual × 10 (2 meses gratis, ahorro 16,7%)', () => {
    expect(perSeatPeriodEur(69, 'ANNUAL')).toBe(690);
    expect(savingsPct('ANNUAL')).toBe(16.7);
    expect(effectiveMonthlyEur(69, 'ANNUAL')).toBeCloseTo(57.5, 5);
  });

  it('bienal = mensual × 18 sobre 24 meses (ahorro 25%)', () => {
    expect(perSeatPeriodEur(99, 'BIENNIAL')).toBe(1782);
    expect(savingsPct('BIENNIAL')).toBe(25);
    expect(effectiveMonthlyEur(99, 'BIENNIAL')).toBeCloseTo(74.25, 5);
  });

  it('mensual no tiene ahorro', () => {
    expect(savingsPct('MONTHLY')).toBe(0);
    expect(perSeatPeriodEur(45, 'MONTHLY')).toBe(45);
  });

  it('Fundador: 39 €/plaza/mes, solo anual (390) y bienal (702), cupo 18', () => {
    expect(FOUNDER.monthlyEur).toBe(39);
    expect(FOUNDER.cap).toBe(18);
    expect(FOUNDER.baseTier).toBe('PROFESIONAL');
    expect([...FOUNDER.cycles].sort()).toEqual(['ANNUAL', 'BIENNIAL']);
    expect(perSeatPeriodEur(FOUNDER.monthlyEur, 'ANNUAL')).toBe(390);
    expect(perSeatPeriodEur(FOUNDER.monthlyEur, 'BIENNIAL')).toBe(702);
  });

  it('moneda de facturación por jurisdicción: ES→EUR, RD→USD', () => {
    expect(planCurrencyForJurisdiction(Jurisdiction.ES)).toBe(Currency.EUR);
    expect(planCurrencyForJurisdiction(Jurisdiction.DO)).toBe(Currency.USD);
  });

  it('FX: USD = EUR × tasa (configurable), redondeo a entero', () => {
    expect(convertEur(690, Currency.USD, { [Currency.USD]: 1.1 })).toBe(759);
    expect(convertEur(690, Currency.EUR)).toBe(690);
  });

  it('unit_amount de Stripe en minor units (×100)', () => {
    expect(toStripeMinor(690)).toBe(69000);
    expect(toStripeMinor(45)).toBe(4500);
  });

  it('clave de Price estable tier:ciclo:moneda', () => {
    expect(planPriceKey('PROFESIONAL', 'ANNUAL', Currency.EUR)).toBe('PROFESIONAL:ANNUAL:EUR');
    expect(planPriceKey('FOUNDER', 'BIENNIAL', Currency.USD)).toBe('FOUNDER:BIENNIAL:USD');
  });

  it('catálogo completo: 3 tiers × 3 ciclos + Fundador (2) por moneda', () => {
    const eur = buildPlanCatalog({}, [Currency.EUR]);
    expect(eur).toHaveLength(11); // 9 (tiers) + 2 (fundador)
    const both = buildPlanCatalog({}, [Currency.EUR, Currency.USD]);
    expect(both).toHaveLength(22);
    // Sin descuento por volumen: el importe NO depende del nº de plazas (es por plaza).
    const pro = eur.find((r) => r.plan === 'PROFESIONAL' && r.cycle === 'MONTHLY');
    expect(pro?.perSeatPeriod).toBe(69);
  });
});
