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
