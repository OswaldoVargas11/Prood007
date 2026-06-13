import { addBusinessDays, easterSunday, spanishNationalHolidays } from './deadlines';
import { SpainComplianceProvider } from './providers/spain.provider';
import { DominicanComplianceProvider } from './providers/dominican.provider';

const noHolidays = () => false;

describe('addBusinessDays', () => {
  it('suma días hábiles saltando el fin de semana', () => {
    // Lunes 2026-06-01 + 5 días hábiles → lunes 2026-06-08.
    const r = addBusinessDays(new Date('2026-06-01'), 5, noHolidays);
    expect(r.dueDate).toBe('2026-06-08');
    expect(r.holidaysApplied).toEqual([]);
  });

  it('salta festivos y los reporta en holidaysApplied', () => {
    const isHoliday = (d: Date) => spanishNationalHolidays(d.getUTCFullYear()).has(d.toISOString().slice(0, 10));
    // Desde martes 2025-12-23, 3 días hábiles con Navidad (25) de por medio.
    const r = addBusinessDays(new Date('2025-12-23'), 3, isHoliday);
    expect(r.holidaysApplied).toContain('2025-12-25');
    expect(r.dueDate).toBe('2025-12-29');
  });
});

describe('festivos de España', () => {
  it('calcula el Domingo de Pascua (2025 = 20 de abril)', () => {
    expect(easterSunday(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
  });

  it('incluye el Viernes Santo (2025 = 18 de abril) y Navidad', () => {
    const h = spanishNationalHolidays(2025);
    expect(h.has('2025-04-18')).toBe(true);
    expect(h.has('2025-12-25')).toBe(true);
  });
});

describe('getProceduralDeadlines por provider', () => {
  it('España computa en días hábiles con festivos nacionales', () => {
    const es = new SpainComplianceProvider();
    const r = es.getProceduralDeadlines({ deadlineType: 'APELACION', startDate: '2025-12-23', days: 3 });
    expect(r.businessDays).toBe(true);
    expect(r.holidaysApplied).toContain('2025-12-25');
    expect(r.dueDate).toBe('2025-12-29');
  });

  it('RD solo excluye fines de semana', () => {
    const dom = new DominicanComplianceProvider();
    const r = dom.getProceduralDeadlines({ deadlineType: 'CONTESTACION', startDate: '2026-06-01', days: 5 });
    expect(r.dueDate).toBe('2026-06-08');
    expect(r.holidaysApplied).toEqual([]);
  });
});
