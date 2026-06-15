/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/**/*.spec.ts'],
  // GATE OBLIGATORIO (ver DECISIONS D-016): el cálculo fiscal es crítico — un IVA/IRPF/ITBIS
  // mal calculado = facturas inválidas. Umbral ≥90% en toda la capa de cumplimiento.
  coverageThreshold: {
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
  moduleNameMapper: {
    // Resuelve el paquete de dominio desde su fuente para que los tests no dependan del build.
    '^@legalflow/domain$': '<rootDir>/../domain/src/index.ts',
  },
};
