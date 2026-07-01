import { describe, expect, it } from 'vitest';
import { buildSteps, parseStepInput, stepInputToText } from './workflows';

describe('parseStepInput', () => {
  it('trata el vacío como objeto vacío', () => {
    expect(parseStepInput('')).toEqual({ ok: true, value: {} });
    expect(parseStepInput('   ')).toEqual({ ok: true, value: {} });
  });

  it('acepta un objeto JSON', () => {
    expect(parseStepInput('{"matterId":"m1"}')).toEqual({ ok: true, value: { matterId: 'm1' } });
  });

  it('rechaza JSON inválido', () => {
    expect(parseStepInput('{no valido')).toEqual({ ok: false, error: 'not_json' });
  });

  it('rechaza arrays y escalares (el backend espera un objeto)', () => {
    expect(parseStepInput('[1,2]')).toEqual({ ok: false, error: 'not_object' });
    expect(parseStepInput('42')).toEqual({ ok: false, error: 'not_object' });
    expect(parseStepInput('null')).toEqual({ ok: false, error: 'not_object' });
  });
});

describe('buildSteps', () => {
  it('construye pasos válidos', () => {
    const res = buildSteps([
      { tool: 'firm_overview', inputText: '' },
      { tool: 'get_matter', inputText: '{"matterId":"m1"}' },
    ]);
    expect(res).toEqual({
      ok: true,
      steps: [
        { tool: 'firm_overview', input: {} },
        { tool: 'get_matter', input: { matterId: 'm1' } },
      ],
    });
  });

  it('señala el paso sin tool seleccionada', () => {
    const res = buildSteps([{ tool: '', inputText: '' }]);
    expect(res).toEqual({ ok: false, index: 0, error: 'no_tool' });
  });

  it('señala el índice del primer input inválido', () => {
    const res = buildSteps([
      { tool: 'firm_overview', inputText: '' },
      { tool: 'get_matter', inputText: '{bad' },
    ]);
    expect(res).toEqual({ ok: false, index: 1, error: 'not_json' });
  });
});

describe('stepInputToText', () => {
  it('devuelve cadena vacía para input vacío', () => {
    expect(stepInputToText({})).toBe('');
  });

  it('serializa objetos con contenido (ida y vuelta con parseStepInput)', () => {
    const text = stepInputToText({ matterId: 'm1' });
    expect(parseStepInput(text)).toEqual({ ok: true, value: { matterId: 'm1' } });
  });
});
