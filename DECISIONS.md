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

## D-014 · Integración del prototipo Lexora → frontend real (Paso 0) · Aceptada

Inspección previa a escribir UI (no asumir contratos). Hallazgos:

- **`apps/web` actual:** andamiaje next-intl con locales **`es-ES`/`es-DO`** ya configurado (sin EN en
  código; el EN solo vivía en el prototipo). Tailwind 3 con `extend` vacío, `globals.css` solo con
  `@tailwind`. Plomería previa: `lib/api` (tokens en localStorage), `lib/auth` (context), `lib/format`.
  No hay shadcn, TanStack Query ni sistema de tema.
- **Contrato de auth (real, no inventado):** `POST /api/auth/login {email,password,tenantId?}` →
  `TokenPair {accessToken,refreshToken,tokenType:'Bearer',expiresIn}` **en el cuerpo JSON** (200).
  `POST /api/auth/refresh {refreshToken}` y `POST /api/auth/logout {refreshToken}` igual.
  `GET /api/auth/me` → `{userId,tenantId,jurisdiction,email,roles}`. El refresh JWT NO lleva rol
  (`sub,tid,jti`); el rol va en el access JWT. **El cliente nunca envía `tenantId`** (lo fija el
  servidor por RLS).
- **OpenAPI/Swagger:** NO hay. → se reutilizan tipos de `@legalflow/domain` y se tipan a mano.
- **CORS:** en dev `enableCors({ origin: true, credentials: true })` ya refleja el origen del web con
  credenciales. No requiere cambios para dev.

Decisiones:

- **Auth httpOnly sin tocar el backend (BFF):** como la API devuelve el refresh en el cuerpo y se
  prefiere httpOnly, el web expone **Route Handlers** (`app/api/auth/{login,refresh,logout}`) que
  hacen de _backend-for-frontend_: proxyan a Nest y guardan el **refresh en una cookie httpOnly del
  origen del web** (SameSite=Lax). El **access token vive en memoria** (no localStorage). Las llamadas
  de datos van directas a Nest con `Authorization: Bearer`. Así se honra "access en memoria + refresh
  httpOnly" sin cambiar el contrato probado del backend.
- **Protección de rutas:** el middleware (next-intl + auth) redirige a login si falta la cookie de
  sesión, y a dashboard si sobra. El gate **por rol** (CLIENT → solo portal) se hace en el shell de
  cliente con los datos de `/me` (el middleware no puede leer el rol de una cookie opaca).
- **Estado de servidor:** TanStack Query (sin fetch suelto). **i18n:** locale gobierna formato/moneda;
  la **jurisdicción del tenant** gobierna copy fiscal (Verifactu/IVA vs e-CF/ITBIS, NIF/CIF vs RNC) —
  nunca hardcodeado. **Nombre de producto mostrado:** `Lexora` (vía clave i18n `app.name`); el rebrand
  de paquetes `@legalflow/*` sigue diferido (HANDOFF). Trabajo por **slices verticales** (ver PLAN F0–F7).

## D-015 · Gate de rol en middleware de servidor (cookie de ámbito) · Aceptada

- **Contexto:** F0 protegía la autenticación en el middleware (servidor) por la cookie de sesión, pero
  el gate por ROL (CLIENT → solo portal) era client-side (en el shell), saltable con JS desactivado.
  El backend ya bloquea de verdad (RBAC + RLS), pero se quería impedir incluso cargar la ruta.
- **Decisión:** el BFF, que ya recibe el access token en login/refresh, deriva el ámbito
  (`firm` si hay rol staff FIRM_ADMIN/LAWYER; si no, `client`) decodificando el JWT (solo para
  enrutar, sin verificar firma — el token viene de nuestro backend) y lo fija en una cookie
  **httpOnly `lf_scope`**. El **middleware** la lee y redirige en servidor: `client` fuera del portal →
  `/portal`; `firm` en el portal → `/dashboard`. La verificación real sigue en el backend.
- **Consecuencia:** un CLIENT no puede siquiera cargar las rutas de la firm app aunque desactive JS.
  Probado E2E (firm: /portal→/dashboard; client real creado vía portal-user: /dashboard→/portal). El
  shell de cliente se mantiene como defensa en profundidad. Helper puro `lib/scope.ts` con tests.

## D-016 · Estrategia de pruebas y 4 gates obligatorios de CI · Aceptada

- **Paso 0 (inspección previa, sin tocar nada):** el `ci.yml` previo era **un solo job** monolítico
  (`build-test`): install → `pnpm -r build` → lint → unit de compliance → `prisma migrate deploy` →
  e2e de API. Estaba en verde. Hallazgos: no había scripts `typecheck`, **ni Playwright**, ni umbrales
  de cobertura configurados, ni CODEOWNERS/Dependabot. Tests existentes: compliance (Jest, 4 specs),
  API (Jest e2e contra Postgres real: auth, clients-matters, documents, ledger, tasks, **rls**,
  **rls-wiring**, **realtime-tenant-context**, **security**, **portal-realtime**, **tanda-b**,
  dashboard), web (Vitest: api client, scope, matter-status). El aislamiento RLS y los 403 de rol ya
  se enforaban a nivel de e2e de API ejecutando como `legalflow_app`.
- **Pirámide adoptada:** (1) **unitarias** rápidas sin red/BD — `compliance` (fiscal/IDs/plazos/
  facturación), `domain`, y `web` (cliente API + auth/ámbito) con Vitest; (2) **integración** —
  módulos de API contra Postgres real como rol de mínimo privilegio (RLS efectiva); (3) **e2e** —
  Playwright web→API (smoke ahora: login BFF + 403 de rol; flujo núcleo como continuación). Contrato
  OpenAPI: N/A (no hay Swagger; el web tipa contra `@legalflow/domain`).
- **4 GATES OBLIGATORIOS (bloquean merge):**
  1. **Aislamiento de tenant / RLS** — e2e de API ejecutados como `legalflow_app` (un superusuario
     saltaría RLS y los tests pasarían en falso). Job `api-integration`.
  2. **Cálculo fiscal (compliance)** — umbral **≥90%** (statements/lines/functions/branches) en
     `packages/compliance` (`jest.config.cjs > coverageThreshold`). Job `unit`.
  3. **Aislamiento de roles (403)** — e2e de API (`security`, `portal-realtime`, `tanda-b`) + smoke
     Playwright (CLIENT redirigido fuera de la firm app). Jobs `api-integration` + `web-e2e`.
  4. **Cobertura mínima en paquetes críticos** — compliance ≥90%; **auth de API** (medida desde los
     e2e: floor 88/88/85/65 stmts/lines/funcs/branches, objetivo de ratchet 90+ al cubrir ramas de
     error); **cliente API + auth del web** (Vitest scoped a `lib/api.ts`+`lib/scope.ts`: 90/90/90/85).
- **Higiene:** seed determinista en CI (cada e2e usa identificadores únicos por `Date.now()`); RLS se
  reaplica por migración sobre BD limpia del service container; **reintentos solo en Playwright (máx 2)**
  — unit e integración con 0 reintentos para no ocultar bugs. Informes de cobertura subidos como
  artefactos del workflow.
- **Tests añadidos para cumplir el gate fiscal** (sin tocar lógica de producción): rutas de error de
  `computeInvoiceTotals` (código fiscal desconocido / retención mal usada), ramas de control del CIF
  (letra obligatoria vs dígito), stubs de providers (LexNET/SII/606-607) y `factory` por defecto.
  Resultado compliance: 99.5% stmts / 92% branch / 100% funcs / 99.5% lines.

## D-017 · Gate de seguridad: audit de producción, licencias y secretos · Aceptada

- **Contexto:** `pnpm audit` sobre el árbol completo marca 14 high + 1 critical, casi todo **tooling de
  dev** (`tmp` vía @nestjs/cli, `esbuild` vía vitest/vite) que **no se despliega**. El árbol de
  **producción** marca 9 high (next ×5, multer ×3, lodash ×1) y 0 critical.
- **Decisión (gate):** el job de seguridad bloquea sobre **`pnpm audit --prod --audit-level high`**
  (lo que de verdad se envía). El audit del árbol completo se ejecuta **informativo, no bloqueante**.
- **Allowlist revisada (`pnpm.auditConfig.ignoreGhsas` en el `package.json` raíz):** los 9 high de
  producción son de framework/transitivos sin arreglo dentro de la major actual (next solo se corrige
  en **v15.5.16+** → migración mayor, fuera del alcance de montar CI; multer/lodash exigirían overrides
  con riesgo de rotura). Se aceptan **temporalmente y documentados**; el gate sigue **bloqueando
  cualquier high/critical de producción NUEVO** que no esté en la lista. **Remediación rastreada**
  (tarea de fondo): migrar a Next 15 y revisar overrides de multer/lodash. Nota: una de las advisories
  de next (GHSA-36qx-fr4f-26g5, _middleware bypass en apps i18n_) merece verificar que no afecta al
  gate de rol del middleware (D-015) al migrar.
- **Licencias:** `scripts/check-licenses.mjs` sobre `pnpm licenses list --prod --json` falla ante
  copyleft fuerte / fuente no abierta (AGPL/GPL/SSPL/BUSL/Commons-Clause/CC-BY-NC). LGPL permitido.
- **Secretos:** `gitleaks` sobre el historial completo. **SAST:** CodeQL (javascript-typescript);
  el repo es público, así que CodeQL es gratuito.

## D-018 · Diseño del pipeline CI (ADR) · Aceptada

- **Forma:** un workflow `CI` en `pull_request` y `push` a `main`/`feat/**`, con `concurrency` que
  cancela runs obsoletos del mismo ref. Permisos mínimos por defecto (`contents: read`); el job de
  seguridad eleva a `security-events: write` para CodeQL.
- **Jobs (paralelos tras `setup`):** `setup` (install con caché del store de pnpm + build de paquetes
  compartidos, vía **composite action** `.github/actions/setup` para no repetirse) → `lint-typecheck`,
  `unit` (+cobertura), `api-integration` (Postgres service + migraciones con `DIRECT_DATABASE_URL` +
  e2e como `legalflow_app`), `web-e2e` (Postgres + API:4000 + web:3000 + Playwright), `security`,
  `migration-check` (drift: replay de migraciones en BD shadow ↔ `schema.prisma` con
  `prisma migrate diff --exit-code`), `build` (`pnpm -r build`: compila de verdad, no solo tipa).
- **Gate agregado `ci-ok`:** depende de los 7 jobs sustantivos y falla si alguno falla/se cancela;
  es el **único check** cómodo de exigir en branch protection (los 4 gates + lint + typecheck + build
  - security quedan dentro).
- **Caché de artefactos vs. re-install:** se optó por **re-instalar en cada job** (rápido por la caché
  del store de pnpm) en lugar de pasar `node_modules`/`dist` como artefactos (frágil y pesado). El
  cliente Prisma se genera en `postinstall`.
- **Dos URLs de Postgres (clave para RLS):** migraciones con el rol privilegiado (`DIRECT_DATABASE_URL`)
  que crea `legalflow_app` y las policies; runtime/tests con `DATABASE_URL` = `legalflow_app` (sin
  superusuario, sin BYPASSRLS) para que el aislamiento se pruebe de verdad.
- **CD (pendiente, NO activado):** build+push de imágenes a GHCR por SHA/latest en push a `main`, deploy
  a `staging` con `prisma migrate deploy`, y un job de **producción como entorno protegido con
  aprobación manual** + backup previo + rollback — **cableado pero desconectado** hasta elegir hosting.
  No se construye en esta tanda (se entrega CI verde primero).

## D-019 · Remediación de los 9 advisories de producción; allowlist vacía · Aceptada

- **Contexto:** D-017 aceptó **temporalmente** 9 high de producción (next ×5, multer ×3, lodash ×1) en
  `pnpm.auditConfig.ignoreGhsas`, con remediación rastreada (migrar Next 15; overrides de multer/lodash).
- **multer y lodash (overrides):** al reinstalar, `@nestjs/platform-express@10.4.22` ya resolvía
  `multer@2.0.2` (no 1.x) y `minio` ya traía `lodash@4.18.1` — el riesgo real era menor que el previsto.
  Se fijan **`pnpm.overrides`**: `multer ^2.1.1` (cierra GHSA-xf7r-hgr6-v32p / GHSA-v52c-386h-88mc /
  GHSA-5528-5vmv-3xc2; parche en 2.1.0/2.1.1) y `lodash ^4.18.0` (cierra GHSA-r5fr-rjxr-66jc; parche en
  4.18.0). Ambos **dentro del mismo major → sin rotura de API**; e2e de API (74) en verde, incl. subida
  de documentos (multer).
- **Next 14→15 (migración mayor):** los 5 advisories de next exigen **>=15.5.16**; se fija
  **`next ^15.5.19`** (último 15.5.x) + `eslint-config-next ^15.5.19`. **Se mantiene React 18.3** (Next
  15.5 acepta `react ^18.2.0` en peers; evita arrastrar React 19 y bumps en cascada de Radix/testing-
  library). **next-intl 3.26.5** ya soporta Next 15 + React 18 → sin bump mayor (floor subido a `^3.26.0`).
- **Superficie de código real (mínima):** las APIs de request asíncronas de Next 15 solo afectaban a
  `cookies()` en `lib/server/session.ts` (4 funciones → `async` + `await cookies()`) y sus 4 route
  handlers BFF (login/logout/refresh/register-tenant → `await`). Los layouts/páginas server ya usaban
  `params: Promise<…>` con `await`; todas las páginas `[id]` son client components con `useParams()`
  (no afectadas). `next.config.mjs` y `tsconfig` (ya en `moduleResolution: bundler`) sin cambios.
- **GHSA-36qx-fr4f-26g5 (bypass middleware/i18n) y el gate de rol D-015:** el advisory es específico de
  **Pages Router con `i18n` nativo de Next**. Esta app es 100% **App Router** y el i18n lo gestiona el
  middleware de **next-intl** (no hay clave `i18n` en `next.config`), así que el patrón vulnerable no
  estaba presente; el bump a 15.5.19 lo cierra igual. **Verificado E2E:** los smoke de Playwright de
  aislamiento de rol siguen en verde (CLIENT → /portal; FIRM_ADMIN → /dashboard).
- **Allowlist vaciada:** removidos los 9 GHSAs; `pnpm.auditConfig.ignoreGhsas: []`.
  **`pnpm audit --prod --audit-level high` pasa con exit 0 sin excepciones** (quedan 7 moderate, bajo el
  umbral). El gate sigue **bloqueando cualquier high/critical de prod NUEVO**. Suite completa en verde:
  typecheck/lint/build del monorepo, web unit (Vitest, gate), API e2e (74, RLS+roles+auth), Playwright (5).

## D-020 · RLS a FAIL-CLOSED + rol de sistema con BYPASSRLS · Aceptada (PR abierto, pendiente de revisión)

- **Contexto:** D-013 dejó RLS **fail-open**: sin contexto de tenant (`app.tenant_id` sin fijar) las
  políticas permitían TODO (`app_current_tenant() IS NULL OR "tenantId" = …`). El bypass cubría las
  rutas de sistema (login/registro/refresh), pero acoplaba el aislamiento a "acordarse" de fijar el GUC:
  un olvido de contexto en cualquier punto (un `$queryRaw`, un `$transaction` crudo, un handler nuevo)
  se convertía en **fuga cross-tenant silenciosa** en lugar de en un error visible.
- **Decisión (fail-closed):** la migración `20260615120000_rls_fail_closed` reescribe todas las políticas
  `tenant_isolation` quitando la cláusula de bypass. Ahora `USING/WITH CHECK` es solo
  `"tenantId" = app_current_tenant()` (Tenant por `id`; InvoiceLine por su factura). Sin contexto,
  `app_current_tenant()` es NULL → `"tenantId" = NULL` es NULL → **cero filas** en lectura y **rechazo por
  WITH CHECK** en escritura. El aislamiento ya no depende de la disciplina del código: es el default.
- **Decisión (rutas cross-tenant legítimas por privilegio, no por ausencia de contexto):** login (busca
  el email entre despachos), registro de despacho (crea el tenant) y `loadUserForToken` (lee User/Tenant
  para emitir el token) corren SIN usuario autenticado. Pasan **explícitamente** por un cliente Prisma de
  **sistema** (`SystemPrismaService`) conectado como rol **`legalflow_system` con `BYPASSRLS`** vía
  `SYSTEM_DATABASE_URL`. El bypass es un privilegio de rol deliberado y auditable, no un descuido. Este
  cliente **no** lleva la extensión RLS (no fija el GUC) y solo se usa en `AuthService`/`TokensService`.
- **Tres roles de BD ahora:** `legalflow` (propietario/privilegiado → migraciones, `DIRECT_DATABASE_URL`),
  `legalflow_app` (mínimo privilegio, NOBYPASSRLS → runtime, `DATABASE_URL`), `legalflow_system`
  (BYPASSRLS, no superusuario, no propietario → solo rutas de sistema, `SYSTEM_DATABASE_URL`). El rol de
  sistema se crea en la migración (requiere superusuario; lo es en dev/CI); en prod se provisiona fuera de
  banda con contraseña fuerte. **`SYSTEM_DATABASE_URL` es ahora la "joya de la corona"** (salta TODO el
  aislamiento): secreto fuerte, aparte, nunca logueado, nunca usado fuera de `SystemPrismaService`. Cambia
  el modelo de amenaza: de "fail-open al olvidar contexto" a "una credencial BYPASSRLS que custodiar"
  (trade correcto: bypass explícito y estrecho > implícito y amplio). **En producción es obligatorio**: si
  falta `SYSTEM_DATABASE_URL`, el arranque **lanza un error** en vez de "fallar hacia más privilegio"
  corriendo como propietario/superusuario. El fallback a `DIRECT_DATABASE_URL` (con aviso) queda **solo
  para dev/CI**.
- **Efectos colaterales corregidos:** (1) `users.service` usaba un `$transaction` crudo (no fijaba el GUC)
  → migrado a `tenantTransaction` (lo fija al inicio). (2) El gateway Socket.IO ya fijaba el contexto del
  tenant del socket en `subscribeMatter` (`runWithTenant`) desde D-013; bajo fail-closed eso pasa de ser
  defensa adicional a **requisito** para que el realtime vea datos. (3) Las pruebas e2e que sembraban o
  limpiaban cross-tenant por "ausencia de contexto" ahora usan el cliente de sistema; las que afirmaban la
  semántica fail-open ("sin contexto se ve todo") se **invirtieron** a fail-closed ("sin contexto, cero
  filas").
- **Probado (local, como `legalflow_app`):** **90/90 e2e en verde**, typecheck y lint limpios. Tests clave:
  `rls.e2e` (fail-closed: sin contexto cero filas + rechazo de INSERT; el rol de sistema sí ve ambos
  tenants), `rls-wiring.e2e` (la extensión bajo contexto acota por RLS; sin contexto, cero filas),
  `realtime-tenant-context` (la query del gateway corre bajo el tenant del socket). Pendiente: verde en CI
  real (gate `api-integration` corre como `legalflow_app`; se añadió `SYSTEM_DATABASE_URL` a los jobs que
  ejecutan la API).
- **Trade-offs:** un tercer rol/URL añade superficie de configuración (documentado en `.env.example` y CI).
  A cambio, el aislamiento es **a prueba de olvidos**: cualquier ruta nueva que olvide el contexto falla de
  forma ruidosa (cero filas / error), nunca filtra. Es la postura correcta para datos legales.

## D-021 · Cifrado en reposo (contenido de documentos) + TLS en el borde · Aceptada

- **Contexto (Tarea 3):** los datos más sensibles son el **contenido de los documentos** (binario, no
  consultable) y la **PII de clientes** (nombre, identificador fiscal, contacto). Faltaba cifrado en
  reposo y documentar TLS en tránsito.
- **Decisión (empezar por lo más sensible — contenido de documentos):** cifrado **a nivel de aplicación**
  (envelope **AES-256-GCM**) mediante un **decorador `EncryptedStorageProvider`** que envuelve cualquier
  `StorageProvider` (local, MinIO, S3). Cifra en `put`, descifra en `get`; **transparente** para
  `DocumentsService` y **agnóstico del backend** (respeta D-008). Formato `[MAGIC|IV|TAG|ciphertext]`: el
  MAGIC permite **passthrough de objetos legacy en claro** (migración suave, sin reescribir lo ya subido),
  y GCM **autentica** (manipular el blob hace fallar el descifrado). La descarga pasa por la API
  (streaming desde `get()`), no por `getSignedUrl`, así que el cliente nunca recibe el blob cifrado.
- **Gestión de clave (2ª "joya de la corona"):** `DATA_ENCRYPTION_KEY` (32 bytes en base64). Secreto
  fuerte, en KMS/secrets-manager, **nunca logueado**. **Pérdida = pérdida de TODOS los documentos** (no
  descifran); **fuga = todos legibles**. **Obligatoria en producción**: si falta, el arranque **lanza
  error** (no guardar en claro por descuido — mismo principio que `SYSTEM_DATABASE_URL`/D-020); en dev/CI
  se permite sin clave con aviso.
- **Rotación de clave (limitación honesta, GAP conocido):** hoy `decryptBlob` usa **una sola clave**.
  Rotar la clave **dejaría huérfanos** los blobs cifrados con la anterior (no se descifran) — **NO hay
  re-cifrado todavía**. Por tanto, hasta construir ese paso: tratar la clave como **longeva**, respaldada
  en KMS; NO rotarla con datos reales sin antes implementar el re-cifrado (el byte de versión del MAGIC
  deja sitio para selección multi-clave, pero `decryptBlob` aún no lo usa). Tarea de fondo registrada.
- **PII de clientes (fase diferida, documentada):** NO se cifra a nivel de columna **todavía** porque
  rompería búsqueda/orden/validación (p. ej. buscar cliente por nombre, unicidad de identificador fiscal).
  Plan: para campos consultables, _blind index_ / cifrado determinista; para el resto, **cifrado de disco/
  volumen (TDE) en la capa de infraestructura** (RDS encryption / disco cifrado) cubre toda la BD en
  reposo (config de **despliegue, no código**; es la otra mitad de la Tarea 3). Se empieza por lo binario
  (documentos), lo más sensible y sin coste de consulta.
- **Mensaje honesto (no sobre-vender):** decir **"documentos cifrados (a nivel de app) + disco de la BD
  cifrado (infra)"**, NUNCA "todo cifrado en reposo". La PII estructurada en Postgres (nombres, IDs
  fiscales, datos del expediente) la cubre el cifrado de disco del volumen, no el cifrado de columna.
- **TLS en tránsito:** terminación TLS en el borde (reverse proxy / balanceador), HSTS, redirección
  80→443, y `sslmode=require` hacia Postgres. Documentado en `RUNBOOK.md` (no se activa en esta tanda; es
  preparación de despliegue).
- **Probado:** e2e puros del cifrado (round-trip, passthrough legacy, autenticación/tamper, validación de
  clave, decorador) + e2e de documentos con la clave activa (sube cifrado, descarga descifra, hash SHA-256
  sobre el claro intacto). Cifrado **auto-mergeable** (no toca rutas sensibles de CODEOWNERS).

## D-022 · Derechos del titular (RGPD / Ley 172-13): acceso/portabilidad + supresión por anonimización · Aceptada

- **Contexto (Tarea 4):** un despacho preguntará "¿puede un cliente pedir o borrar sus datos?". Hacía falta
  acceso/portabilidad y el derecho de supresión, **bien hechos**.
- **Acceso / portabilidad (PR-X, fusionado en #28):** `GET /clients/:id/gdpr-export` (FIRM_ADMIN, acotado al
  tenant por RLS) devuelve los datos del titular en JSON estructurado; no expone claves internas de storage;
  deja traza en AuditLog. RAT (art. 30) documentado en `RAT.md`.
- **Supresión = ANONIMIZACIÓN, NO hard-delete (clave):** el derecho de supresión RGPD/172-13 **cede ante la
  conservación legal**: para un despacho, conservar el expediente suele ganar (deber de custodia,
  obligaciones fiscales) y un borrado real chocaría además con el **AuditLog inmutable**. Por eso
  `POST /clients/:id/anonymize` (FIRM_ADMIN) **sobrescribe la PII** del titular (nombre → `[Titular
anonimizado]`, identificador fiscal → `ANON-<id>`, email/teléfono/dirección → null, `anonymizedAt`), y si
  tenía portal, **anonimiza y desactiva** su usuario revocando sus sesiones — **PRESERVANDO** expedientes,
  facturas, ledger y AuditLog. Idempotente-seguro (rechaza re-anonimizar con 409). Deja entrada
  `client.anonymized` en AuditLog (que **no** se borra). La sobrescritura es **irreversible** (valores
  literales/null, no cifrado ni hash recuperable).
- **Cómo describirlo a un despacho (no prometer borrado total):** la factura **congela** el nombre + NIF/
  CIF del comprador en su registro fiscal inmutable (`complianceRecord` + `recordHash`; ES `receptor`, RD
  `<RNCComprador>`) al emitirse, y eso se **conserva por obligación legal**. Por tanto la anonimización es
  _"anonimizo el registro maestro del cliente + corto su acceso + conservo los documentos legales (que
  retienen la identidad fiscal histórica)"_, **NO** "el cliente desaparece del sistema". Es la postura
  RGPD defendible: la supresión cede ante la conservación legal.
- **Retención configurable + residencia (migración):** `Tenant.dataRegion` (UE para ES; RD a definir) y
  `Tenant.retentionMonths`, editables por FIRM_ADMIN en Ajustes. Son **metadato/política**: la retención
  **no dispara auto-purga** (conservar prevalece sobre borrar). Residencia documentada en `RAT.md`/RUNBOOK.
- **Migración (`20260615130000_gdpr_anonymize_retention`):** columnas nullable (seguro sobre BD con datos);
  los GRANT de tabla ya cubren columnas nuevas; las políticas RLS de Client/Tenant ya existen (row-level).
  → toca `prisma/` (CODEOWNERS) ⇒ **PR que espera OK del usuario**, no auto-merge.
- **Probado (local, como `legalflow_app`):** **107/107 e2e en verde**, typecheck + lint limpios. Tests de
  anonimización: PII sobrescrita, expediente y facturas **preservados**, AuditLog conserva la traza, portal
  **cortado** (login 401 tras anonimizar), 409 al re-anonimizar, 403 letrado, 404 cross-tenant.

## D-023 · Pulido (Tarea 5): preview fiscal, QR Verifactu, i18n de API, nav responsive, motion + Geist · Aceptada

- **Contexto:** última tanda de pulido. Dos ítems con sustancia (preview fiscal, QR) y tres cosméticos
  (i18n exhaustivo de API, nav móvil, animaciones+fuente). Un PR pequeño por ítem; CODEOWNERS decide
  auto-merge vs. revisión.
- **Preview fiscal en vivo (PR #30, fusionado):** endpoint READ-ONLY
  `POST /ledger/invoices/preview`. Clave de confianza: NO se duplica la matemática fiscal en el cliente
  ni en un segundo cálculo. El provider expone `previewInvoice()` y `buildInvoiceRecord` **delega en él**,
  de modo que preview y factura emitida comparten una ÚNICA ruta (`getTaxRates` + `computeInvoiceTotals`)
  y no pueden divergir. Tests prueban `preview.totals === emitida.totals` (ES con/sin retención, RD ITBIS).
  Jurisdicción-aware: el formato (VERIFACTU/ECF) lo da el provider, no el núcleo.
- **QR Verifactu (PR #31, fusionado):** se renderiza el QR escaneable con `qrcode.react` (ISC) a partir
  de la `qrUrl` de cotejo AEAT que YA genera el complianceRecord — no se inventa contenido. Solo en
  formato VERIFACTU; en RD (e-CF) no aplica ese QR español → se mantiene la representación del e-CF.
  Fondo blanco fijo para que escanee también en modo oscuro.
- **i18n exhaustivo de la API (PR #32, fusionado):** todo error de la API sale por una
  `messageKey` estable con catálogo COMPLETO es-ES/es-DO (`apps/api/src/common/api-messages.ts`) + helper
  `apiError()` (messageKey + message fallback es-ES + params/code). ~56 throws refactorizados; validación
  de DTOs vía pipe compartido con `messageKey: 'validation.failed'`. Gate de test de completitud (toda
  clave con ambos locales + placeholders consistentes). Es exhaustivo precisamente por incluir auth ⇒
  CODEOWNERS exige revisión (no se fuerza auto-merge; la política CODEOWNERS prevalece sobre la etiqueta).
- **Nav responsive (PR #33, fusionado):** la sidebar flotante estaba `hidden lg:flex` (web sin navegación
  en móvil). El contenido del nav se extrae a `SidebarNav`, reutilizado por el aside de escritorio y por
  un Drawer lateral (Sheet) que abre un botón hamburguesa `lg:hidden` y se cierra al navegar. Es responsive
  web, NO app nativa (sigue diferida). A11y: SheetTitle/Description + aria-label i18n.
- **Animaciones + Geist (PR #34, fusionado):** framer-motion con los tokens EXACTOS del handoff
  (`design/Lexora-Implementation.dc.html`) centralizados en `lib/motion.ts` (ease [0.22,0.8,0.2,1],
  entrada 220 ms, overlay 320 ms, press 140 ms, drawer spring). `PageTransition` aplica la entrada de
  pantalla por ruta y **respeta `prefers-reduced-motion`** (AA). Webfont Geist autohospedada vía next/font
  (paquete `geist`), encabezando `--font-sans/--font-mono`. Ambas deps MIT (gate de licencias OK).
- **Fuera de alcance (sin cambios):** envío real AEAT/DGII, IA, LexNET, firma, SMS, CRM, app móvil nativa,
  rebrand @legalflow → Lexora. Siguen diferidos.

## D-024 · Fase 1 (cobro): pasarela enchufable + estados ricos de factura · Aceptada

- **Contexto:** arranca la Fase 1 (cobro y rentabilidad). El módulo ledger/facturas estaba completo
  hasta cobro MANUAL, pero faltaban los cimientos para cobrar de verdad: la factura no tenía
  `dueDate`/`paidAt`/`amountPaid`, `InvoiceStatus` no tenía `OVERDUE`/`PARTIAL`, no había modelo
  `Payment` ni endpoint de listado de facturas. El PDF con QR Verifactu ya existía.
- **Decisiones de producto (confirmadas por el usuario, 2026-06-15):**
  1. **Pasarela enchufable por jurisdicción** — interfaz `PaymentProvider` espejo de
     `ComplianceProvider` (factory por `tenant.jurisdiction`); **ningún país hardcodeado**. ES →
     **Stripe** real (tarjeta + SEPA + Bizum). RD → **stub** documentado tras la misma interfaz hasta
     tener merchant Azul/CardNet (Stripe no opera para negocios dominicanos). El cobro manual
     (`/ledger/invoices/:id/pay`) sigue de fallback en todas las jurisdicciones.
  2. **Stripe Connect** — cada despacho es una cuenta conectada; el dinero del cliente final va al
     despacho, no a la plataforma → evita que Lexora sea transmisor de fondos. `SYSTEM`/secretos de
     Stripe son "joya de la corona" (mismo principio que `SYSTEM_DATABASE_URL`/`DATA_ENCRYPTION_KEY`).
  3. **Rebanada fina primero** — PR-1 (estados+vencimiento) → PR-2 (captura de tiempo) → PR-3
     (`PaymentProvider`+`Payment`) → PR-4 (Stripe Connect ES). Recurrente/planes/retainer/dunning después.
  4. **Dunning in-app/portal ahora** — usa el módulo de notificaciones existente; email/SMS engancha en
     Fase 2 sin re-trabajo.
- **Decisión técnica (PR-1) — `overdue` DERIVADO en lectura, no solo persistido:** el estado `OVERDUE`
  existe en el enum (lo usará el scheduler de dunning en una PR posterior), pero la vista de "vencidas"
  **no debe depender** de que un cron haya corrido. `listInvoices` calcula `overdue` en lectura:
  factura no liquidada (≠ PAID/CANCELLED) con `dueDate` ESTRICTAMENTE anterior a la medianoche UTC de
  hoy (el día de vencimiento aún no cuenta). Así "Vencidas" es correcto desde el primer día; cuando se
  añada el scheduler, persistir `OVERDUE` será consistente con la derivación.
- **Decisión técnica (PR-1) — plazo de pago por defecto 30 días:** si la factura no trae `dueDate`, se
  calcula como `issueDate + 30 d`. Plazos de pago configurables por tenant quedan para una PR posterior.
- **Sensibilidad / merge:** PR-1 toca `prisma/` (migración) → CODEOWNERS → **PR-y-espera** (no
  auto-merge). PR-2 es auto-mergeable; PR-3/PR-4 vuelven a ser PR-y-espera (ledger/dinero/migración/
  secretos). Ver [[fase1-cobro-decisiones]] (memoria) y AI_WORKLOG.
- **Probado (PR-1, local como `legalflow_app`):** e2e `ledger` **15/15** (5 nuevos: dueDate por
  defecto, amountPaid/paidAt al cobrar, listado, overdue derivado, pagada-no-vencida). web typecheck +
  lint + api lint limpios. Migración generada contra la BD real (sin drift). Pendiente: verde en CI real.

## D-025 · Dunning (Ítem 1 Fase 1): reglas en tabla + recordatorios idempotentes + canal-agnóstico · Aceptada

- **Contexto:** con los estados ricos (D-024) y `overdue` derivado en su sitio, las facturas vencidas
  deben **perseguirse solas**. Arranca el Ítem 1 (dunning) de la cola de Fase 1.
- **Decisiones de diseño (confirmadas por el usuario, 2026-06-16):**
  1. **Reglas en tabla dedicada `DunningRule`** (no JSON en Tenant) — una fila por etapa
     (`offsetDays` único por tenant) con `severity` (escalado REMINDER→WARNING→FINAL) y `channel`. Más
     flexible y auditable que un blob JSON; el coste es una segunda tabla con su RLS.
  2. **`DunningReminder` como ancla de idempotencia** — `@@unique([tenantId, invoiceId, offsetDays])`:
     el motor (D2) no re-genera una etapa ya disparada. Guarda instantánea de `offsetDays`/`severity`
     (estable aunque la regla cambie/desaparezca: FK `ruleId` con `ON DELETE SET NULL`). La auditoría
     inmutable sigue en `AuditLog`; este modelo es el **estado operativo**, no el registro legal.
  3. **Canal-agnóstico** — enum `DunningChannel { IN_APP, EMAIL, SMS }`; hoy solo `IN_APP` se
     implementa (D2, vía `NotificationsService`). EMAIL/SMS quedan como **punto de integración para
     Fase 2**: cuando exista el canal, el motor se engancha sin tocar modelo ni migración.
  4. **Disparo manual primero, cron después** — D2 expone un endpoint manual ("recordar ahora"); el
     cron diario (`@nestjs/schedule`, dependencia nueva) llega aislado en D3, para revisar la
     automatización del cobro por separado.
- **Jurisdicción-aware:** los defaults de reglas y el tono/idioma de los avisos salen del tenant
  (`jurisdiction`/`locale`, es-ES vs es-DO); ningún país hardcodeado, igual que el resto del núcleo.
- **Desglose en PRs:** D1 (modelo+migración+RLS) → D2 (motor+in-app+endpoint manual) → D3 (cron) →
  D4 (UI despacho) → D5 (UI portal). Ver PLAN.md (Ítem 1) y [[fase1-cobro-decisiones]] (memoria).
- **Sensibilidad / merge:** D1–D3 tocan migración/RLS/dinero → **PR-y-espera**. D4/D5 son solo UI de
  lectura → auto-mergeables en verde.
- **PR-D1:** tablas `DunningRule` + `DunningReminder` (RLS fail-closed, patrón D-013/D-020),
  enums de dominio espejo, migración `20260616120000_dunning`. **Sin lógica de negocio** (llega en D2).
  Verificado: e2e RLS dedicado que ejercita ambas tablas (lectura acotada, cross-tenant invisible, WITH
  CHECK, fail-closed) verde en CI. **Fusionado a main (#56).**
- **PR-D2 (motor) — decisiones de implementación:**
  1. **Reglas efectivas con fallback a defaults** — si el despacho no ha configurado `DunningRule`
     activas, el motor usa un calendario por defecto (+1 REMINDER, +7 WARNING, +15 FINAL) para que el
     dunning funcione sin configuración previa. El CRUD de reglas en UI queda para una PR posterior.
  2. **Idempotencia por la unicidad de D1** — un recordatorio por `(invoiceId, offsetDays)`; el motor
     intenta crear y captura `P2002` como "ya existe" (no duplica, no 500). Doble clic en "recordar
     ahora" es seguro. Reintento de envíos `FAILED` se difiere a Fase 2 (con EMAIL/SMS).
  3. **Canal-agnóstico vía multi-provider `DUNNING_CHANNELS`** — `DunningChannelDispatcher` con
     `InAppChannel` (avisa a los FIRM_ADMIN del despacho). EMAIL/SMS se añaden como nuevos dispatchers
     sin tocar el motor; una etapa con canal sin dispatcher se marca `SKIPPED` (no se pierde).
  4. **Sin duplicar "vencidas"** — los helpers `deriveOverdue`/`startOfTodayUtc`/`addDaysUtc` se
     extrajeron de `ledger.service` a `ledger/overdue.util.ts` (fuente única compartida con el motor).
  5. **Endpoint manual role-gated + tenant-scoped** — `POST /dunning/run` y `GET /dunning/reminders`
     bajo `@Roles(FIRM_ADMIN, LAWYER)`; CLIENT → 403, sin token → 401; RLS acota por tenant.
     Verificado local: e2e dunning 7/7 (incl. idempotencia, audit, 403/401, aislamiento) + RLS 7/7.
     **Fusionado a main (#57).**
- **PR-D3 (cron) — decisiones de implementación:**
  1. **`@nestjs/schedule` + `ScheduleModule.forRoot()`** (dependencia nueva) con `DunningCron` diario
     (6:00). El cron solo orquesta; la lógica vive en `DunningService` de D2 (sin duplicar).
  2. **Barrido sin contexto de request, seguro frente a RLS** — el cron lista los tenants con el
     cliente de SISTEMA (BYPASSRLS; la tabla `Tenant` también tiene RLS) y evalúa cada uno dentro de
     `runWithTenant(tenantId)`, de modo que Prisma fija `app.tenant_id` y las queries del motor quedan
     acotadas por RLS a ese tenant (sin fugas cross-tenant). Mismo patrón que el cierre del fail-open de
     WebSocket (D-013).
  3. **Aislamiento de fallos** — un error en un tenant se registra y NO detiene el barrido del resto.
     Verificado: e2e cron 2/2 (barrido multi-tenant bajo RLS + idempotencia). **Fusionado a main (#58).**
- **Ítem 1 (Dunning) COMPLETO:** D1 (#56) · D2 (#57) · D3 (#58) · D4 UI despacho (#59) · D5 UI portal
  (#60). Las vencidas se persiguen solas (cron diario) y a demanda; aviso al despacho + recordatorio al
  cliente con enlace de pago. EMAIL/SMS = integración Fase 2.

## D-026 · Fase 1 (Ítem 2): provisión de fondos / retainer — tratamiento fiscal · **RATIFICADA (owner, 2026-06-16)**

> ✅ **Estado: RATIFICADA por el owner (2026-06-16).** ES queda cerrado; RD se adopta como **marco +
> default conservador** (menos certeza que ES — un contador dominicano lo afinaría). El owner asume el
> default conforme y conservador sin asesor; ver "Ratificación" para la postura y la recomendación de una
> revisión única del motor fiscal (firma la Declaración Responsable como fabricante).
> **La lógica fiscal se implementa en R2**, una vez fusionado #61. Reemplaza el borrador anterior, cuyo
> default (provisión = cobro a cuenta no fiscal) iba al revés del caso típico.

- **Contexto:** segundo ítem de la cola de cobro (modelo estándar ES: cobrar por adelantado y trabajar
  contra saldo). Construye sobre el ledger/`Payment`.

### Tratamiento fiscal (ratificado)

- **Default CONFORME = anticipo de honorarios devenga IVA al cobro.** Una provisión que es anticipo de
  servicios identificados **devenga IVA en el momento del cobro** (art. 75.Dos LIVA) → **factura
  inmediata** (consume serie fiscal / Verifactu). Este es el **comportamiento por defecto** (el borrador
  anterior lo tenía invertido).
- **El tratamiento es un atributo POR provisión** que fija el usuario al cobrar, con el default conforme.
  Ramas de excepción explícitas:
  1. **Provisión genérica no delimitada** (sin servicio identificado) → **sin devengo** hasta identificar
     el servicio (doctrina TJUE C-419/02 _BUPA_).
  2. **Suplido** (art. 78.Tres.3º LIVA) → **sin IVA**, factura a nombre del cliente (gasto por cuenta y
     en nombre del cliente).
- **Jurisdicción vía `ComplianceProvider`, NO asumir ES.** La regla de devengo y la emisión cuelgan del
  provider del tenant: **ES** = LIVA / Verifactu; **RD** = ITBIS 18% / e-CF-DGII. Ningún país hardcodeado.
- **Implicación REFUND:** si el depósito devengó IVA al cobrarse, devolverlo exige **factura
  rectificativa** (Verifactu / e-CF), no solo restar saldo (ver Parte C).

### Ratificación (owner, 2026-06-16) — mecánica confirmada para R2/R3

- **ES (cerrado):** el anticipo de honorarios devenga IVA **al cobro** (art. 75.Dos LIVA) → repercutir
  IVA 21%, **emitir factura de anticipo** y **practicar retención IRPF** si el cliente es retenedor.
  La **factura final del asunto deduce el anticipo ya facturado** (regulariza descontando lo anticipado;
  no se grava dos veces). En clave Verifactu: toda provisión que sea anticipo se factura de inmediato.
- **RD (marco + conservador, menos certeza):** servicios de abogacía gravados con **ITBIS 18%**; el
  nacimiento de la obligación se ancla a la **emisión del e-CF** / prestación (art. 338 CT Ley 11-92 +
  art. 7 Decreto 293-11), **no al cobro** como en ES. Default conservador: **emitir e-CF con ITBIS al
  tomar un anticipo** ligado a servicios identificados. (Un contador dominicano afinaría este punto.)
- **Ante la duda, conservador** = aplicar impuesto (+ retención en ES). El error caro es **infra-
  repercutir**, no sobre-documentar.
- **Suplido con rigor:** solo gastos pagados en nombre y por cuenta del cliente con **justificante a
  nombre del cliente** (tasas, registro, notaría) → fuera de base, sin IVA, no sujeto a retención. La
  rama que Hacienda/DGII auditan; documentación estricta.
- **"Genérico no delimitado" (BUPA)** = borde raro en abogacía: salvo que sea claramente genérico,
  tratar como anticipo (default conforme).
- **Cadena que R2/R3 debe implementar:** `DEPOSIT` (anticipo) → **factura de anticipo** (reusa
  `buildInvoiceRecord`: base + IVA/ITBIS − retención, como la FAC ya verificada) + postea al ledger →
  … → **factura final que descuenta el anticipo facturado** → si se devuelve un anticipo ya facturado,
  **rectificativa**. El `DEPOSIT` "suplido" no factura con IVA (doc a nombre del cliente, fuera de base).
- **Recomendación (no bloqueante):** dado que el owner firma la Declaración Responsable como fabricante,
  una **revisión única del motor fiscal por un fiscalista** (sobre todo RD y la mecánica anticipo→final→
  rectificativa) es seguro barato frente a esa responsabilidad. Queda anotado; el owner decide.

### Esquema (ratificado por el owner, 2026-06-16 — implementado en PR-R1)

1. **Granularidad POR EXPEDIENTE/ASUNTO**, no por cliente — `RetainerAccount.matterId @unique` (1-1 con
   `Matter`). En la práctica ES la provisión se segrega por asunto. El **"saldo por cliente" se DERIVA**
   sumando las cuentas de sus asuntos (vista/cálculo, no una tabla nueva). Posible extensión futura (NO
   ahora): un retainer general no ligado a asunto.
2. **Mono-moneda por tenant (explícito)** — `RetainerAccount.currency` = moneda del tenant, fijada al
   crear; el `RetainerEntry` NO lleva `currency`. Un **guard** (R2/R3) rechaza un cobro/movimiento cuya
   moneda no sea la del tenant. Multi-moneda (añadir `currency` al `RetainerEntry`) = futuro, no ahora.
3. **Saldo = `RetainerAccount` (cacheado) + `RetainerEntry` (movimientos auditados)** con signo
   (DEPOSIT +, APPLICATION/REFUND −, ADJUSTMENT ±).
4. **Manual primero, Stripe después** — tanda: R1 (modelo) → R2 (cobro manual + saldo) → R3 (aplicar a
   factura) → R5 (UI). R4 (Stripe sin factura: `Payment.invoiceId` nullable + checkout sin factura +
   webhook) **diferido**.

### Restricciones que heredan R2/R3 (registradas ahora; se implementan en R2/R3)

- **Invariante de saldo `balance == Σ(entries)`** garantizado por: (a) un **test de reconciliación**, y
  (b) actualización del saldo + inserción del movimiento en **una sola transacción con `SELECT … FOR
UPDATE`** sobre la cuenta (para que un DEPOSIT y una APPLICATION concurrentes no se pisen). **Guard
  contra saldo negativo** al aplicar.
- **Relación con el ledger del expediente (decidida):** la **APPLICATION** de provisión a una factura
  postea su apunte `PAYMENT` al ledger del expediente vía `reconcile` (el ledger sigue siendo la foto
  financiera única de cobros/facturas). El **DEPOSIT NO** postea un apunte `PROVISION` al ledger del
  expediente (evita doble cómputo con el `PAYMENT` posterior): el depósito vive en el sub-ledger del
  retainer (`RetainerEntry` + saldo cacheado), que **reconcilia** con el ledger por la vía de la
  aplicación. El `PROVISION` manual del ledger (existente) se mantiene como está. (Sujeto a ajuste según
  el modelo fiscal ratificado; no es un mini-ledger paralelo sin definir.)
- **REFUND → rectificativa:** ver implicación fiscal arriba; R2/R3 debe emitir la rectificativa cuando el
  depósito devengó IVA, no solo restar saldo.

### Sensibilidad / merge

- R1–R4 tocan migración/dinero/Stripe → **PR-y-espera**. R5 (UI) → auto-mergeable.
- **PR-R1 (enmendado):** tablas `RetainerAccount` (por `matterId`) + `RetainerEntry` (sin `currency`),
  enum `RetainerMovementType`, migración `20260616130000_retainer`, RLS fail-closed. **Sin lógica.**
  Verificado: e2e retainer-rls 5/5 (lectura acotada, cross-tenant invisible, WITH CHECK, fail-closed)
  local + CI; schema válido; typecheck + lint limpios.
- **GATE:** (b) ADR **RATIFICADA** por el owner (2026-06-16) ✅ + (a) #61 **fusionado** (#61) ✅ →
  R2 desbloqueado.
- **Split R2 / R2b (decisión del owner):** la emisión fiscal es Verifactu-crítica, así que se aísla.
  **R2** = motor de saldo (`SELECT … FOR UPDATE`, invariante, guards de negativo y moneda, test de
  reconciliación) + tipos NO fiscales (SUPLIDO, GENERICO) + lecturas, con el tipo **ANTICIPO bloqueado**
  (error claro `retainer.anticipoRequiresInvoice`; un anticipo nunca se registra como saldo sin su
  factura — innegociable). **R2b** = el tipo ANTICIPO conectado a `buildInvoiceRecord`, **atómico**:
  serie fiscal + registro Verifactu/e-CF + ledger + `RetainerEntry` + saldo en UNA transacción (fallo
  parcial revierte limpio, incl. la serie). El envío real AEAT/DGII sigue diferido (registro local).
- **PR-R2 (implementado):** módulo `retainer` (`RetainerService` motor + `deposit` SUPLIDO/GENERICO +
  lecturas matter/cliente), `ProvisionKind` (dominio + enum Prisma + columna `kind` en `RetainerEntry`,
  migración `20260616140000_provision_kind`). e2e retainer 8/8 (ANTICIPO→400, guard moneda, role-gating,
  aislamiento, **concurrencia 10× sin perder updates**, invariante `balance == Σ(entries)`) + retainer-rls
  5/5. Formato de saldo con `Decimal.toFixed(2)` (evita que `.toString()` elimine los ceros). PR-y-espera.
- **PR-R2b (implementado):** `POST /retainer/anticipo` (amount = BASE). Núcleo de emisión extraído a
  `LedgerService.emitInvoiceInTx` (serie con `count` DENTRO de la tx + encadenamiento + `buildInvoiceRecord`
  - factura ISSUED + apunte INVOICE), reutilizado por la emisión normal (sin duplicar; ledger e2e 15/15
    intacto). `RetainerService.depositAnticipo` lo envuelve en UNA `tenantTransaction`: emite la factura,
    la marca **PAID** (Payment MANUAL + apunte PAYMENT, espejo de `reconcile`) y acredita el retainer por
    el **total** (`DEPOSIT(ANTICIPO)` ligado a factura+payment) con `postMovement` (FOR UPDATE). Atómico:
    un fallo revierte serie+registro+ledger+saldo. Jurisdicción por `ComplianceProvider` (taxCode estándar
    ES `IVA_STANDARD` / RD `ITBIS_STANDARD`; IRPF por `withholdingTaxCode`). e2e retainer-anticipo 4/4
    (ES IVA21%+IRPF15%→1060 PAID, saldo 1060, encadenamiento, atomicidad en rechazo, role-gating).
- **Split R3 (decisión del owner):** aplicar saldo a factura tiene una parte mecánica y una fiscal.
  **R3a** (mecánica) ahora; **R3b** (deducción del anticipo en la factura final) y **R3c** (rectificativa
  en devolución) son emisión fiscal → ADR **D-027**, a ratificar con asesor antes de codificar.
- **PR-R3a (implementado):** `POST /retainer/apply` crea `Payment` método **RETAINER** (mueve
  `amountPaid`, PARTIAL/PAID, apunte PAYMENT — espejo de `reconcile`) + `RetainerEntry APPLICATION(−)`
  con `postMovement` (FOR UPDATE), todo en una tx. **Bloqueo por construcción:** si el expediente tiene
  fondos de ANTICIPO (ya facturados con IVA) → `retainer.anticipoApplyBlocked` (evita doble IVA hasta
  R3b). `PaymentMethod.RETAINER` (Payment.method es String → sin migración). e2e retainer-apply 6/6
  (parcial→PAID, saldo insuficiente, bloqueo anticipo, factura ajena, role-gating, invariante).

## D-027 · Fase 1 (Ítem 2 R3b): deducción del anticipo (≠ rectificativa) + rectificativa del refund · **RATIFICADA (owner, 2026-06-16)**

> ✅ **Estado: RATIFICADA por el owner (2026-06-16).** Modelo ES cerrado; RD adoptado como marco +
> conservador (menos certeza — un contador dominicano lo afinaría). Corrige la propuesta anterior: la
> regularización del caso normal **NO es una rectificativa, es una deducción**; solo el REFUND lo es.

- **Devengo y pasivo:** cada pago anticipado **requiere su propia factura** (el IVA se devenga al cobrar
  cada anticipo, R2b); el anticipo se registra como **pasivo** hasta que se realiza la operación
  definitiva, momento en que se **regulariza**.
- **(R3b) Deducción del anticipo en la factura final — NO es rectificativa:** al cerrar el asunto se
  emite la factura por el **servicio completo** y se **descuentan los anticipos ya facturados** mediante
  **líneas negativas que referencian esas facturas de anticipo**. Así el IVA acumulado = IVA del total,
  sin doble imposición. Las **facturas de anticipo quedan inmutables** (Verifactu); la final las
  **neutraliza por deducción**. → reusar `buildInvoiceRecord` para la final con un **bloque de deducción
  de anticipos**, encadenada. (Esto reemplaza la idea anterior de "factura por el remanente".)
- **(R3c) REFUND de un anticipo ya facturado — SÍ es rectificativa:** devolver un anticipo facturado
  **no es restar saldo**: se emite **factura rectificativa** para anular la operación y ajustar el IVA
  declarado en el período del cobro. Bajo Verifactu (las facturas no se modifican/borran) la
  rectificativa es un **registro nuevo encadenado**, **por sustitución** (la errónea en negativo + la
  rectificativa) o **por diferencias** (factura con el importe rectificado), indicando su **condición de
  rectificativa, la causa y la factura rectificada**. → reusar `buildInvoiceRecord` con **tipo
  rectificativa** + `RetainerEntry REFUND(−)`, atómico.
- **RD vía `ComplianceProvider`:** el refund equivale a una **nota de crédito e-CF**; la deducción del
  anticipo va en el **e-CF final**. Menos cerrado en las fuentes → es donde más conviene el contador
  dominicano.
- **Split:** R3a (aplicar saldo a factura = `Payment(RETAINER)` + `APPLICATION`, mecánico — **hecho**,
  #64; la aplicación solo reduce el pendiente, la deducción fiscal vive en la final) → **R3b** (deducción
  en factura final + rectificativa de refund) ya **diseñable** con este modelo.
- **Recomendación (no bloqueante):** el motor fiscal acumula anticipo → factura de anticipo → deducción
  en final → rectificativa → (pronto) recurrente, todo bajo Verifactu y la responsabilidad de fabricante
  del owner. Una **revisión única de un fiscalista sobre el motor entero** (no decisión a decisión; sobre
  todo RD y el encadenamiento de rectificativas) es seguro barato. El owner decide.

#### Notas de implementación · PR-R3b (deducción) — `invoiceFinalWithDeduction`

Mecánicas adoptadas al codificar la deducción (a revisar en la PR; PR-y-espera):

- **D1 — Líneas de deducción:** una línea negativa por cada factura de anticipo del expediente, espejo
  de su base + `taxCode`. `computeInvoiceTotals` ya cuadra con signo → IVA neto de la final = IVA sobre
  (servicio − anticipos). Sin tocar la matemática fiscal.
- **D2 — Estado:** la final nace **ISSUED**; total neto = servicio − anticipos = lo que el cliente aún
  debe en dinero nuevo (el anticipo ya lo pagó en su factura PAID).
- **D3 — Drawdown del retainer:** tras emitir, `APPLICATION(−)` por el **total acreditado de los
  anticipos**, ligada a la final, **sin Payment ni mover `amountPaid`**. La deducción en la propia
  factura es lo que realiza el anticipo; no es un cobro nuevo. Mantiene `balance == Σ(entries)`.
- **D4 — Guard de devolución:** si la base deducida > base del servicio (neto < 0) → 400
  (`retainer.deductionExceedsService`); ese caso es una **devolución → rectificativa (R3c)**, no una
  deducción. No se emiten facturas negativas por esta vía.
- **D5 — IRPF (ES):** la retención de la final se calcula sobre la base **neta** (ya descontado el
  anticipo) vía `computeInvoiceTotals` — correcto, el anticipo ya retuvo su parte.
- **D6 — El guard `anticipoApplyBlocked` NO se elimina, se RE-ENFOCA. RATIFICADO por el owner
  (2026-06-16).** Aplicar el saldo de anticipo como **cobro** a cualquier factura es incorrecto: a una
  factura normal duplicaría el IVA; a la propia final de deducción la **infrapagaría** (la deducción ya
  lo realiza). Por eso el `/apply` genérico sigue rechazando ANTICIPO y el anticipo se realiza SOLO por
  sus vías propias: `invoiceFinalWithDeduction` (deducción, R3b) o `refundAnticipo` (rectificativa, R3c).
  (Difería de la lectura literal "quita el guard" de la tarea; el owner confirma mantenerlo así por
  conformidad fiscal — evita el doble IVA.)
- **Doble cierre:** se detecta de forma **estructural** — el drawdown de cierre es la única
  `APPLICATION` **sin `paymentId`** (el `/apply` genérico siempre lleva `paymentId`). Un segundo cierre
  → 400 (`retainer.anticipoAlreadyDeducted`).
- **Trazabilidad:** `InvoiceInput.deductedAdvances` → ES bloque `anticiposDeducidos` en el registro
  Verifactu; RD `<AnticiposDeducidos><Anticipo><eNCFAnticipo>…` en el e-CF final.
- **Fuera de alcance (R3b):** refund parcial / rectificativa **por diferencias** → R3c.

#### Notas de implementación · PR-R3c (rectificativa del refund) — `refundAnticipo`

Mecánicas adoptadas (a revisar en la PR; PR-y-espera; **apilada sobre R3b**):

- **Modelo:** `Invoice` gana `documentType` (NORMAL|RECTIFICATIVA), `rectifiesInvoiceId` (self-FK),
  `rectificationReason`, `rectificationMode` (SUSTITUCION|DIFERENCIAS) y `withholdingTaxCode` (para
  reversar el IRPF del anticipo de forma exacta). Enums nuevos en dominio + Prisma. Columnas sobre la
  tabla `Invoice` existente → **no es tabla nueva**, no exige e2e-RLS nuevo (pero la migración la fusiona
  el owner).
- **Refund = rectificativa por sustitución:** `refundAnticipo` emite una factura con las líneas del
  anticipo **espejadas en negativo** (misma cantidad, `unitPrice` negativo, mismo `taxCode`) + el mismo
  `withholdingTaxCode` → reversa base, impuesto y retención exactos. `documentType = RECTIFICATIVA`,
  `rectifiesInvoiceId` = anticipo, causa, `mode = SUSTITUCION`. Encadenada como cualquier registro
  (huella previa = última factura del tenant). La factura de anticipo queda **inmutable**.
- **Saldo:** `RetainerEntry REFUND(−)` por el total del anticipo, ligado a la rectificativa. NO es "solo
  restar saldo": exige la rectificativa (D-027). Guard de saldo suficiente.
- **Providers:** ES Verifactu → bloque `rectificativa { tipoFactura:'R1', tipoRectificativa:'S'|'I',
facturasRectificadas, causa }`. RD → `<TipoeCF>34</TipoeCF>` (nota de crédito) + `<InformacionReferencia>`
  con `<NCFModificado>`. `InvoiceInput.documentType` + `rectifies` (ausentes → factura normal, TipoeCF 31).
- **Guards:** la factura debe ser un anticipo del expediente (`notAnAnticipoInvoice`); no devolver dos
  veces (`anticipoAlreadyRefunded`, detectado por una rectificativa que ya la corrige); no devolver un
  anticipo ya deducido en una final (`anticipoAlreadyDeducted`, drawdown de cierre presente).
- **Interacción con R3b:** `invoiceFinalWithDeduction` **excluye los anticipos devueltos** (los que
  tienen una rectificativa que los corrige) del bloque de deducción y del drawdown — deducir un anticipo
  ya reversado doblaría la corrección.
- **Fuera de alcance (R3c):** refund **parcial** / rectificativa **por diferencias** (`DIFERENCIAS`
  reservado en el enum, sin implementar).

## D-028 · Fase 1 (Ítem 3): facturación programada — recurrente (iguala) + planes de pago · **ACEPTADA (owner, 2026-06-16)**

> Decidida con el owner tras proponer opciones e implicaciones fiscales. El owner delega el detalle de
> arquitectura ("la más escalable") — ver memoria de autorización autónoma.

- **Motor único** `BillingSchedule` (+ `BillingInstallment`) cubre `RECURRING` e `INSTALLMENTS`. Se separa
  el _contrato_ (plan) de los _eventos_ (cuotas/periodos) por escalabilidad: recurrente abierto (cuotas en
  rolling por el cron), estado por evento, enlace a factura+pago por cuota, reintentos/dunning por estado.
- **Fiscalidad (clave; consistente con D-026/D-027):**
  - **RECURRING** (iguala/cuota periódica): cada periodo es un devengo nuevo → **1 factura por periodo**
    (IVA/ITBIS por periodo), con su serie + registro Verifactu/e-CF + QR.
  - **INSTALLMENTS**, configurable por plan (`fiscalMode`):
    - **SERVICE_RENDERED (a):** servicio ya prestado/contratado → **1 factura** (IVA **completo** al
      emitir, LIVA art. 75) + cuotas como **cobros** parciales (`Payment`). Las cuotas **no** son facturas.
    - **ADVANCE (b):** cobro por adelantado → cada cuota es un **anticipo** → **factura de anticipo por
      cuota** (devengo al cobro, flujo R2b) + **deducción** en la factura final (R3b).
- **Invariante:** toda emisión (recurrente o cuota-anticipo) pasa por `buildInvoiceRecord` — serie +
  registro fiscal + QR, **sin atajos**. Reusa `emitInvoiceInTx`, el `Payment` parcial, el anticipo/
  deducción (R2b/R3b) y el patrón del cron de dunning.
- **Cobro (fases):** **Fase A** = calendario + emisión fiscal con cobro por **Checkout/manual** (reusa
  D-024 + dunning; cero riesgo SCA). **Fase B** = **auto-cobro off-session** (SetupIntent tarjeta on-file
  - PaymentIntents programados + SCA/3DS), **solo ES** (RD manual/stub, Stripe no sirve a RD). Épica aparte.
- **Descartado:** Stripe Subscriptions/Invoicing como motor — Stripe numera/factura por su cuenta y
  **choca con la fuente fiscal única** (nuestra serie Verifactu/e-CF). Stripe queda solo como rail de cobro.
- **Split:** RP1 (modelo+migración+RLS — **hecho**) → RP2 (crear/leer) → RP3 (emisión recurrente) →
  RP4 (emisión planes a/b) → RP5 (cron+dunning de cuotas) → RP6 (UI) → Fase B (off-session).
- **Recomendación (no bloqueante):** entra en la **revisión única del fiscalista** ya recomendada en
  D-027 (anticipo→factura→deducción→rectificativa→**recurrente**), sobre todo la parte RD.

## D-029 · Fase 5: firma electrónica (Signaturit) — adaptador listo, sin transmisión real · **ACEPTADA (owner, 2026-06-17)**

- **Patrón:** espejo del adaptador de envío fiscal AEAT/DGII (D-024 / PR #90). La firma vive detrás de
  una interfaz enchufable `SignatureProvider` (`@legalflow/compliance`); `SignatureProviderFactory`
  selecciona el proveedor (`signaturit` por defecto, pluggable a DocuSign). El stub NO transmite
  (`requestSignature` → `STUBBED`) pero respeta la FORMA EXACTA del cliente real (firma de métodos,
  idempotencia por `externalId`, verificación HMAC del webhook). Activar = sustituir el cuerpo por el
  cliente HTTP de Signaturit; ni el núcleo ni la UI cambian.
- **Modelo:** `SignatureRequest` (1:N con `DocumentVersion`), `status` String (no enum, como KYC) —
  PENDING al solicitar, SIGNED/DECLINED/EXPIRED/CANCELED por callback. RLS fail-closed por tenant.
- **Webhook:** ruta PÚBLICA `POST /signatures/webhook/signaturit` (mismo patrón que el de cobros,
  D-024): cuerpo crudo + firma HMAC-SHA256; el tenant sale del evento verificado (`runWithTenant`).
  Idempotente. Avisa al solicitante cuando el documento queda firmado.
- **Fuera de alcance:** transmisión real a Signaturit (requiere API key + plantilla de firma), firma
  cualificada con certificado, y posición visual de la firma en el PDF.
