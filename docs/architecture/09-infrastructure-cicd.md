# 09 · Infraestructura y CI/CD

> Pipeline de integración continua con **gates** que codifican las invariantes del sistema (aislamiento
> RLS, cobertura fiscal, gating de rol, seguridad). El despliegue está **activo en Fly.io** (región
> `fra`) con Neon Postgres, Cloudflare R2 y Brevo. Derivado de `.github/workflows/ci.yml`, `CODEOWNERS`,
> `fly.api.toml`, `fly.web.toml`, `RUNBOOK.md`.

## Infraestructura local (docker-compose)

| Servicio             | Imagen             | Rol                                         |
| -------------------- | ------------------ | ------------------------------------------- |
| `legalflow-postgres` | postgres:16-alpine | BD con RLS fail-closed                      |
| `legalflow-minio`    | minio/minio        | Almacén de objetos S3 (documentos cifrados) |
| `legalflow-redis`    | redis              | Backing del `ThrottlerGuard` / futuro       |

> `api` y `web` se ejecutan con `pnpm` en local; sus Dockerfiles existen para despliegue. MinIO crea el
> bucket por defecto al arrancar (`minio-init`).

## Pipeline de CI (9 jobs)

```mermaid
flowchart TB
    setup["setup<br/>install + cache"]
    setup --> lt["lint-typecheck<br/>ESLint + tsc"]
    setup --> unit["unit · GATE<br/>compliance ≥90% + web (vitest) api/auth"]
    setup --> apii["api-integration (RLS) · GATE<br/>e2e Nest como legalflow_app:<br/>aislamiento tenant + 403 de rol"]
    setup --> e2e["web-e2e<br/>Playwright (web↔API real)"]
    setup --> sec["security · GATE<br/>pnpm audit (prod) · licencias · gitleaks · CodeQL"]
    setup --> mig["migration-check<br/>drift: migraciones replayadas ↔ schema.prisma"]
    setup --> build["build<br/>pnpm -r build (monorepo)"]
    lt --> ok
    unit --> ok
    apii --> ok
    e2e --> ok
    sec --> ok
    mig --> ok
    build --> ok["ci-ok<br/>gate agregador (exige todos)"]
```

| Job                       | Qué verifica                                                                                                                                                                              | ¿Gate?                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `setup`                   | Instalación y caché de dependencias                                                                                                                                                       | —                         |
| `lint-typecheck`          | ESLint + `tsc --noEmit` en todo el monorepo                                                                                                                                               | sí                        |
| `unit` (Unit + Coverage)  | **Compliance ≥90%** (Jest) + web (Vitest: cliente API + auth)                                                                                                                             | **sí (fiscal/cobertura)** |
| `api-integration` (RLS)   | Aplica migraciones (crea `legalflow_app` + `legalflow_system` + RLS), corre e2e Nest **como rol app** → **aislamiento de tenant** y **403 de rol** (un superusuario los pasaría en falso) | **sí (RLS/rol)**          |
| `web-e2e` (Playwright)    | Build API+Web y flujos reales web↔API                                                                                                                                                     | sí                        |
| `security`                | `pnpm audit --prod` (alta/crítica), **gate de licencias** (`scripts/check-licenses.mjs`), **Gitleaks**, **CodeQL**                                                                        | **sí (seguridad)**        |
| `migration-check` (Drift) | Shadow DB: las migraciones replayadas deben cuadrar con `schema.prisma`                                                                                                                   | sí                        |
| `build`                   | `pnpm -r build` del monorepo                                                                                                                                                              | sí                        |
| `ci-ok`                   | Agregador: exige que los 7 jobs anteriores pasen                                                                                                                                          | **sí (gate final)**       |

> **Nota de recuento:** son **9** jobs. `CodeQL` aparece como _check_ separado en GitHub porque es un
> paso (Initialize + Analysis) dentro del job `security` que publica su propio resultado.
> El gate `api-integration` es deliberadamente exigente: ejecuta como `legalflow_app` (NOBYPASSRLS)
> porque un rol privilegiado **saltaría RLS y los tests pasarían en falso**.

## Branch protection + CODEOWNERS

`main` está protegida; las rutas sensibles requieren revisión del owner. **9 rutas** en
`.github/CODEOWNERS`:

```
/apps/api/prisma/            /apps/api/src/auth/          /apps/api/src/prisma/
/packages/compliance/        /apps/web/src/middleware.ts  /apps/web/src/lib/api.ts
/apps/web/src/lib/scope.ts   /apps/web/src/app/api/auth/  /.github/
```

Son exactamente las piezas de **auth, RLS, compliance y sesión** — cambiarlas exige aprobación. (Por
eso el fix del bootstrap de refresh se sacó a PR aparte aunque `auth.tsx` no esté literalmente listado:
es lógica de sesión.)

## Despliegue (producción en Fly.io)

```mermaid
flowchart LR
    user(["Usuario"]) --> edge["Fly edge · TLS · HSTS"]
    edge --> webp["lawzora-web (Next.js)<br/>fra · 1GB · auto-stop"]
    edge --> apip["lawzora-api (NestJS)<br/>fra · 512MB · ≥1 fija (cron)"]
    webp -->|BFF| apip
    apip --> pgp[("Neon Postgres · fra<br/>sslmode=require · 3 roles · RLS")]
    apip --> objp[("Cloudflare R2 · S3<br/>blobs AES-256-GCM")]
    apip --> mail["Brevo · SMTP"]
    apip --> sec["Secrets de Fly<br/>SYSTEM_DATABASE_URL · DATA_ENCRYPTION_KEY · JWT_* · STRIPE_* · ..."]
```

- **API (`lawzora-api`, `fly.api.toml`):** región `fra`, `shared-cpu-1x`/512MB, **mínimo 1 instancia
  fija** (no auto-stop) porque ejecuta el **cron interno** (dunning/billing). `release_command` corre
  `prisma migrate deploy`; healthcheck `GET /api/health`.
- **Web (`lawzora-web`, `fly.web.toml`):** región `fra`, 1GB, auto-stop. `NEXT_PUBLIC_API_URL` se hornea
  en build → **deploy manual** (`flyctl deploy -c fly.web.toml --remote-only`) cuando cambia el front.
- **Datos:** Neon Postgres (Frankfurt) con los 3 roles (`direct`/`app`/`system`); Cloudflare R2 como
  almacén de objetos S3-compatible. Dominios `lawzora.com` / `www` / `api` con certificados emitidos.
- **Secretos:** gestionados como Fly secrets (equivalente al gestor del [RUNBOOK §4](../../RUNBOOK.md)):
  joyas de la corona + claves de terceros (Stripe, OAuth, Signaturit, Brevo, IA). Ver
  [04-encryption-and-secrets.md](04-encryption-and-secrets.md).
- Checklist previo a producción en [RUNBOOK §4](../../RUNBOOK.md): roles de BD con contraseñas fuertes,
  secretos en gestor, TLS+HSTS, `sslmode=require`, cifrado de disco y backups, migraciones con rol
  propietario, smoke (login→dashboard, round-trip de documento cifrado, aislamiento de tenant).
