import { describe, expect, it } from 'vitest';
import { nextStatuses, statusVariant } from './matter-status';

describe('matter-status', () => {
  it('expone solo transiciones válidas (espejo del backend)', () => {
    expect(nextStatuses('OPEN')).toEqual(['IN_PROGRESS', 'ON_HOLD', 'CLOSED']);
    expect(nextStatuses('CLOSED')).toContain('ARCHIVED');
    expect(nextStatuses('ARCHIVED')).toEqual([]); // terminal
  });

  it('asigna una variante de color a cada estado', () => {
    expect(statusVariant('OPEN')).toBe('info');
    expect(statusVariant('IN_PROGRESS')).toBe('success');
    expect(statusVariant('ON_HOLD')).toBe('warning');
    expect(statusVariant('CLOSED')).toBe('secondary');
    expect(statusVariant('ARCHIVED')).toBe('outline');
  });
});
