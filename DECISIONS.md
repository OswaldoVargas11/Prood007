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

- **Decisión:** aislamiento _row-level_ por `tenantId` en cada tabla de negocio, con índices
  compuestos `(tenantId, ...)`. Se deja preparado el camino a **Postgres RLS** (policies por
  `current_setting('app.tenant_id')`). _Actualización: RLS ya está **activada** como defensa en
  profundidad, ver **D-013**._
- **Decisión:** identificadores `cuid()`. Campos monetarios en `Decimal(18,2)` (no float).
  Impuestos/tasas como `Decimal`. Timestamps `createdAt/updatedAt`.
- **Decisión:** `AuditLog` modelado _append-only_ a nivel de aplicación (sin update/delete
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

## D-012 · Paquetes compartidos en CommonJS · Aceptada

- **Contexto:** `domain` y `compliance` se autoraron como ESM (`"type":"module"` +
  specifiers `.js`). Al ejecutar de verdad, esto rompía Jest y chocaba con NestJS (CommonJS).
- **Decisión:** compilar ambos paquetes a **CommonJS** (`module=commonjs`,
  `moduleResolution=node`, sin extensiones `.js` en imports). La web (Next.js) los transpila vía
  `transpilePackages`, así que no pierde nada.
- **Decisión:** cada paquete que use `extends` de `@legalflow/config` debe declararlo como
  dependencia (`workspace:*`) para que TS resuelva el `tsconfig.base.json`.
- **Consecuencia:** build y tests verdes en todo el monorepo; interоp limpio con Nest.

## D-011 · IA solo contrato · Aceptada

- **Decisión:** `AiAssistantProvider` definido como interfaz (sin implementación) con métodos
  de redacción/resumen/revisión que exigen `sources` (citación) y devuelven señales de
  confianza, alineado con trazabilidad del AI Act. No se cablea en el MVP.

## D-013 · Postgres RLS activa como defensa en profundidad · Aceptada

- **Contexto:** D-004 dejó RLS "preparada pero no activada". El aislamiento real seguía dependiendo
  solo de que cada servicio filtrara por `tenantId`; un olvido = fuga cross-tenant.
- **Decisión:** activar **Row-Level Security** en todas las tablas con `tenantId` (+ `Tenant` por su
  `id` e `InvoiceLine` por su factura), con política `tenant_isolation` que compara contra
  `app.tenant_id` (GUC de sesión). La app fija el GUC **transaction-local** por request con el tenant
  del usuario autenticado; sin contexto, las políticas hacen **bypass** (rutas de sistema: login,
  registro de despacho, rotación de tokens, siembra de catálogo).
- **Decisión (rol de mínimo privilegio):** Postgres NO aplica RLS a superusuarios ni a roles
  `BYPASSRLS`, ni siquiera con `FORCE`. Por eso el **runtime conecta como `legalflow_app`** (sin
  superusuario, sin bypass, no propietario, solo DML). Las **migraciones** usan el rol privilegiado
  vía `directUrl`. Dos URLs: `DATABASE_URL` (app) y `DIRECT_DATABASE_URL` (migraciones).
- **Sutileza Postgres (corregida):** un GUC placeholder fijado alguna vez se resetea a `''` (no
  `NULL`) al fin de la transacción. La función `app_current_tenant()` normaliza con `NULLIF` para que
  el bypass sea fiable en conexiones reutilizadas del pool (si no, login se rompería tras el primer
  request autenticado).
- **No cubiertas por RLS (intencional):** `Permission` (catálogo global), `RolePermission`/`UserRole`
  (puente, acceso vía padres), `RefreshToken` (clave por userId, solo ruta de sistema).
- **Trade-offs / consecuencias:** (1) las operaciones puntuales se envuelven en una mini-transacción
  para fijar el GUC (coste asumible; patrón oficial de Prisma). (2) `CREATE ROLE` con contraseña dev
  vive en la migración (idempotente; en prod el rol se provisiona fuera de banda con contraseña
  fuerte y la migración solo re-aplica GRANTs). (3) requiere `DIRECT_DATABASE_URL` en todos los
  entornos (.env, CI).
- **Wiring (cableado en runtime):** un interceptor global fija el contexto de tenant
  (`AsyncLocalStorage`) desde `req.user` tras los guards; una extensión de Prisma envuelve cada
  operación en una transacción que ejecuta `set_config('app.tenant_id', …)` antes de la query. Flujos
  multi-sentencia usan `tenantTransaction()` (fija el GUC una vez, sin anidar).
- **WebSocket (fail-open cerrado):** el interceptor también resuelve el tenant en contexto `ws`
  (`socket.data.tenantId`, que fija el gateway en el handshake), y el `RealtimeGateway` envuelve
  además su query en `runWithTenant` como garantía explícita. Así los handlers `@SubscribeMessage`
  operan bajo RLS, no en bypass.
- **Probado:** 60 e2e en verde como `legalflow_app`: 5 a nivel de BD (GUC manual), 5 de wiring
  (`runWithTenant` → query sin filtro acotada por RLS, cross-tenant denegado, WITH CHECK), 5 de
  realtime/WS (la query del gateway corre bajo contexto de tenant; interceptor resuelve http/ws), y
  las 45 existentes sin cambios. **RLS completa y con enforcement verificado.**
