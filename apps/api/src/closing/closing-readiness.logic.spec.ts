import {
  computeReadiness,
  readinessForPhase,
  GATING_PHASES,
  type ReadinessItemInput,
} from './closing-readiness.logic';

/**
 * Lógica PURA del gating de Conditions Precedent (sin BD): readiness por fase (AT_SIGNING / AT_CLOSING).
 * Cubre los criterios de aceptación de T-2: 0 CPs, todas satisfechas, mezcla con WAIVED.
 */
describe('closing readiness logic', () => {
  const cp = (
    phase: 'AT_SIGNING' | 'AT_CLOSING' | 'POST_CLOSING',
    status: ReadinessItemInput['status'],
    title = 'CP',
  ): ReadinessItemInput => ({ category: 'CONDITION_PRECEDENT', phase, status, title });

  const signing = (r: ReturnType<typeof computeReadiness>) =>
    readinessForPhase(r, 'AT_SIGNING')!;
  const closing = (r: ReturnType<typeof computeReadiness>) =>
    readinessForPhase(r, 'AT_CLOSING')!;

  it('siempre devuelve las dos fases de gating', () => {
    const r = computeReadiness([]);
    expect(r.byPhase.map((p) => p.phase)).toEqual(GATING_PHASES);
  });

  it('caso 0 CPs: lista (vacuamente), 100%, sin pendientes', () => {
    const r = computeReadiness([]);
    for (const phase of r.byPhase) {
      expect(phase.total).toBe(0);
      expect(phase.satisfied).toBe(0);
      expect(phase.pending).toBe(0);
      expect(phase.pendingTitles).toEqual([]);
      expect(phase.pct).toBe(100);
      expect(phase.ready).toBe(true);
    }
  });

  it('todas satisfechas: ready, 100%, sin pendientes', () => {
    const r = computeReadiness([
      cp('AT_SIGNING', 'SATISFIED'),
      cp('AT_SIGNING', 'SATISFIED'),
      cp('AT_CLOSING', 'SATISFIED'),
    ]);
    expect(signing(r)).toMatchObject({ total: 2, satisfied: 2, pending: 0, pct: 100, ready: true });
    expect(closing(r)).toMatchObject({ total: 1, satisfied: 1, pending: 0, pct: 100, ready: true });
  });

  it('mezcla con WAIVED: la dispensa cuenta como satisfecha', () => {
    const r = computeReadiness([
      cp('AT_SIGNING', 'SATISFIED'),
      cp('AT_SIGNING', 'WAIVED'),
      cp('AT_SIGNING', 'PENDING', 'falta esta'),
      cp('AT_SIGNING', 'IN_PROGRESS', 'en curso'),
    ]);
    const s = signing(r);
    expect(s.total).toBe(4);
    expect(s.satisfied).toBe(2); // SATISFIED + WAIVED
    expect(s.waived).toBe(1);
    expect(s.pending).toBe(2); // PENDING + IN_PROGRESS
    expect(s.pendingTitles).toEqual(['falta esta', 'en curso']);
    expect(s.pct).toBe(50);
    expect(s.ready).toBe(false);
  });

  it('separa correctamente por fase (una pendiente en signing no afecta a closing)', () => {
    const r = computeReadiness([
      cp('AT_SIGNING', 'PENDING'),
      cp('AT_CLOSING', 'SATISFIED'),
    ]);
    expect(signing(r).ready).toBe(false);
    expect(closing(r).ready).toBe(true);
  });

  it('ignora partidas no-CP y POST_CLOSING al gatear signing/closing', () => {
    const r = computeReadiness([
      { category: 'DELIVERABLE', phase: 'AT_SIGNING', status: 'PENDING', title: 'doc' },
      { category: 'SIGNATURE_PAGE', phase: 'AT_CLOSING', status: 'PENDING', title: 'firma' },
      cp('POST_CLOSING', 'PENDING', 'obligación posterior'),
    ]);
    // Ninguna CP en fases de gating ⇒ ambas listas.
    expect(signing(r)).toMatchObject({ total: 0, ready: true });
    expect(closing(r)).toMatchObject({ total: 0, ready: true });
  });

  it('redondea el porcentaje (1 de 3 satisfechas → 33%)', () => {
    const r = computeReadiness([
      cp('AT_CLOSING', 'SATISFIED'),
      cp('AT_CLOSING', 'PENDING'),
      cp('AT_CLOSING', 'PENDING'),
    ]);
    expect(closing(r).pct).toBe(33);
  });
});
