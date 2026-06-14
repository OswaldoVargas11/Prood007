# HANDOFF — LegalFlow (resumen para continuar en otro chat)

> Pega este archivo (o su ruta) al iniciar un chat nuevo. Resume estado, entorno y próximos pasos.

## Qué es

SaaS de gestión legal multi-jurisdicción **España (`es`)** + **República Dominicana (`do`)**.
Principio no negociable: **núcleo agnóstico de jurisdicción + adaptadores de cumplimiento**
(`packages/compliance`, factory por `tenant.jurisdiction`). Nombre de producto provisional:
"Lexora"; **naming en decisión** (ver abajo).

## Repo y entorno

- Working dir: `C:\Users\OswaldoVargasRodrigu\Prod007`
- GitHub: `https://github.com/OswaldoVargas11/Prood007` (ojo: "Pro**o**d007", doble o)
- Rama de trabajo: **`feat/mvp-fase1`** → **PR #1** (`https://github.com/OswaldoVargas11/Prood007/pull/1`)
- `gh` CLI instalado y autenticado (scope `repo`); `git push` funciona directo.
- Herramientas NO están en el PATH del shell Bash. En cada comando Bash:
  `export PATH="/c/Program Files/nodejs:/c/Program Files/GitHub CLI:/c/Program Files/Docker/Docker/resources/bin:$PATH"`
- Postgres en Docker: contenedor **`legalflow-postgres`** (`docker compose up -d postgres`).
- **Commits:** en el tool Bash usar `git commit -F <archivo>` (NO `@'...'@`, es sintaxis PowerShell
  y rompe el mensaje). commitlint exige Conventional Commits y **subject en minúscula** (no empezar
  por mayúscula/sigla). Hooks husky activos (pre-commit=prettier, commit-msg=commitlint).

## Stack

- Monorepo pnpm: `apps/api` (NestJS + Prisma + Postgres), `apps/web` (Next.js 14 App Router +
  next-intl `es-ES`/`es-DO` + Tailwind 3), `packages/{domain,compliance,config}`.
- Paquetes compartidos compilan a **CommonJS** (interop Nest/Jest).

## Estado del MVP (todo probado; CI verde)

Backend completo E1–E9: **auth multi-tenant + RBAC** (argon2, JWT access+refresh con rotación y
reuse-detection), **clientes** (validateTaxId real), **expedientes** (máquina de estados),
**documentos** (StorageProvider local/MinIO, versionado, revisión), **tareas** (+ plazos procesales
ES reales con festivos), **ledger + facturación** (IVA 21%+IRPF / ITBIS 18% reales, **Verifactu**
huella+QR+encadenamiento / **e-CF** XML; envíos a AEAT/DGII stubbeados), **portal cliente** (solo
lectura), **chat por expediente + notificaciones en tiempo real** (Socket.IO), **auditoría**
inmutable. Seguridad: throttler (rate limit login/registro), helmet, CORS por `CORS_ORIGINS`.

- Tests: **32 unit (compliance) + 45 e2e (api)**. **CI (GitHub Actions) en verde** (build, lint,
  unit, e2e con Postgres). Husky real.
- Frontend: solo **plomería** (no depende del diseño): `apps/web/src/lib/api.ts` (cliente tipado +
  refresh), `lib/auth.tsx` (AuthProvider/useAuth), `lib/format.ts` (EUR/DOP), y páginas **/login** y
  **/dashboard** funcionales mínimas. **La UI real está pendiente del diseño.**

## Coordinación con Codex

Hay otra IA (Codex) en la tarea. Bitácora compartida obligatoria: **`AI_WORKLOG.md`** (añadir
entrada por bloque de trabajo). Codex hizo la validación de tax-ids y el baseline de lint.

## Documentos clave del repo

- `PLAN.md` — checklist por épicas (E0–E9), casi todo en `[x]`.
- `DECISIONS.md` — ADR ligero (decisiones de diseño).
- `SESSIONS.md` — plan de 3 sesiones (S1 hecha: hardening+CI+plomería; **S2: UI núcleo**; S3:
  facturación/portal/realtime + cierre/merge).
- `DESIGN_PROMPT.md` — prompt para **Claude Design** (estilo Linear/Stripe/Attio, AI-native, 16
  pantallas, bilingüe, 2 jurisdicciones). **El usuario va a generar el diseño y volver con él.**

## Pendiente

1. **UI completa** en `apps/web` (Sesión 2, con el diseño de Claude Design, sobre `lib/api`/`lib/auth`).
2. Decidir **nombre** y hacer rebrand (mecánico).
3. Pulido: i18n exhaustivo de API (E8), reportes fiscales 606/607 y SII más allá del stub (E9).
   ~~Postgres RLS~~ ✅ **hecho** (ver abajo y DECISIONS D-013).
4. Aviso CI no bloqueante: deprecación de Node 20 en actions (subir versiones más adelante).

## Postgres RLS — HECHO (2026-06-14, defensa en profundidad)

- **Activada y cableada.** Políticas RLS en todas las tablas con tenant; la app conecta como rol de
  **mínimo privilegio `legalflow_app`** y fija `app.tenant_id` por request (interceptor + extensión
  Prisma). Enforcement probado: 55 e2e en verde (5 a nivel BD + 5 de wiring + 45 previos). Ver D-013.
- ⚠️ **Cambio de entorno requerido:** el `.env` de la API ahora necesita **dos** URLs:
  `DATABASE_URL` (rol app `legalflow_app:legalflow_app`) y `DIRECT_DATABASE_URL` (rol propietario
  `legalflow:legalflow`, para `prisma migrate`). El `.env` local de dev ya está actualizado; CI
  también. Sin `DIRECT_DATABASE_URL`, `prisma generate`/`migrate` fallan.
- El rol `legalflow_app` lo crea la migración `20260614121000_app_role` (con `migrate deploy`).

## Naming (en curso)

- Requisito inicial: monosílabo + `.com` libre. **Hallazgo de la investigación:** el `.com`
  brandable está **agotado** (verificado por RDAP de Verisign; hasta inventados de 5–7 letras están
  cogidos). Monosílabo `.com` limpio = inviable.
- **`segnora.com` está LIBRE** (+ `.co/.ai/.law/.legal/.io`) — opción real y rara. "Writ" gustó pero
  está tomado.
- Para legal-AI, **`.ai`** es on-brand (Harvey = harvey.ai). Verificados libres en `.co`: `vow.co`,
  `plea.co`, `lex.co`, `clause.co`, `writ.co`; `vow.law`/`plea.law` libres.
- ⚠️ Solo se verifican **dominios**, no marcas (trademark = EUIPO/USPTO/ONAPI + abogado).
- **Decisión pendiente del usuario.** Si elige nombre → rebrand (`@<nombre>/*`, package.json,
  README, i18n, títulos, DESIGN_PROMPT.md).

## Decisiones del usuario (2026-06-14) — VINCULANTES

- **UI: ESPERAR al diseño de Claude Design.** No construir pantallas todavía. Mientras tanto, solo
  trabajo **no visual**: ampliar el SDK de API/tipos en `apps/web/src/lib`, más tests e2e, y E9
  (reportes fiscales **606/607** y **SII** más allá del stub). Cuando llegue el diseño → Sesión 2 (UI completa).
- **Naming: seguir con `@legalflow/*`.** Rebrand (a Segnora u otro) se hará **al final**, es mecánico.
  No renombrar ahora.

## Nota de worktrees / ramas

La única rama válida con todo el trabajo es **`feat/mvp-fase1`** (remoto, `f5868e1`+). Si un chat se
abre en un worktree aislado pinneado a un commit viejo (p. ej. `claude/* @ 4be391c`), **reconciliar
antes de trabajar**: `git fetch origin && git reset --hard origin/feat/mvp-fase1`, y empujar con
`git push origin HEAD:feat/mvp-fase1`. No fragmentar en ramas `claude/*`.

## Siguiente acción recomendada

Otro chat (no visual, ya): reconciliar a `feat/mvp-fase1` y avanzar **E9 reportes 606/607 + SII** y
ampliación del SDK/tests. Diseño: el usuario lanza `DESIGN_PROMPT.md` en Claude Design y vuelve →
entonces Sesión 2 = UI núcleo sobre `lib/api`/`lib/auth`.
