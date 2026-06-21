/** @type {import('ts-jest').JestConfigWithTsJest} */
// Config DEDICADA del harness de conformidad fiscal (golden-file).
//
// Separada de jest.config.cjs a propósito:
//  - apunta `roots` a test/fiscal-conformance (la spec vive fuera de src/),
//  - NO aplica el umbral de cobertura del paquete (este harness no mide
//    cobertura: compara salida fiscal contra golden files),
//  - reusa el mismo moduleNameMapper para resolver @legalflow/domain desde
//    su fuente, sin depender del build.
//
// Lo corre el script `test:fiscal-conformance` y el workflow homónimo.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/fiscal-conformance'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@legalflow/domain$': '<rootDir>/../domain/src/index.ts',
  },
};
