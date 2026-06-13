# DECISIONS.md — Registro de decisiones de diseño (ADR ligero)

Cada entrada documenta una decisión tomada de forma autónoma durante la construcción, con su
contexto y trade-offs, para que puedas revisarla y revertirla si procede.

Formato: `ID · Título · Estado` → Contexto / Decisión / Consecuencias.

---

## D-000 · Repositorio aislado en `Prod007` · Aceptada
- **Contexto:** el directorio de trabajo `Prod007` estaba vacío pero heredaba un repo git
  inicializado en el **home del usuario** (`C:\Users\OswaldoVargasRodrigu`), que rastreaba
  `.ssh/`, `NTUSER.DAT`, certificados, PDFs de clientes, etc.
- **Decisión:** `git init -b main` dentro de `Prod007` para aislar LegalFlow. No se toca el
  repo del home.
- **Consecuencias:** los commits de LegalFlow nunca arriesgan exponer credenciales del home.
  Pendiente recomendar al usuario revisar/eliminar el `.git` accidental del home.

## D-001 · Entorno sin toolchain · Aceptada (con bloqueo de ejecución)
- **Contexto:** la máquina solo tiene `git`. No hay Node.js, npm, pnpm, corepack ni Docker.
- **Decisión:** autorar todo el andamiaje como **archivos correctos** (configs, schema,
  TypeScript, docker-compose) sin ejecutar instaladores ni builds.
- **Consecuencias / acción requerida del usuario:** instalar **Node 20 LTS+**, **pnpm 9**
  (`corepack enable && corepack prepare pnpm@latest --activate`) y **Docker Desktop**. Después:
  `pnpm install`, `docker compose up -d`, `pnpm --filter @legalflow/api prisma:migrate`.
  Las versiones de dependencias en los `package.json` son razonables y recientes pero **no se
  han resuelto/instalado**; pueden requerir ajuste menor al primer `install`.

## D-002 · Monorepo con pnpm workspaces · Aceptada
- **Decisión:** `apps/{api,web}` + `packages/{domain,compliance,config}` según lo pedido.
  Paquetes internos referenciados con `workspace:*` y namespace `@legalflow/*`.
- **Trade-off:** Turborepo aportaría caché de tareas, pero añade dependencia; se deja para más
  adelante. Por ahora scripts pnpm recursivos.

## D-003 · Frontera del núcleo agnóstico · Aceptada
- **Decisión:** **ninguna** ley/país aparece en `apps/api` (núcleo) ni en `packages/domain`.
  Todo lo específico de jurisdicción vive en `packages/compliance` detrás de
  `ComplianceProvider`. El núcleo recibe el provider por inyección (factory que lee
  `tenant.jurisdiction`).
- **Consecuencia:** añadir un tercer país = nuevo provider, sin tocar núcleo.

## D-004 · Modelado Prisma multi-tenant · Aceptada
- **Decisión:** aislamiento *row-level* por `tenantId` en cada tabla de negocio, con índices
  compuestos `(tenantId, ...)`. Se deja preparado el camino a **Postgres RLS** (policies por
  `current_setting('app.tenant_id')`) documentado pero no activado en el MVP.
- **Decisión:** identificadores `cuid()`. Campos monetarios en `Decimal(18,2)` (no float).
  Impuestos/tasas como `Decimal`. Timestamps `createdAt/updatedAt`.
- **Decisión:** `AuditLog` modelado *append-only* a nivel de aplicación (sin update/delete
  expuestos); endurecible con trigger/RLS en Postgres.

## D-005 · Auth: JWT access + refresh con rotación · Aceptada
- **Decisión:** access token corto (15 min) + refresh token largo (7 días) **persistido y
  hasheado** (`RefreshToken`) para permitir revocación y rotación. argon2 para contraseñas.
- **Trade-off:** sesiones stateless puras serían más simples pero no permiten revocación; los
  datos legales exigen poder cortar sesiones.
- **Estado:** modelado en schema; implementación en E1.

## D-006 · RBAC con roles + permisos · Aceptada
- **Decisión:** roles base `CLIENT`, `LAWYER`, `FIRM_ADMIN`. Relación `Role`↔`Permission`
  por si se necesita granularidad fina más adelante; el MVP resuelve por rol.

## D-007 · Modelo fiscal en la factura · Aceptada
- **Decisión:** `Invoice` guarda importes neutrales (base, impuestos, total, retención) y un
  campo JSON `complianceRecord` con la estructura específica del país (registro Verifactu o
  XML e-CF) generada por `buildInvoiceRecord`. El núcleo no interpreta ese JSON.
- **Encadenamiento Verifactu:** se prevé `previousHash`/`hash` en el registro fiscal para la
  cadena inalterable; el cálculo real va en el provider ES (E5/E9).

## D-008 · Storage detrás de interfaz · Aceptada
- **Decisión:** `StorageProvider` con impl. S3-compatible (MinIO en dev) y disco local. El
  núcleo solo conoce la interfaz.

## D-009 · i18n · Aceptada
- **Decisión:** web con `next-intl` (App Router), locales `es-ES` y `es-DO`. Mensajes de API
  con claves i18n. Moneda y locale derivados del tenant.

## D-010 · Realtime · Aceptada
- **Decisión:** Socket.IO en NestJS (`@nestjs/websockets`) para notificaciones y chat por
  expediente; Redis como adaptador para escalado horizontal (pub/sub) — preparado en
  docker-compose.

## D-011 · IA solo contrato · Aceptada
- **Decisión:** `AiAssistantProvider` definido como interfaz (sin implementación) con métodos
  de redacción/resumen/revisión que exigen `sources` (citación) y devuelven señales de
  confianza, alineado con trazabilidad del AI Act. No se cablea en el MVP.
