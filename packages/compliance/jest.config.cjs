/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/**/*.spec.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
  },
  moduleNameMapper: {
    // Resuelve el paquete de dominio desde su fuente para que los tests no dependan del build.
    '^@legalflow/domain$': '<rootDir>/../domain/src/index.ts',
  },
};
