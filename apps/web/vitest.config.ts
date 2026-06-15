import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // GATE OBLIGATORIO (DECISIONS D-016): cobertura sobre los módulos críticos del web
      // — el cliente de API (Bearer + refresh httpOnly) y el gate de rol/ámbito (auth).
      // El resto de la UI se valida por e2e/manual; no se exige cobertura unitaria aquí.
      include: ['src/lib/api.ts', 'src/lib/scope.ts', 'src/lib/matter-status.ts'],
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
