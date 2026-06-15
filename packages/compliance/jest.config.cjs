/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/**/*.spec.ts'],
  // GATE OBLIGATORIO (ver DECISIONS D-016): el cálculo fiscal es crítico — un IVA/IRPF/ITBIS
  // mal calculado = facturas inválidas. Umbral ≥90% en statements/lines/functions (de hecho
  // 99/99/100). En 'branches' se fija un suelo de 88 (cobertura real ~90-92%) porque el conteo
  // de ramas de ts-jest varía ±2 puntos entre versiones de Node (20 en CI vs 24 local) y un 90
  // exacto sería intermitente; los stubs no fiscales (LexNET/SII/606) aportan ramas no críticas.
  coverageThreshold: {
    global: { branches: 88, functions: 90, lines: 90, statements: 90 },
  },
  moduleNameMapper: {
    // Resuelve el paquete de dominio desde su fuente para que los tests no dependan del build.
    '^@legalflow/domain$': '<rootDir>/../domain/src/index.ts',
  },
};
