# AI_WORKLOG.md - Registro compartido Codex / Claude

Este archivo es la bitacora obligatoria de trabajo entre IAs. Cada intervencion debe anadir una
entrada nueva al final, sin reescribir entradas anteriores salvo correccion explicita del usuario.

## Regla de uso

- Indicar fecha/hora aproximada, IA, objetivo, archivos tocados, pruebas ejecutadas y resultado.
- Registrar errores detectados aunque no se corrijan.
- Registrar bloqueantes reales y el siguiente punto recomendado de trabajo.
- No usar este archivo como sustituto de `PLAN.md` o `DECISIONS.md`: aqui va el historial operativo.

## Contexto base del proyecto

- Producto: LegalFlow, SaaS de gestion legal multi-jurisdiccion para Espana y Republica Dominicana.
- Arquitectura: monorepo pnpm con `apps/api` (NestJS), `apps/web` (Next.js) y paquetes compartidos
  `packages/domain`, `packages/compliance`, `packages/config`.
- Principio no negociable: nucleo agnostico de jurisdiccion y adaptadores de cumplimiento
  enchufables en `packages/compliance`.
- Documentos de contexto: `README.md`, `PLAN.md`, `DECISIONS.md`.

## Entradas

### 2026-06-14 - Codex - Revision sin cambios de codigo

Objetivo:

- Revisar el proyecto, ejecutar pruebas disponibles y confirmar si existe frontend visible.

Acciones:

- Inspeccionada la estructura del monorepo.
- Leidos `README.md`, `PLAN.md`, `DECISIONS.md`, `apps/web/package.json`, `apps/api/package.json`
  y la pagina principal de `apps/web`.
- Ejecutadas pruebas y comprobaciones sin modificar codigo fuente.

Pruebas/comprobaciones:

- `pnpm test`: falla globalmente porque `apps/api` ejecuta Jest unitario contra `apps/api/src` y no
  encuentra ningun `*.spec.ts`.
- `pnpm --filter @legalflow/api test:e2e`: OK, 6 suites y 43 tests pasan.
- `pnpm --filter @legalflow/api test:e2e -- --runInBand --detectOpenHandles`: OK, sin advertencia
  de handles abiertos.
- `pnpm --filter @legalflow/domain exec tsc -p tsconfig.json --noEmit`: OK.
- `pnpm --filter @legalflow/compliance exec tsc -p tsconfig.json --noEmit`: OK.
- `pnpm --filter @legalflow/web exec tsc -p tsconfig.json --noEmit`: OK.
- `pnpm --filter @legalflow/api exec tsc -p tsconfig.json --noEmit`: OK.
- `pnpm lint`: falla porque `eslint` no esta disponible en los workspaces que lo invocan.
- `pnpm --filter @legalflow/web lint`: falla al abrir el asistente interactivo de configuracion
  ESLint de Next.js.

Errores/riesgos registrados:

- Configuracion de lint incompleta o dependencias no enlazadas donde se ejecutan los scripts.
- `apps/api` tiene tests e2e, pero su script unitario `test` falla por ausencia de specs unitarios.
- `PLAN.md` contiene contexto desactualizado: aun menciona entorno sin Node/pnpm/Docker, aunque las
  pruebas ya pudieron ejecutarse.

Frontend:

- Existe `apps/web`, app Next.js con locales `es-ES` y `es-DO`.
- La UI actual es una pantalla inicial basica, no una aplicacion completa de gestion.
- Rutas esperadas: `http://localhost:3000/es-ES` y `http://localhost:3000/es-DO` tras `pnpm web:dev`.

Estado git observado:

- Antes de esta entrada ya existia `packages/compliance/src/taxid.ts` como archivo no versionado.
- Esta entrada crea solo `AI_WORKLOG.md` como registro operativo.

Siguiente punto recomendado:

- Mantener este archivo actualizado al inicio o final de cada bloque de trabajo de Codex/Claude.
- Alinear `PLAN.md` con el estado real actual antes de planificar nuevas epicas.

### 2026-06-14 - Codex - Vinculacion con rama de trabajo de Claude

Objetivo:

- Registrar la rama indicada por el usuario como base del trabajo compartido con Claude.

Comprobacion:

- Remoto: `origin` apunta a `https://github.com/OswaldoVargas11/Prood007.git`.
- Rama local actual: `feat/mvp-fase1`.
- Rama remota indicada: `origin/feat/mvp-fase1`.
- Commit verificado: `135ef91701170762ca192401cf60a2bcd3a339a9`.
- Resultado: `HEAD` local coincide con `origin/feat/mvp-fase1`.

Nota operativa:

- El trabajo atribuido a Claude esta presente en la rama local actual.
- Cualquier nueva intervencion de Codex o Claude debe registrar aqui su alcance antes de continuar
  con cambios sustantivos.

### 2026-06-14 - Codex - E9 tax IDs, test/lint baseline y plan actualizado

Objetivo:

- Avanzar objetivos pendientes de `PLAN.md` con prioridad en bloque verificable y dejar el repo en
  estado probado antes de commit.

Cambios realizados:

- Conectado `packages/compliance/src/taxid.ts` a `SpainComplianceProvider` y
  `DominicanComplianceProvider`.
- Exportado `taxid` desde `packages/compliance/src/index.ts`.
- Anadida suite `packages/compliance/src/taxid.spec.ts` con validacion NIF/NIE/CIF, RNC y Cedula.
- Corregido fixture de Cedula dominicana en `factory.spec.ts` para usar digito de control valido.
- Ajustado `apps/api/package.json` para que `pnpm test` no falle cuando no hay unit tests en
  `apps/api/src`; los e2e siguen separados en `test:e2e`.
- Corregida configuracion de lint: ESLint 8 compatible con Next 14, `eslint-config-next`, configs
  para `packages/domain` y `packages/compliance`, scripts sin `--ext`.
- Limpiados warnings de lint en `tasks.service.ts` y `spain.provider.ts`.
- Actualizado `PLAN.md`: E9 queda marcado como completo con pruebas; se anadio nota de estado real
  2026-06-14.

Pruebas/comprobaciones finales:

- `pnpm lint`: OK, sin warnings ni errores.
- `pnpm test`: OK. Compliance 4 suites / 32 tests; API unit sin tests sale 0 por `--passWithNoTests`.
- `pnpm --filter @legalflow/api test:e2e -- --runInBand --detectOpenHandles`: OK, 6 suites / 43 tests.
- `pnpm --filter @legalflow/domain exec tsc -p tsconfig.json --noEmit`: OK.
- `pnpm --filter @legalflow/compliance exec tsc -p tsconfig.json --noEmit`: OK.
- `pnpm --filter @legalflow/api exec tsc -p tsconfig.json --noEmit`: OK.
- `pnpm --filter @legalflow/web exec tsc -p tsconfig.json --noEmit`: OK.

Errores/riesgos registrados:

- `pnpm add` mostro avisos de dependencias obsoletas propias del ecosistema ESLint 8/Next 14; no
  bloquean lint ni tests.
- `apps/web` sigue siendo UI inicial basica; no hay frontend funcional completo para los modulos.
- No se ejecuto `pnpm build` para evitar generar/churn de artefactos `.next`/`dist` antes del commit.

Porcentaje estimado:

- `PLAN.md` tiene 69 de 75 checkboxes marcados como completados: 92% del plan checklist.
- Estimacion pragmatica del producto completo: 70-75%, porque backend MVP esta muy avanzado pero la UI
  operativa, CI y transversales de seguridad/datos siguen pendientes.

Siguiente punto recomendado:

- Construir UI funcional en `apps/web` para consumir auth/clientes/expedientes/documentos/tareas/ledger.
- Despues, anadir CI basica y hooks Husky reales (`pre-commit`, `commit-msg`).

### 2026-06-14 - Claude - Verificacion de cambios de Codex + plan de 3 sesiones

Objetivo:

- Revisar el trabajo de Codex (taxid + baseline de lint), verificar todo verde y planificar las
  3 sesiones de trabajo del dia segun lo pedido por el usuario.

Comprobaciones (todas OK):

- `pnpm install` tras cambio de lockfile: OK.
- Builds domain/compliance/api: OK.
- `pnpm --filter @legalflow/compliance test`: 4 suites / 32 tests OK (incluye taxid).
- `pnpm --filter @legalflow/api test:e2e`: 6 suites / 43 tests OK.
- `pnpm -r lint`: limpio en domain, compliance, web y api.
- Total: 75 pruebas verdes. Commit `abda88d` de Codex empujado a `origin/feat/mvp-fase1` (PR #1).

Decisiones:

- Confirmada la validacion de tax-ids de Codex como correcta (NIF/NIE/CIF, RNC, Cedula).
- Creado `SESSIONS.md` con el plan de 3 slots (5 h c/u, limitados por tokens).
- UI: se delega el diseno a Claude Design (prompt entregado al usuario). El trabajo no visual de
  frontend (SDK API, auth, i18n) y el hardening de backend no dependen del diseno y avanzan ya.

Siguiente punto recomendado (esta sesion):

- Backend hardening de seguridad (rate limiting/throttler + helmet), CI (GitHub Actions) y hooks
  Husky reales; despues, plomeria de frontend (cliente API tipado + auth) a la espera del diseno.

### 2026-06-14 - Claude - Sesion 1 completada: seguridad, CI verde y plomeria frontend

Hecho:

- Seguridad: @nestjs/throttler (login/register 10/min, global 300/min) + helmet + CORS por
  CORS_ORIGINS. Tests e2e de seguridad (helmet + 429).
- CI GitHub Actions: install+build+lint+unit+e2e con Postgres. Husky real (pre-commit prettier,
  commit-msg commitlint). postinstall prisma generate.
- Plomeria frontend (no depende del diseno): lib/api (fetch tipado + refresh), lib/auth
  (AuthProvider/useAuth), lib/format (EUR/DOP), /login y /dashboard funcionales.
- DESIGN_PROMPT.md y SESSIONS.md entregados.

Dos BUGS REALES detectados por CI y corregidos:

1. `.gitignore` con patron `storage/` ocultaba `apps/api/src/storage/` → el modulo StorageProvider
   de E3 nunca se versiono (build local OK, CI fallaba). Corregido: patrones anclados + archivos
   anadidos.
2. Carrera de concurrencia al sembrar el catalogo global de Permission con upsert: dos registros
   simultaneos colisionaban (Unique constraint on code). Corregido con createMany skipDuplicates
   (ON CONFLICT DO NOTHING). Reproducido vaciando Permission + e2e en paralelo: 45/45 OK.

Estado: CI verde en `feat/mvp-fase1` (PR #1). 32 unit + 45 e2e + web build OK.

Aviso no bloqueante: GitHub avisa de deprecacion de Node 20 en actions (checkout/setup-node/
action-setup) a partir del 16/06/2026; conviene subir versiones mas adelante.

Siguiente punto recomendado (Sesion 2):

- Implementar la UI del despacho (shell, dashboard, clientes, expedientes, documentos, tareas) con
  el diseno de Claude Design, consumiendo la API via lib/api.

### 2026-06-14 - Claude - Decisiones de rumbo (UI espera, sin rebrand) + nota de worktrees

Decisiones del usuario (vinculantes):

- UI: ESPERAR al diseno de Claude Design. Trabajo no visual mientras tanto (SDK/tipos en apps/web/src/lib,
  mas tests e2e, y E9: reportes 606/607 y SII mas alla del stub). NADA de pantallas todavia.
- Naming: seguir con @legalflow/\*; rebrand al final (mecanico).

Aviso operativo de ramas/worktrees:

- La unica rama valida es feat/mvp-fase1 (remoto). Si un chat aparece en un worktree aislado pinneado a
  un commit viejo (claude/\* @ 4be391c), reconciliar antes de tocar nada:
  git fetch origin && git reset --hard origin/feat/mvp-fase1; push con git push origin HEAD:feat/mvp-fase1.
