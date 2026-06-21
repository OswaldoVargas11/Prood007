# Loops de mejora continua — runbook

Sistema de loops autónomos con compuerta humana para LegalFlow/Lawzora. El
principio rector: **se automatiza el trabajo, no la aceptación.** Cada loop
produce un artefacto (PR, issue, reporte) ya pre-validado; tú sigues siendo el
merge.

## Las dos carriles

| Carril             | Quién actúa | Qué puede hacer                                                                                                                          |
| ------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Autónomo**       | agente      | abrir PR/issue con tests, golden files, docs, fixes de lint, bumps de dependencias, reportes de conformidad. **Tú mergeas.**             |
| **Nunca-autónomo** | solo tú     | migraciones, cambios RLS, rotación de secretos, **defaults fiscales**, credenciales admin, **golden files**. El agente ni propone merge. |

La frontera no es de buena fe: la imponen `CODEOWNERS` + branch protection.

## Componentes (instalados en este repo)

1. `.github/workflows/fiscal-conformance.yml` — gatekeeper **determinista** (sin
   LLM). Regenera la salida fiscal actual con inputs fijos y la compara contra
   los golden files. Bloquea el merge si deriva.
2. `packages/compliance/test/fiscal-conformance/` — el harness:
   - `conformance.spec.ts` + `normalize.ts`: usan los builders reales de
     `@legalflow/compliance` (`ComplianceProviderFactory` → `buildInvoiceRecord`).
     Son funciones **puras** (sin BD, reloj ni random); el número de factura, la
     fecha y la semilla de encadenamiento (`previousRecordHash`) se inyectan
     desde el fixture ⇒ huella SHA-256 reproducible.
   - `golden/*.input.json`: fixtures de entrada (reloj/serie/semilla congelados).
   - `golden/*.golden.json`: la huella fiscal esperada (versionada, owner-gated).
   - `jest.conformance.cjs` (en `packages/compliance/`): config dedicada.
3. `.github/workflows/fiscal-conformance-triage.yml` — solo si (1) falla: Claude
   explica la deriva y, si es regresión mecánica fuera de paths prohibidos,
   propone un PR. Nunca mergea ni toca un golden.
4. `.github/workflows/improvement-scout.yml` — semanal: Claude abre **un issue**
   priorizado de mejoras UX/backend. Propone, no implementa.
5. `.github/CODEOWNERS` — guardrail físico de los paths nunca-autónomos (ya cubría
   compliance/prisma/auth/RLS; se añadió el directorio de golden files).

## Comandos

```bash
# Correr el harness (compara contra los golden committeados):
pnpm test:fiscal-conformance
#   ↳ equivale a: pnpm --filter @legalflow/compliance test:fiscal-conformance

# Regenerar los golden (SOLO en local, tras revisar y —si toca— ratificar por ADR):
UPDATE_GOLDENS=1 pnpm test:fiscal-conformance
#   En PowerShell:  $env:UPDATE_GOLDENS=1; pnpm test:fiscal-conformance
```

## Puesta en marcha pendiente (lo que NO se puede hacer desde el repo)

El árbol de archivos, los scripts, los fixtures y los golden ya están commiteados
y verdes en local. Falta lo que vive en GitHub/Anthropic:

1. **Auth de los workflows de Claude por SUSCRIPCIÓN (no API key de pago).**
   El triaje y el scout usan `claude_code_oauth_token`, que sale de tu plan
   Pro/Max — no se paga por token. Pasos:
   - Genera el token en local: `claude setup-token` (token OAuth de ~1 año).
   - Guárdalo como secret `CLAUDE_CODE_OAUTH_TOKEN` (Settings → Secrets and
     variables → Actions).
   - Opcional, para que Claude pueda abrir PRs/issues con más comodidad:
     `claude` → `/install-github-app`.
     Sin el secret, el triaje y el scout quedan inertes; **el gatekeeper
     determinista SÍ corre sin ninguna credencial** (es jest puro). Nota: el uso
     headless en CI consume del pool mensual incluido en tu plan (Pro $20 /
     Max-5x $100 / Max-20x $200); para este repo es marginal. Si algún día
     prefirieras pago por uso, cambia el input a
     `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`.
2. **Activa branch protection** en `main`:
   - Require a pull request before merging.
   - Require review from Code Owners.
   - Require status checks to pass → **`Fiscal Conformance (golden-file)`**
     (además del check agregado `CI OK` que ya exige el pipeline principal).
   - Do not allow bypassing the above settings.
3. **Verifica el handle** `@OswaldoVargas11` en `.github/CODEOWNERS` (ya usado por
   el resto de reglas del repo).

## Cadencia operativa

- **Por PR** (si toca `packages/compliance`, `packages/domain`, billing,
  retainer, compliance o prisma): conformance corre y bloquea; si falla, el
  triaje te deja un PR/issue.
- **Diario** (03:00 UTC): conformance nocturno (deriva por dependencias o datos).
- **Semanal (lunes 06:00 UTC)**: scout te deja un issue de candidatos.

Tu interacción se reduce a: aprobar/rechazar PRs etiquetados y triar un issue
semanal. No es cero, y en un producto fiscal **no debe ser cero**.

## Coste

Modelo por defecto `claude-sonnet-4-6` (CI rutinario). El gasto de API de estos
loops es marginal; el coste real son tus minutos de GitHub Actions, acotados con
`timeout-minutes` y `concurrency`. Sube a `claude-opus-4-8` en `claude_args` solo
si un triaje necesita más profundidad.

## Lo que NUNCA se automatiza (recordatorio)

- Rotación de secretos y cambios de credenciales admin → siempre tú.
- Cambios de defaults fiscales (ComplianceProvider, tax-math) → ADR + tu
  ratificación.
- Regeneración de golden files → `UPDATE_GOLDENS` en local + revisión a mano.
- Merge de migraciones y RLS → protocolo PR-y-espera.
- "Construir y desplegar features" de forma autónoma → no en un producto con
  responsabilidad fiscal. El scout propone; tú decides.
