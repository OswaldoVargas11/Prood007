# LegalFlow

SaaS de gestión para despachos de abogados, diseñado desde el día uno para operar en **dos
jurisdicciones**: **España (`es`)** y **República Dominicana (`do`)**.

> Cuña comercial: cumplimiento de la **facturación electrónica obligatoria** (Verifactu/AEAT en
> España, e-CF/DGII en RD) como gancho de entrada en ambos mercados.

## Principio arquitectónico (no negociable)

**Núcleo agnóstico de jurisdicción + adaptadores de cumplimiento enchufables.**
Toda la lógica común (expedientes, clientes, documentos, tareas, tiempo, ledger, portal, IA) no
conoce ninguna ley concreta. Lo específico de cada país vive detrás de `ComplianceProvider`, con
una implementación por jurisdicción (`SpainComplianceProvider`, `DominicanComplianceProvider`),
seleccionada en runtime según `tenant.jurisdiction`. Añadir un tercer país = escribir un nuevo
provider, sin tocar el núcleo.

## Estructura

```
legalflow/
  apps/
    api/        # NestJS (backend modular)
    web/        # Next.js (App Router) + Tailwind + shadcn/ui
  packages/
    domain/     # entidades y tipos compartidos (agnósticos)
    compliance/ # interfaz ComplianceProvider + providers es/ y do/
    config/     # tsconfig, eslint, prettier compartidos
  docker-compose.yml
  PLAN.md       # plan de tareas (épicas) — seguible
  DECISIONS.md  # registro de decisiones de diseño
```

## Requisitos previos

- **Node.js 20 LTS+**
- **pnpm 9** — `corepack enable && corepack prepare pnpm@latest --activate`
- **Docker Desktop** (Postgres + MinIO + Redis en local)

> ⚠️ El andamiaje se creó en una máquina **sin** Node/pnpm/Docker. Antes de arrancar hay que
> instalar el toolchain y ejecutar `pnpm install` + migraciones. Ver `DECISIONS.md` (D-001).

## Puesta en marcha (cuando el toolchain esté instalado)

```bash
cp .env.example .env
docker compose up -d            # Postgres, MinIO, Redis
pnpm install
pnpm db:migrate                 # migración inicial Prisma
pnpm api:dev                    # API en http://localhost:4000
pnpm web:dev                    # Web en http://localhost:3000
```

## Stack

NestJS · Prisma + PostgreSQL · Next.js · Tailwind + shadcn/ui · JWT + RBAC · Socket.IO ·
S3/MinIO · next-intl (es-ES / es-DO) · Jest.

Consulta `PLAN.md` para el estado del MVP por épicas.
