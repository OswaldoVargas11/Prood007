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

### 2026-06-14 - Claude - Postgres RLS (commit 1: politicas + rol + prueba a nivel BD)

Contexto: el usuario eligio avanzar "Postgres RLS" (no dependiente del diseno, prioridad seguridad).
Trabajo en worktree, push a feat/mvp-fase1 (PR #1).

Hecho (commit 1, defensa en profundidad, SIN cambiar el comportamiento runtime todavia):

- Migracion `20260614120000_enable_rls`: RLS + FORCE + policy `tenant_isolation` en las 14 tablas con
  `tenantId`, en `Tenant` (por id) y en `InvoiceLine` (via su factura). Funcion `app_current_tenant()`
  que normaliza el GUC `app.tenant_id` con NULLIF (NULL/'' = sin contexto -> bypass para rutas de
  sistema: login, registro, rotacion de tokens, seed).
- Migracion `20260614121000_app_role`: rol `legalflow_app` de MINIMO PRIVILEGIO (sin superusuario,
  sin BYPASSRLS, no propietario, solo DML). Necesario porque Postgres NO aplica RLS a superusuarios
  ni con FORCE. `schema.prisma` ahora separa `url` (rol app, runtime/tests) de `directUrl` (rol
  privilegiado, migraciones). `.env` y `ci.yml` actualizados con ambas URLs.
- Test `test/rls.e2e-spec.ts`: prueba el aislamiento DIRECTAMENTE a nivel de BD (fija el GUC en una
  transaccion y verifica que A no ve/inserta filas de B, y que el bypass sin contexto funciona).

BUG REAL detectado y corregido durante la prueba:

- Un GUC placeholder (`app.tenant_id`) fijado transaction-local se RESETEA a '' (no NULL) al cerrar
  la transaccion. La policy inicial solo hacia bypass con `IS NULL` -> una conexion reutilizada del
  pool con '' habria roto login/rutas de sistema en cuanto llegara el wiring. Corregido con
  `app_current_tenant()` (NULLIF a NULL). El test de bypass lo cazo.

Pruebas (todas verdes, conectando como `legalflow_app`):

- `prisma migrate reset --force --skip-seed` + `migrate deploy`: OK (4 migraciones).
- `jest --config test/jest-e2e.json`: **8 suites / 50 tests OK** (45 existentes + 5 RLS).

Riesgos/notas:

- `CREATE ROLE` con password dev vive en la migracion (idempotente; prod provisiona el rol fuera de
  banda). Requiere `DIRECT_DATABASE_URL` en todos los entornos (ya en .env de dev y en ci.yml).
- Aun NO hay enforcement en runtime: la app conecta como `legalflow_app` pero todavia no fija el GUC,
  asi que opera en bypass (comportamiento identico al anterior). Eso llega en el commit 2.

Siguiente punto (commit 2): wiring de la app (AsyncLocalStorage + interceptor que fija `app.tenant_id`
por request autenticado + extension de Prisma que envuelve cada operacion para fijar el GUC), con e2e
que pruebe denegacion cross-tenant por HTTP.

### 2026-06-14 - Claude - Postgres RLS (commit 2: wiring runtime + enforcement probado)

Hecho (ahora RLS se aplica de verdad en runtime):

- `prisma/tenant-context.ts`: `AsyncLocalStorage` con el tenant del request + helper
  `tenantTransaction()` (abre una transaccion, fija el GUC una vez y marca `inTenantTx` para no
  re-envolver dentro).
- `prisma/prisma.service.ts`: extension Prisma (`Prisma.defineExtension` + `$allOperations`) que
  envuelve cada operacion de modelo en una transaccion `[set_config(app.tenant_id), query]` cuando hay
  tenant en contexto (patron oficial de Prisma para RLS). Passthrough si no hay contexto, si ya
  estamos en `tenantTransaction`, o si es op no-modelo. El provider pasa a `useFactory` (cliente
  extendido) con connect/disconnect gestionado por `PrismaModule`.
- `prisma/tenant-context.interceptor.ts` (APP_INTERCEPTOR global): fija el contexto desde `req.user`
  tras los guards. Rutas @Public y no-HTTP → sin contexto → bypass.
- Refactor de 7 sitios `$transaction` autenticados (clients x2, matters, documents, ledger x3) a
  `tenantTransaction`. `auth.registerTenant` se deja como esta (ruta de sistema sin contexto).

Pruebas (todas verdes, conectando como `legalflow_app`):

- Nuevo `test/rls-wiring.e2e-spec.ts` (5 tests): con `runWithTenant(A)`, una query SIN filtro
  tenantId solo ve datos de A; B invisible por id; crear fila de B lo rechaza WITH CHECK;
  `tenantTransaction` multi-sentencia aisla sin anidar; passthrough sin contexto ve ambos.
- `jest --config test/jest-e2e.json`: **9 suites / 55 tests OK** (45 previos + 5 RLS BD + 5 wiring).
- `pnpm --filter @legalflow/api build` y `pnpm -r lint`: OK.

Notas:

- El interceptor propaga el contexto envolviendo la suscripcion del handler (como nestjs-cls); el
  AsyncLocalStorage sobrevive a las llamadas async del controlador/servicios.
- Coste asumido: cada operacion puntual = mini-transaccion (set_config + query). Aceptable para MVP.
- WebSocket/realtime queda en bypass (no fija contexto); documentado para endurecer mas adelante.

Estado: RLS COMPLETA (politicas + rol + wiring + enforcement probado). PLAN/D-013 actualizados.

### 2026-06-14 - Claude - RLS: cerrar el fail-open de WebSocket

Contexto: el commit 2 dejo el camino WebSocket en bypass (los handlers @SubscribeMessage no fijaban
contexto de tenant, asi que sus queries iban sin GUC). Unico punto real afectado: el gateway
`subscribeMatter` (matter.findFirst). messages/notifications services se llaman siempre desde flujos
HTTP, que ya tienen contexto.

Hecho:

- `tenant-context.interceptor.ts`: ahora resuelve el tenant tambien en contexto `ws`
  (`socket.data.tenantId`, que fija el gateway en el handshake), no solo `http`. Cobertura general
  para handlers WS presentes y futuros.
- `realtime.gateway.ts`: `subscribeMatter` envuelve su query en `runWithTenant(tenantId, ...)` como
  garantia explicita del cierre, sin depender de que Nest enganche el interceptor global a WS.

Pruebas (todas verdes, sin BD en la nueva suite):

- Nuevo `test/realtime-tenant-context.e2e-spec.ts` (5 tests): `subscribeMatter` ejecuta su query con
  el GUC del tenant activo (doble de prisma que captura `getCurrentTenantId()` en el momento de la
  query); el interceptor resuelve tenant para http y ws, y bypass cuando no hay usuario.
- `jest --config test/jest-e2e.json`: **10 suites / 60 tests OK** (incluye el portal-realtime con
  sockets reales, sin regresion). `build` y `pnpm -r lint`: OK.

Estado: RLS sin fail-open conocido (HTTP + WebSocket bajo contexto de tenant). D-013/HANDOFF al dia.

### 2026-06-14 - Claude - Frontend Slice F0: fundacion + login E2E (PARADO para revision)

Objetivo: integrar el prototipo Lexora como frontend real de apps/web, por slices verticales.
Paso 0 (inspeccion) registrado en D-014; plan en PLAN (F0-F7). Este bloque = Slice F0.

Hecho:

- Fundacion: tokens del diseno en `app/globals.css` + `tailwind.config` extendido (colores
  var(--token), radios, sombras, animaciones). Primitivos shadcn/ui propios en `components/ui/*`
  (button,input,label,card,badge,skeleton,dialog,sheet,command,dropdown-menu,avatar) + `lib/utils`.
  Providers: TanStack Query + next-themes (claro/oscuro) + NextIntl. Deps anadidas a apps/web.
- Auth (decision D-014, BFF httpOnly SIN tocar el backend): Route Handlers
  `app/api/auth/{login,refresh,logout}` que proxyan a Nest y guardan el refresh en cookie httpOnly;
  el access vive en MEMORIA (`lib/api`), con refresh automatico en 401 via BFF. `lib/auth` (sesion),
  `middleware` (i18n + gate por cookie; redirige login<->dashboard). El cliente NUNCA envia tenantId.
- App shell: sidebar flotante, command bar ⌘K (cmdk), panel IA (Sheet, patron; backend D-011 sin
  cablear), toggle de tema, menu de usuario. Login real (RHF+zod) y dashboard que lee /me + hace una
  query autenticada real (/clients) con estados cargando/error. Copy fiscal por JURISDICCION del
  tenant (Verifactu/IVA vs e-CF/ITBIS, NIF/CIF vs RNC), nunca hardcodeado. i18n es-ES/es-DO (sin EN).

Pruebas/verificacion:

- `tsc --noEmit` OK; `next lint` limpio; **`next build` OK** (rutas dashboard/login/portal + 3 BFF +
  middleware). Vitest: **4/4** del cliente API (Bearer, refresh en 401, fallo de refresh limpia access).
- **E2E real** (API Nest :4000 + web :3000, usuario admin@demo.test sembrado por register-tenant):
  login via BFF -> cookie httpOnly + access -> /me 200 (FIRM_ADMIN, jur es); refresh con ROTACION ->
  /me 200 (repetible); reuse-detection del refresh viejo -> 401 (correcto); /dashboard sin cookie ->
  307 a /login; logout -> 204.

Notas:

- Nombre mostrado "Lexora" via i18n `app.name` (rebrand de paquetes @legalflow/\* sigue diferido).
- Secciones nav F1+ se muestran deshabilitadas ("Pronto") hasta construirse. CLIENT -> /portal
  (placeholder; superficie real en F6).

Siguiente: ESPERAR revision del usuario de la fontaneria de auth (F0) antes de F1 (dashboard +
expedientes). Demo local viva: http://localhost:3000 (admin@demo.test / Sup3rSecret!2026).

### 2026-06-14 - Claude - F0 hardening (gate de rol servidor) + Slice F1 (dashboard + expedientes)

Aprobado por el usuario: tokens y ciclo 401 OK. Aplicado el fix pedido y arrancado F1.

Gate de rol en servidor (D-015): BFF deriva ambito firm|client del access token y fija cookie httpOnly
lf_scope; el middleware redirige en servidor (client fuera del portal -> /portal; firm en portal ->
/dashboard). Helper puro lib/scope.ts con tests. Probado E2E: firm /portal->/dashboard; CLIENT real
(creado via portal-user) /dashboard->/portal (307), /portal 200.

Slice F1 (Dashboard + Expedientes):

- Capa de datos: lib/types.ts, lib/hooks.ts (useMatters/useMatter/useChangeMatterStatus/useResourceCount),
  lib/matter-status.ts (espejo de la maquina de estados + variante de badge). Primitivos ui/tabs.
- Dashboard: KPIs reales (expedientes/clientes via total), expedientes recientes, cumplimiento por
  jurisdiccion. Expedientes: lista real (paginacion, filtro por estado, badges, cargando/vacio/error).
  Ficha hero: overview real + control de transicion de estado (solo validas -> PATCH /status) + tabs
  (Resumen; resto "proximamente"). Nav "Expedientes" habilitado.
- i18n es-ES/es-DO ampliado (matters.\*). Cero datos mock.

Pruebas: tsc OK; vitest 10/10 (api, scope, matter-status); next lint limpio; next build OK
(rutas dashboard, matters, matters/[id]). E2E real: crear expediente (EXP-2026-0001), lista total=1,
detalle con cliente, cambio OPEN->IN_PROGRESS OK, transicion invalida IN_PROGRESS->OPEN -> 400;
/es-ES/matters y /matters/[id] -> 200; sin sesion -> 307 login.

Siguiente: F2 (Documentos) — rellena el tab Documentos de la ficha.

### 2026-06-14 - Claude - Slice F2 (Documentos en la ficha de expediente)

- Cliente API ampliado: api.upload (multipart) y api.download (blob), con el mismo refresh en 401.
- Hooks: useMatterDocuments/useUploadDocument/useAddDocumentVersion/useReviewVersion + downloadVersion.
- Tab Documentos (components/lexora/documents-tab): lista con versiones + badges de revision, subir
  documento, nueva version, descargar, y dialogo de revision (Aprobar/Cambios/Rechazar/En revision +
  comentario). doc-status (variante + formatBytes). i18n documents.\* (es-ES/es-DO). Primitivos textarea
  y DialogFooter.
- Pruebas: tsc/lint/build OK; vitest 10/10. E2E real (API local storage): subir->201, listar,
  revisar APPROVED+comentario, descargar binario correcto.
- Pendiente: pantalla global de Documentos (la API solo expone por expediente) y comparacion de versiones.

### 2026-06-14 - Claude - Slice F3 (Tareas y plazos procesales)

- Tipos+hooks de tareas (useTasks/useCreateTask/useCreateTaskFromDeadline/useUpdateTask/useDeleteTask),
  task-status (variante + isOverdue). Componente TasksPanel reutilizable (global y por expediente):
  lista con filtro por estado, badges, marca de plazo procesal, resaltado de vencidas, cambio de estado,
  crear tarea y crear-desde-plazo (muestra vencimiento calculado + festivos). Pagina global /tasks + tab
  Tareas en la ficha. Nav Tareas habilitado. i18n tasks.\* (es-ES/es-DO).
- Pruebas: tsc/lint/build OK. E2E real: crear tarea (TODO), crear-desde-plazo ES (23-dic +5 habiles ->
  31-dic, festivo 25-dic aplicado), listar por expediente, marcar DONE.

### 2026-06-14 - Claude - Slice F4 (Facturacion: ledger + factura + cumplimiento)

- Tipos+hooks ledger/facturas (useMatterLedger/useAddLedgerEntry/useAddTimeEntry/useCreateInvoice/
  useInvoice/usePayInvoice). lib/ledger (BALANCE_SIGN, variantes, defaultTaxCodes por jurisdiccion).
- Tab Costes (costs-tab): saldo + tabla de apuntes con signo, dialogos de apunte/tiempo/nueva factura
  (lineas + retencion + base indicativa). Detalle de factura /invoices/[id]: cabecera, lineas, totales,
  estado, BLOQUE DE CUMPLIMIENTO real (formato Verifactu/e-CF + huella + encadenamiento + payload JSON),
  marcar como pagada. i18n billing.\* (es-ES/es-DO).
- Pruebas: tsc/lint/build OK. E2E real (tenant con taxId): apunte PROVISION, tiempo 90min@120=180,
  factura ES Verifactu (base 1000, IVA 21%=210, IRPF 15%=150, total 1060, huella presente), cobro->PAID.
- Pendiente: preview fiscal en vivo (sin endpoint de calculo), QR Verifactu renderizado, listado global.

### 2026-06-14 - Claude - Slice F5 (Tiempo real: chat + notificaciones)

- socket.io-client + lib/socket (singleton autenticado con el access token, auth callback reevaluado
  en reconexion). Tipos Message/Notification + hooks (useMessages/useSendMessage/useNotifications/
  useMarkNotificationRead).
- ChatTab (tab Chat de la ficha): historial + envio + recepcion en vivo (matter:subscribe +
  message:new), burbujas propias/ajenas. NotificationsBell en la topbar: contador no leidas, lista,
  marcar leida, refresco en vivo (notification:new). i18n chat._/notifications._.
- Pruebas: tsc/lint/build OK. E2E real: enviar/listar mensajes; flujo de notificacion (admin asigna
  tarea al CLIENT -> CLIENT la recibe (task.assigned) -> marcar leida). Live socket probado en backend.

### 2026-06-14 - Claude - Slice F6 (Portal del cliente, solo lectura + chat)

- Hooks portal (usePortalMatters/Matter/Documents/Ledger/Tasks/Invoices). PortalShell (superficie
  propia, sin sidebar, guard de sesion). Home /portal (mis expedientes + mis facturas). Ficha
  /portal/matters/[id] con tabs Documentos/Costes/Tareas (read-only) + Chat (interactivo, mismo
  endpoint de mensajes). i18n portal.\* ampliado.
- Pruebas: tsc/lint/build OK. E2E real como CLIENT: me=Cliente Uno, 1 expediente, 1 doc, ledger
  saldo 1880, 2 tareas, 1 factura; aislamiento CLIENT -> /matters (staff) = 403.

Estado frontend: F0-F6 completos (demo real de punta a punta). F7 (ajustes/admin/agenda/aprobaciones/
auditoria) DIFERIDO: el backend no expone esos endpoints; cablearlo exigiria mock (rompe la regla).

### 2026-06-14 - Claude - Panel principal igual al diseno (endpoint de resumen + rebuild)

Problema tecnico detectado y resuelto: el panel del prototipo muestra AGREGADOS de despacho (ingresos
por mes, facturable del mes, revisiones pendientes, actividad) que el backend no exponia (solo datos
por expediente). Para replicarlo sin mock se anadio un endpoint de resumen.

Backend: nuevo DashboardModule + GET /api/dashboard/summary (solo lectura, @Roles staff, por tenant):
KPIs (expedientes activos, plazos proximos, facturable mes, revisiones pendientes, clientes, tareas),
revenueByMonth (6 meses desde invoices), deadlines (tareas procesales con expediente+cliente),
recentActivity (AuditLog con nombre de actor). E2e (forma + 401).

Frontend: dashboard reconstruido identico al diseno (cabecera con saludo, fila de 4 KPIs con glifo/
delta, grafico de ingresos SVG area+linea, "Resumen del dia" = bullets CALCULADOS de numeros reales -no
IA, D-011 sin cablear-, plazos con urgencia por color, feed de actividad). lib/activity (labels/colores/
tiempo relativo). i18n dashboard.\* con plurales ICU. Cero mock.

Pruebas: web tsc/lint/build OK; api lint OK; jest e2e 11 suites / 62 tests OK. Verificado el endpoint
contra la API real (activeMatters 1, facturable 1060, plazos, actividad de auditoria real).

### 2026-06-14 - Claude - Seed de demo + pantallas de Clientes/Ficha (replicar prototipo, tanda 1)

Revisado el prototipo Lexora.dc.html de principio a fin (~20 pantallas). Inventario en el chat:
ya hechas / frontend-sobre-endpoints-existentes / requieren backend nuevo (Ajustes, Auditoria,
Aprobaciones, Conflictos). Esta tanda:

- Seed: apps/api/scripts/seed-demo.mjs (contra la API real): 6 clientes, 8 expedientes con estados
  variados, tareas (procesales+normales), tiempo, ledger, facturas repartidas en 6 meses (algunas
  pagadas), documentos+revision, chat. Llena dashboard/expedientes/facturacion/portal/actividad.
- Backend (aditivo): GET /matters acepta ?clientId; lista de clientes incluye \_count.matters.
- Frontend: pantalla Clientes (tabla con avatar, ID fiscal validado, nº expedientes) + Ficha de cliente
  (resumen con contacto y acceso al portal + tabs Expedientes real / Documentos / Facturas). Nav
  Clientes habilitado. i18n clients.\*.
- Pruebas: api build/lint OK, e2e clients-matters 9/9; web tsc/lint/build OK. Verificado contra API real.

Pendiente (siguientes tandas): Onboarding, Centro de notificaciones (pagina), Calendario de plazos,
Documentos global + comparar versiones, y backend NUEVO para Ajustes/Admin, Auditoria, Aprobaciones,
Conflictos.

### 2026-06-14 - Claude - Tanda A.1: Onboarding (alta de despacho multi-paso)

Primera pantalla de la Tanda A (frontend sobre endpoints existentes). Replica el onboarding del
prototipo (Lexora.dc.html 1219-1307): rail izquierdo con los 5 pasos + tarjeta de resumen en vivo,
barra de progreso, contenido por paso y pie con Atras/Continuar.

- Flujo de 5 pasos: nombre del despacho -> jurisdiccion (ES/DO, cards con compliance) -> moneda
  (EUR/DOP, sugerida por jurisdiccion) -> identificacion fiscal (opcional; badge de formato valido por
  jurisdiccion, NIF/CIF vs RNC/Cedula) -> cuenta admin (nombre, email, password >=10). El prototipo
  omite el password; se anade porque el backend lo exige (RegisterTenantDto, MinLength 10).
- Backend: SIN cambios. Se usa el `POST /auth/register-tenant` ya existente (devuelve {tenantId,
  tokens} = auto-login, cubierto por auth.e2e-spec).
- Web: BFF `app/api/auth/register-tenant/route.ts` (proxya a Nest, guarda refresh en cookie httpOnly +
  scope, devuelve solo el access, espejo del login). `register()` nuevo en el contexto de auth
  (lib/auth.tsx) que setea access + carga /me. Gate publico de `/onboarding` en middleware (igual que
  /login: sin sesion permitido, con sesion redirige al home). Pagina
  `app/[locale]/onboarding/page.tsx` con primitivos shadcn + tokens (--brand/--ai-from/--success).
  Enlace "crea uno nuevo" desde el login. i18n `onboarding.*` + `login.noAccount/createFirm` en es-ES
  y es-DO. Estados de error de servidor; sin datos mock.
- Pruebas: web tsc/lint/build OK (rutas /[locale]/onboarding y /api/auth/register-tenant emitidas).
  El contrato de register-tenant ya tiene e2e en api.

Siguiente: A.2 Centro de notificaciones (pagina completa, agrupada por fecha, marcar todas leidas).

### 2026-06-14 - Claude - Tanda A.2: Centro de notificaciones (pagina)

Segunda pantalla de la Tanda A. Replica el "Notifications center" del prototipo (Lexora.dc.html
802-828): cabecera con titulo + badge "En directo" (latido) + boton "Marcar todas como leidas",
grupos por fecha con etiqueta en mayusculas y tarjeta con filas (chip de icono por tipo, titulo+cuerpo,
tiempo relativo, punto de no-leido).

- Backend: SIN cambios. GET /notifications (lista, take 100, desc) + PATCH /notifications/:id/read ya
  existen. "Marcar todas" = PATCH en paralelo cliente-side (Promise.all de las no leidas); idempotente
  (el endpoint solo afecta a readAt null). No se anade endpoint (Tanda A = solo frontend).
- Web: pagina app/[locale]/(app)/notifications/page.tsx (bajo AppShell). Helper lib/notifications.ts:
  notificationKind (por prefijo del type: document.review/task.assigned/...) y groupNotifications
  (buckets today/yesterday/week/earlier por dia natural, preservando orden desc). Hook
  useMarkAllNotificationsRead. Icono y color por tipo (document=violet, task=info, message=brand).
  Tiempo real via socket notification:new (invalida la query, igual que la campana). Enlace "Ver todas"
  nuevo en el dropdown de la campana -> /notifications. Estados loading(skeleton)/vacio/error.
  i18n notifications._ ampliado (viewAll/live/markAll/loadError/retry/group._) en es-ES y es-DO.
- Pruebas: web tsc/lint/build OK (ruta /[locale]/notifications emitida). Sin datos mock.

Siguiente: A.3 Agenda/Calendario de plazos (derivar de GET /tasks procesales con dueDate).

### 2026-06-14 - Claude - Tanda A.3: Agenda/Calendario de plazos

Tercera pantalla de la Tanda A. Replica el "Calendar/agenda" del prototipo (Lexora.dc.html 868-903):
rejilla mensual + rail derecho con la carga de plazos proximos.

- Backend: SIN cambios. Deriva de GET /tasks (tareas con dueDate, sin CANCELLED) + GET /matters
  (?pageSize=100) para mapear matterId -> referencia.
- Web: calendario PROPIO (sin anadir react-day-picker, evita churn de lockfile). lib/calendar.ts:
  buildMonthGrid (6 semanas lunes-first con relleno de meses adyacentes), dayKey (clave de dia local,
  no UTC), daysUntil, deadlineUrgency (overdue/urgent/soon/later/done) + URGENCY_COLOR (tokens). Pagina
  app/[locale]/(app)/calendar/page.tsx: navegacion de mes (prev/next), celdas con numero + badge HOY +
  hasta 3 chips de plazo coloreados (resto "+N mas"), fin de semana sombreado, rail "Carga de plazos"
  (proximos >=0 dias, orden asc, top 8) con barra de color, tipo/titulo, referencia + dia y dias
  restantes. Click en plazo -> ficha del expediente (o /tasks si no tiene). Nav 'calendar' habilitado
  (icono CalendarDays). i18n nav.calendar + calendar.\* (plural ICU en inDays) en es-ES y es-DO. Estados
  loading(skeleton)/vacio/error.
- Pruebas: web tsc/lint/build OK (ruta /[locale]/calendar emitida). Sin datos mock.

Siguiente: A.4 Documentos (vista global del expediente) + comparar versiones (v2->v3).

### 2026-06-14 - Claude - Tanda A.4: Documentos (vista completa) + comparar versiones

Cuarta pantalla de la Tanda A. Replica las pantallas "Documents" (677) y "Doc review" (706) del
prototipo, a nivel de expediente (los unicos endpoints son por expediente).

- Backend: SIN cambios. GET /documents/by-matter/:id (lista con versiones), GET /documents/:id
  (versiones + reviews), POST /documents/versions/:id/review ya existen. Nuevo hook web useDocument(id)
  - tipos DocumentDetail/DocumentVersionDetail/DocumentReview.
- Web:
  - /matters/:id/documents/page.tsx: vista split del prototipo. Dropzone (clic = subida real via
    useUploadDocument), lista agrupada por documento (chip de tipo MIME, estado, versiones con "actual")
    y rail de vista previa (placeholder + tipo/estado + "Revisar documento ->" + descarga). Helper
    mimeLabel en lib/doc-status.
  - /matters/:id/documents/:docId/page.tsx: comparacion/revision. Selector de dos versiones (por defecto
    ultima vs anterior) lado a lado con cabecera vN/fecha/"actual", metadatos (tipo/tamano/subida),
    placeholder de preview y descarga. Rail con panel de revision (textarea + Aprobar/Solicitar
    cambios/Rechazar/En revision, sobre POST review de la version nueva) y cronologia real (subidas de
    version + revisiones con comentario, orden desc). El diff de TEXTO del prototipo es mock: el
    contenido es binario (PDF/DOCX) y no extraemos texto, asi que se sustituye por metadatos+preview+
    descarga (regla: sin datos mock).
  - Enlace "Abrir vista de documentos" desde el tab Documentos de la ficha. i18n documents.\* ampliado +
    matters.openDocuments en es-ES y es-DO.
- Pruebas: web tsc/lint/build OK (rutas de documentos emitidas).

Siguiente: A.5 Acercar la ficha de expediente al layout del prototipo (rail cronometro/plazos/saldo).

### 2026-06-14 - Claude - Tanda A.5: Ficha de expediente acercada al prototipo (rail) — Tanda A COMPLETA

Ultima pantalla de la Tanda A. Acerca la ficha de expediente al layout del prototipo (Lexora.dc.html
453-550): la pestana Resumen pasa a 2 columnas (resumen a la izquierda + rail a la derecha con plazos,
saldo y cronometro).

- Backend: SIN cambios. Reusa GET /tasks?matterId, GET /ledger/matter/:id, POST /ledger/time.
- Web: nuevo components/lexora/matter-rail.tsx con 3 tarjetas:
  - Plazos procesales: tareas del expediente con dueDate + isProcedural, sin DONE/CANCELLED, orden asc,
    top 4; dia/mes + tipo + dias restantes coloreados por urgencia (reusa lib/calendar).
  - Saldo: balance del ledger (formato por moneda del tenant) + "facturado" (suma de apuntes INVOICE) +
    nº de movimientos + "ver ledger ->" (callback que cambia a la pestana Costes).
  - Cronometro EN VIVO: start/stop (intervalo 1s, mm:ss / h:mm:ss), entrada de concepto + tarifa y
    "Fichar N min" que registra el tiempo via POST /ledger/time (useAddTimeEntry) e invalida el ledger.
  - Ficha: Tabs ahora CONTROLADAS (useState) para permitir el salto saldo->Costes; pestana Resumen
    reestructurada en grid 1.6fr/1fr con el rail. i18n matters.rail.\* (plurales ICU) en es-ES y es-DO.
- Pruebas: web tsc/lint/build OK + vitest 3 archivos / 10 tests OK. Sin datos mock.

Tanda A COMPLETA (A.1 Onboarding, A.2 Notificaciones, A.3 Agenda, A.4 Documentos+comparar, A.5 Rail de
ficha). Siguiente: Tanda B (backend NUEVO): B.6 Ajustes/Admin, B.7 Auditoria, B.8 Aprobacion de costes,
B.9 Comprobacion de conflictos + alta de cliente/expediente desde la UI.

### 2026-06-14 - Claude - Fix: activar Documentos y Facturacion (vistas globales agregadas en cliente)

El usuario reporto que los items de sidebar "Documentos" y "Facturacion" salian bloqueados
(enabled:false desde antes de la Tanda A). En el prototipo ambas pantallas son POR EXPEDIENTE
(muestran md.ref / EXP-2026-0042), y el backend solo expone endpoints por expediente, por eso estaban
deshabilitadas. Se activan como vistas GLOBALES agregando en el cliente (sin backend nuevo, sin mock).

- /documents (page.tsx): useMatters(100) + useQueries sobre GET /documents/by-matter/:id de cada
  expediente -> lista plana de todos los documentos (chip MIME, referencia del expediente, version,
  estado de revision, fecha) ordenada desc; cada fila enlaza a /matters/:id/documents/:docId.
- /billing (page.tsx): useMatters(100) + useClients(100) + useQueries sobre GET /ledger/matter/:id ->
  resumen del despacho (facturado total, saldo pendiente, movimientos) + tabla por expediente
  (expediente, cliente, facturado=suma de apuntes INVOICE, saldo) que enlaza a la ficha. Nota de que la
  emision se gestiona dentro de cada expediente.
- nav.ts: documents y billing pasan a enabled:true. i18n documentsOverview._ y billingOverview._ en
  es-ES y es-DO.
- Pruebas: web tsc/lint/build OK (rutas /[locale]/documents y /[locale]/billing emitidas). Servidor web
  reiniciado con el build nuevo.

Nota para Tanda B: una version mas eficiente usaria endpoints firm-wide (GET /documents, GET
/ledger/invoices) en vez de N llamadas por expediente; queda anotado.

### 2026-06-14 - Claude - Sidebar agrupado fiel a la plantilla (4 grupos) + Facturas y Mensajes globales

El usuario detecto que la plantilla agrupa el sidebar en categorias y pidio fidelidad. Revisado el
sidebar de Lexora.dc.html (112-192) y los labels (1459-1460): hay UNA app de despacho con 4 grupos
(no dos dashboards), mas el portal del cliente aparte. Grupos: Espacio de trabajo (Panel, Expedientes,
Clientes, Tareas, Documentos) · Finanzas (Facturacion, Facturas) · Comunicacion (Mensajes) · Despacho
(Agenda, Aprobaciones, Auditoria, Ajustes). El grupo Despacho admin es rol FIRM_ADMIN (settings: "rol
Firm Admin").

- nav.ts: reescrito a NAV_GROUPS (4 grupos) + NAV_ITEMS derivado (plano, para la paleta). Items con
  flag adminOnly. Agenda movida al grupo Despacho. Aprobaciones/Auditoria/Ajustes enabled:false (su
  backend es Tanda B) y adminOnly:true.
- app-sidebar.tsx: render por grupos con cabecera; filtra items adminOnly si !FIRM_ADMIN (useAuth.hasRole).
  El grupo Despacho sigue mostrando Agenda a todo el staff; Aprobaciones/Auditoria/Ajustes solo a admin.
- Vistas globales nuevas (agregacion en cliente, sin backend, sin mock):
  - /invoices (Facturas): reune invoiceId de los apuntes INVOICE de cada expediente (useQueries sobre
    GET /ledger/matter/:id) y trae cada factura (GET /ledger/invoices/:id); tabla numero/cliente/fecha/
    total/estado -> detalle /invoices/:id.
  - /messages (Mensajes): bandeja con una conversacion por expediente (ultimo mensaje), useQueries sobre
    GET /matters/:id/messages; enlaza a /matters/:id?tab=chat.
- Ficha de expediente: soporta deep-link ?tab= (useSearchParams) para abrir la pestana Chat desde Mensajes.
- i18n: nav.invoices/chat/approvals/audit/settings + nav.groups._ + invoicesOverview._/messagesOverview.\*
  en es-ES y es-DO.
- Pruebas: web tsc/lint/build OK (rutas /invoices y /messages emitidas). Servidor reiniciado.

Pendiente (Tanda B, backend nuevo) para completar el grupo Despacho: Aprobaciones (B.8), Auditoria (B.7,
solo falta GET /audit), Ajustes (B.6).

### 2026-06-14 - Claude - Tanda B (backend): usuarios+licencia, ajustes, auditoria, aprobaciones

Backend nuevo del grupo "Despacho" (admin). Migracion aditiva tanda_b_licensing_approvals (sin tablas
nuevas -> sin RLS nueva): Tenant.{plan,maxAdmins=2,maxLawyers=5}; LedgerEntry.{approvalStatus
(enum ApprovalStatus default APPROVED), proposedById, resolvedById, approvalNote}.

- Users (modulo nuevo, @Roles FIRM_ADMIN): GET /users (staff con rol+estado+isSelf), GET /users/seats
  (uso de plazas por rol vs licencia), POST /users (alta de letrado/admin con ENFORCEMENT de licencia:
  cuenta usuarios activos por rol < max), PATCH /users/:id (activar/desactivar y cambiar rol, con: (a)
  control de plazas al activar/promover, (b) proteccion anti-bloqueo: no dejar el despacho sin admin
  activo, (c) al desactivar revoca refresh tokens). El letrado dado de alta puede hacer login; al
  desactivarlo, login 401.
- Settings (modulo nuevo, @Roles FIRM_ADMIN): GET /settings (datos del tenant + seats + counts), PATCH
  /settings (name/locale/taxId; taxId validado por compliance). La licencia es solo lectura.
- Audit: AuditService.listForTenant + AuditController GET /audit (paginado, @Roles FIRM_ADMIN, resuelve
  actorName).
- Aprobaciones (en ledger): POST /ledger/costs/propose (letrado/admin -> apunte DISBURSEMENT PROPOSED,
  no mueve saldo, notifica a admins), GET /ledger/approvals (@admin), POST /ledger/approvals/:id/
  approve|reject (@admin, notifica al proponente). El saldo del ledger ahora SOLO suma apuntes APPROVED.
  El portal del cliente filtra a APPROVED (no ve propuestas internas).
- Pruebas: API build+lint OK; e2e nuevo tanda-b (12 tests) + suite completa 12 suites / 74 tests OK
  (antes 62). Cubre licencia, anti-bloqueo, login de letrado, roles 403, propose/approve/reject y saldo,
  y auditoria de las acciones.

Pendiente Tanda B (frontend): paginas /audit, /approvals, /settings (gestion de usuarios+licencia,
datos del despacho), alta de cliente/letrado y de expediente desde la UI, y cerrar el bucle cliente.

### 2026-06-14 - Claude - Tanda B (frontend) + alta cliente/letrado/expediente + verificacion total

Frontend del grupo Despacho + formularios de alta + cierre del bucle cliente. Sidebar: approvals/audit/
settings pasan a enabled:true (siguen adminOnly -> solo FIRM_ADMIN los ve).

- /settings: datos del despacho (nombre/taxId editables, validado), tarjeta de LICENCIA con medidores de
  asientos (admins/letrados usados vs max), y GESTION DE USUARIOS (lista con rol+estado, alta de letrado/
  admin con aviso si no quedan plazas, activar/desactivar, cambiar rol). Guard cliente: no-admin ve aviso.
- /audit: tabla paginada del registro (fecha, actor, accion legible, recurso). activity.ts ampliado con
  las acciones nuevas.
- /approvals: tarjetas de costes propuestos con importe/proponente/nota y botones aprobar/rechazar.
- Alta desde la UI: dialogo Nuevo cliente en /clients (nombre, ID fiscal validado por servidor, email,
  telefono), Nuevo expediente en /matters (selector de cliente + titulo + tipo), y "Dar acceso al portal"
  en la ficha de cliente (crea usuario CLIENT con credenciales). Proponer coste en el rail de la ficha
  (letrado). Hooks/tipos nuevos en lib (useStaff/useSeats/useCreateStaff/useUpdateStaff, useSettings/
  useUpdateSettings, useAuditLog, useApprovals/useProposeCost/useResolveCost, useCreateClient/
  useCreateMatter/useCreatePortalUser). i18n settings._/audit._/approvals.\* + altas, en es-ES y es-DO.
- VERIFICACION end-to-end contra la API viva (script efimero, 40/40 OK): onboarding admin; licencia
  (1/2 admins, 0/5->1/5 letrados); alta de letrado + login; aislamiento letrado (403 a users/settings/
  audit/approvals); alta de cliente + acceso al portal + login del cliente; alta de expediente;
  aislamiento del cliente (403 a clients/users/POST matters); propose->approve de coste con efecto en el
  saldo (0.00 -> -100.00) y letrado sin permiso de aprobar; portal del cliente (perfil, expedientes,
  ledger sin propuestas) + CHAT bidireccional cliente<->despacho; ajustes (leer/renombrar); auditoria
  (7 acciones); anti-bloqueo del ultimo admin.
- Pruebas: web tsc/lint/build + vitest 10 OK; api e2e 74/74.

### 2026-06-14 - Claude - UX: Expedientes (tabla/tablero), Clientes (tipo/saldo), Documentos (drag&drop/preview)

Mejoras pedidas por el usuario en las tres pantallas principales.

- Expedientes (/matters): conmutador TABLA / TABLERO (kanban por estado). Backend: GET /matters ahora
  incluye client{ id,name } y lawyer{ id,fullName }. Tabla con columnas nuevas Cliente, Letrado y
  Actualizado (updatedAt). Tablero: 5 columnas por estado con tarjetas (ref, titulo, cliente, letrado,
  fecha). i18n matters.col.client/lawyer/updated + viewTable/viewBoard.
- Clientes (/clients): columnas nuevas Tipo (Empresa/Particular, derivado de taxIdKind: CIF/RNC=empresa,
  resto=particular) y Saldo. Backend: GET /clients calcula el saldo agregado por cliente (suma con signo
  de los apuntes APROBADOS de todos sus expedientes) y devuelve la moneda del tenant. i18n clients.type/
  typeCompany/typeIndividual/balance.
- Documentos (/matters/:id/documents): subida por ARRASTRAR Y SOLTAR (onDragOver/Drop, resalte) ademas
  del clic. Cada version muestra el LETRADO que la subio (backend: listByMatter y getOne incluyen
  uploadedBy{ id,fullName }). VISTA PREVIA REAL: descarga la version (Bearer) y la renderiza -> PDF en
  iframe, imagen en img, texto/JSON en <pre>; otros formatos (DOCX) ofrecen descarga. El tab de
  documentos tambien muestra el autor de cada version.
- Pruebas: web tsc/lint/build OK; api build OK; e2e afectados (clients-matters + documents) 16/16.
  Verificado en vivo: matters trae client/lawyer/updatedAt; clients trae balance(730.00)/currency;
  documents trae uploadedBy (Admin Demo); descarga de version 200.

### 2026-06-14 - Claude - Tanda B (frontend resto): conflictos, serie fiscal, festivos, certificado

Frontend de los 4 puntos restantes; cierra la Tanda B al completo.

- Conflictos: hook useConflictCheck (debounced por nombre) en el dialogo Nuevo cliente -> aviso amarillo
  con las coincidencias (parte ya existente + nº de expedientes) antes de crear.
- Ajustes: campo "Serie de facturación" en la tarjeta del despacho (afecta a la numeración). Tarjeta
  Festivos locales (alta fecha+nombre, lista, borrar). Tarjeta Certificado digital (subir .p12/.pem,
  muestra nombre+fecha). Hooks useAddHoliday/useRemoveHoliday/useUploadCertificate, tipos FirmSettings
  ampliados (invoiceSeries/holidays/certificate) + ConflictResult. i18n settings.firm.series/holidays._/
  cert._ y clients.conflict\* (es-ES + es-DO).
- Pruebas: web tsc/lint/build OK. Backend ya cubierto por e2e 79/79.

TANDA B COMPLETA (B.6 Ajustes/usuarios/licencia, B.7 Auditoria, B.8 Aprobaciones, B.9 Conflictos +
serie fiscal + festivos + certificado + altas desde UI).

### 2026-06-15 - Claude - Asignacion de letrado a expedientes (admin-only)

La columna "Letrado" existia en la lista de expedientes pero no habia forma de asignar un letrado desde
la UI. Reportado por el usuario. Decision de producto: solo FIRM_ADMIN asigna; selector en creacion y
ficha.

- Backend (matters): GET /matters/:id ahora incluye lawyer{ id,fullName } (antes solo client). Nuevo
  GET /matters/assignees (admin-only) -> letrados asignables (LAWYER/FIRM_ADMIN activos). Nuevo
  PATCH /matters/:id/lawyer (admin-only) -> asigna o desasigna (lawyerId:null), valida que el letrado
  pertenezca al despacho. create() solo acepta lawyerId si quien crea es FIRM_ADMIN (si no, 403).
  Quitado lawyerId del PATCH /matters/:id generico (cierra el backdoor por el que un LAWYER reasignaba).
  @Roles a nivel de metodo sobrescribe el de clase (getAllAndOverride).
- Frontend: dialogo de alta con selector de letrado (opcional, solo admin). Ficha: campo Letrado de solo
  lectura para letrados y selector editable (asignar/cambiar/desasignar in situ) para admin. Hooks
  useAssignees / useAssignMatterLawyer + tipo Assignee. i18n matters.newLawyer/newLawyerPlaceholder/
  unassigned/assignError (es-ES + es-DO).
- Pruebas: api build OK, web tsc/lint + api lint OK. e2e: +8 tests (listado, asignacion, desasignacion,
  inclusion en findOne, 403 de no-admin en listar/asignar/crear-con-lawyerId). Suite completa en serie
  (--runInBand, como CI): 87/87.

### 2026-06-15 - Claude - Tanda endurecimiento: Tarea 1 (gobernanza) + Tarea 2 (RLS fail-closed)

Paso 0 + gobernanza + el PR sensible de RLS. Objetivo: endurecer transversales sin anadir funcionalidad.

- **Paso 0 (hallazgos):** RLS estaba en FAIL-OPEN (sin contexto -> ve todo); el gateway Socket.IO YA
  fijaba el contexto del tenant del socket (D-013, no estaba en bypass); branch protection solo exigia
  el check "CI OK" + strict, sin review de CODEOWNERS; 8 PRs de Dependabot abiertos (todos majors).
- **Tarea 1 - Gobernanza (hecho):** branch protection en main via API: required check "CI OK" + strict
  (rama al dia), `require_code_owner_reviews` + `required_approving_review_count: 0`, sin force-push, sin
  deletion, `required_conversation_resolution`, `enforce_admins: false` (override de admin para que el
  owner pueda fusionar los PR sensibles tras revisarlos; en repo de un solo owner no hay self-approval).
  Triaje Dependabot: cerrado #14 (React 19) por politica deliberada (se queda en React 18, D-019);
  dejados abiertos para el usuario los 4 majors del enunciado (#12 NestJS 11, #10 next-intl 4, #9 Prisma
  7, #8 Zod 4) + 3 majors no listados pero igualmente breaking (#16 eslint 8->10, #15 tailwind-merge
  2->3, #18 @vitest/coverage-v8 2->4). NO habia ningun minor/patch seguro pendiente (los previos ya
  estaban fusionados: #3-7, #11). PENDIENTE de decision del usuario: quitar el catch-all `* @owner` de
  CODEOWNERS para que los PR no-sensibles sean auto-mergeables en verde sin review (hoy el catch-all
  obliga review en TODOS).
- **Tarea 2 - RLS fail-closed (PR abierto, NO fusionado, espera OK del usuario):** ver D-020. Migracion
  `20260615120000_rls_fail_closed` (quita la clausula de bypass de todas las politicas + crea rol
  `legalflow_system` BYPASSRLS). `SystemPrismaService` (cliente de sistema) para login/registro/carga de
  token. `users.service` $transaction crudo -> tenantTransaction. `.env.example` + CI con
  `SYSTEM_DATABASE_URL`. Tests: rls/rls-wiring invertidos a fail-closed + siembra/limpieza por el rol de
  sistema; varios specs migrados (las lecturas/escrituras de siembra sin contexto pasan por `system`).
- **Pruebas (local, como legalflow_app):** 90/90 e2e en verde, api typecheck + lint limpios. Roles
  verificados en BD: legalflow_app (NOBYPASSRLS), legalflow_system (BYPASSRLS, no super). Politica de
  Client confirmada fail-closed. PENDIENTE: verde en CI real tras push.
- **Siguiente:** esperar OK del usuario para fusionar la Tarea 2; decidir el catch-all de CODEOWNERS;
  luego Tareas 3 (cifrado en reposo + TLS), 4 (RGPD/172-13) y 5 (pulido).

### 2026-06-15 - Claude - Cierre Tarea 1/2 (fusionadas) + Tarea 3 (cifrado en reposo + TLS)

- **Tarea 1 cerrada:** catch-all de CODEOWNERS quitado (PR #20, aprobado por el usuario) -> solo rutas
  sensibles exigen review; el resto auto-mergeable. `ignore` de React major en dependabot.yml (PR #21)
  para que no reabra React 19. Ambos fusionados por override de admin en verde (cambios autorizados).
- **Tarea 2 fusionada (PR #19):** el usuario dio OK condicional a un checklist de 5 puntos; corridos
  contra el diff + la BD viva: (1) 16 politicas, 0 gaps, 0 restos `IS NULL`; (2) superficie del rol de
  sistema = solo login/registro/loadUserForToken; (3) WITH CHECK en las 16; (4) ningun raw/transaction
  autenticado sin GUC; (5) migracion idempotente. Ademas se ENDURECIO el fallback: en produccion, si
  falta SYSTEM_DATABASE_URL el arranque falla (no "fallar hacia mas privilegio"). CI real verde.
- **Tarea 3 (cifrado en reposo + TLS) - PR nuevo, auto-merge en verde:** EncryptedStorageProvider
  (decorador AES-256-GCM sobre cualquier StorageProvider) cifra el contenido de documentos; transparente
  para DocumentsService; passthrough de objetos legacy; DATA_ENCRYPTION_KEY obligatoria en produccion
  (arranque falla si falta). PII a nivel de columna = fase diferida (blind index / TDE de disco). TLS en
  el borde documentado en RUNBOOK.md. Ver D-021.
- **Pruebas (local):** encryption.e2e 7/7 + documents e2e 7/7 con clave activa; typecheck + lint limpios.
- **Siguiente:** Tarea 4 (RGPD/Ley 172-13) -- si toca migraciones, esperar OK; y Tarea 5 (pulido).

### 2026-06-15 - Claude - Tarea 4 RGPD/172-13: export (fusionado #28) + anonimizacion (PR espera OK)

- **Incidencia de entorno (resuelta):** el worktree perdio su .git a mitad de sesion y git resolvia al
  repo principal; diagnosticado y recuperado sin perdidas (Tareas 1-3 ya estaban en main). Anotado en
  memoria. El export/RAT (PR-X) se re-aplico limpio y se fusiono (#28). Esta tarea continua en un
  worktree nuevo FUERA del anidamiento (C:/Users/OswaldoVargasRodrigu/lf-gdpr-anon).
- **PR-X (fusionado #28):** GET /clients/:id/gdpr-export (FIRM_ADMIN) + RAT.md (art. 30) + fixes de
  honestidad en docs de cifrado (clave = 2a joya de la corona; rotar hoy huerfana blobs; "documentos
  cifrados + disco cifrado", no "todo cifrado en reposo").
- **PR-Y (feat/gdpr-anonymize, ABIERTO, NO fusionado, espera OK -- toca migracion):** supresion por
  ANONIMIZACION (no hard-delete) POST /clients/:id/anonymize: sobrescribe PII, desactiva/anonimiza el
  usuario de portal y revoca sesiones, PRESERVA expediente/facturas/ledger/AuditLog (retencion legal
  manda); rechaza re-anonimizar (409). Migracion 20260615130000: Client.anonymizedAt +
  Tenant.dataRegion/retentionMonths (retencion configurable = metadato, NO auto-purga). Settings expone
  dataRegion/retentionMonths. Ver D-022.
- **Pruebas (local, como legalflow_app):** 107/107 e2e en verde, typecheck + lint limpios. Anonymize:
  PII sobrescrita, expediente+facturas preservados, AuditLog conserva traza, portal cortado (401),
  409 re-anonimizar, 403 letrado, 404 cross-tenant.
- **Siguiente:** esperar OK para fusionar PR-Y; luego Tarea 5 (pulido) si el usuario lo quiere.

### 2026-06-15 - Claude - Tarea 5 (pulido): preview fiscal, QR, i18n API, nav responsive, motion+Geist

- **Un PR por ítem; CODEOWNERS decide auto-merge vs revisión.**
- **Item 1 - Preview fiscal (PR #30, ABIERTO, espera OK - toca compliance):** endpoint read-only
  POST /ledger/invoices/preview que reutiliza la MISMA matematica fiscal que la emision real
  (provider.previewInvoice; buildInvoiceRecord ahora delega en el) -> preview y factura no divergen.
  UI en vivo en "Nueva factura" con indicador Verifactu/e-CF. Tests: preview==emision (ES con/sin
  retencion, RD ITBIS) + e2e read-only no crea factura + codigo invalido 400. Ver D-023.
- **Item 2 - QR Verifactu (PR #31, FUSIONADO):** render del QR escaneable (qrcode.react, ISC) desde la
  qrUrl de cotejo AEAT del complianceRecord; solo VERIFACTU (en RD/e-CF no aplica); fondo blanco fijo.
- **Item 3 - i18n exhaustivo de la API (PR #32, ABIERTO, espera OK - toca auth):** todo error por
  messageKey con catalogo COMPLETO es-ES/es-DO (common/api-messages.ts) + apiError(); ~56 throws
  refactorizados; validacion de DTO via pipe compartido (validation.failed); gate de completitud.
  e2e 158/158, cobertura auth (GATE) por encima de umbrales.
- **Item 4 - Nav responsive (PR #33, FUSIONADO):** la sidebar flotante colapsa en un Drawer (Sheet)
  por debajo de lg con boton hamburguesa; se cierra al navegar. Responsive web, no app nativa.
- **Item 5 - Animaciones + Geist (PR #34, FUSIONADO):** framer-motion con los tokens del handoff
  (lib/motion.ts) + PageTransition que respeta prefers-reduced-motion; webfont Geist via next/font.
- **Verificacion local:** compliance 50/50, api e2e 158/158, web build+unit verdes, typecheck+lint
  limpios, gate de licencias OK. CI real verde en todos los PR (los fusionados via auto-merge).
- **Docs:** PLAN (marcados items + corregida la linea stale de anonimizacion: #29 esta fusionado),
  DECISIONS D-023, HANDOFF, este worklog.
- **Siguiente:** esperar OK para fusionar #30 (preview) y #32 (i18n). Resto cerrado.

- **Cierre (mismo día):** tras la verificación del owner, #30 (preview) y #32 (i18n) fusionados a main
  vía admin override (CI verde, enforce_admins:false). Auditado en el diff: #30 delega de verdad
  (buildInvoiceRecord -> previewInvoice, un solo computeInvoiceTotals por provider), read-only puro
  (sin BD/serie/ledger), autenticado + solo staff. #32 message-only (misma clase/status/condiciones),
  login sin enumeración (email inexistente == contraseña incorrecta -> auth.invalidCredentials), pipe
  con mismo whitelist/forbidNonWhitelisted. Los 5 ítems de la Tarea 5 quedan en main. E8 cerrado.

### 2026-06-15 - Claude - Fase 1 (cobro) · PR-1 estados ricos + vencimiento

Objetivo:

- Arrancar la Fase 1 (cobro y rentabilidad). Desglose en PRs propuesto y decisiones del usuario
  confirmadas (ver D-024): PaymentProvider por jurisdicción, Stripe Connect ES + RD stub, rebanada
  fina (PR-1→PR-4), dunning in-app. PR-1 pone los cimientos de schema que faltaban para el cobro.

Acciones (PR-1):

- `packages/domain/enums.ts` + `schema.prisma`: `InvoiceStatus += PARTIAL, OVERDUE`.
- `Invoice`: nuevos campos `dueDate`, `paidAt`, `amountPaid` (Decimal default 0) + índices
  `(tenantId,status)` y `(tenantId,dueDate)`. Migración `20260615192441_invoice_states_due_date`
  (generada contra la BD real; sin drift). RLS/GRANTs existentes ya cubren columnas nuevas.
- `ledger.service`: `createInvoice` fija `dueDate` (dto.dueDate ?? issueDate + 30 días); `payInvoice`
  fija `paidAt` + `amountPaid = total`; nuevo `listInvoices` con `overdue` DERIVADO en lectura
  (no depende del scheduler de dunning; vencida = no liquidada y dueDate < medianoche UTC de hoy).
- `GET /ledger/invoices` (listado real, antes inexistente; filtros `status`, `overdue`) + DTO de query.
- Web: `useInvoices` (reemplaza la reconstrucción cliente-side desde apuntes INVOICE), página
  `/invoices` con filtros (Todas/Vencidas/Parciales/Pagadas), columna Vencimiento (resalta vencidas)
  y badge "Vencida" derivado. i18n es-ES/es-DO (estados PARTIAL/OVERDUE + filtros).

Pruebas:

- API e2e `ledger` 15/15 verde (10 previas + 5 nuevas: dueDate por defecto, amountPaid/paidAt al
  cobrar, listado, overdue derivado, pagada-no-vencida). web typecheck + lint + api lint limpios.

- **Sensibilidad / merge:** toca `prisma/` (migración) → CODEOWNERS → **PR-y-espera** (no auto-merge).
- **Siguiente:** PR-2 (captura de tiempo, auto-mergeable) tras OK; PR-3 (PaymentProvider+Payment) y
  PR-4 (Stripe Connect ES) después.

### 2026-06-15 - Claude - Fase 1 (cobro) · PR-3 PaymentProvider + modelo Payment

Objetivo:

- Cimientos de cobro reales: abstracción de pasarela enchufable por jurisdicción + entidad `Payment`
  con cobros PARCIALES. Sin red todavía (Stripe llega en PR-4). Apilado sobre #47 (depende de
  `Invoice.amountPaid` de PR-1). PR-2 ya está en main.

Acciones (PR-3):

- Domain: enums `PaymentStatus` (PENDING/SUCCEEDED/FAILED) + `PaymentMethod` (MANUAL/STRIPE).
- Schema: modelo `Payment` (amount/currency/status/method/providerRef único/metadata/paidAt) con
  relación a Invoice/Tenant. Migración `20260615200036_payments` (creada `--create-only` + RLS
  FAIL-CLOSED añadida a mano: ENABLE/FORCE + policy `tenant_isolation`; GRANTs vía ALTER DEFAULT
  PRIVILEGES ya existentes). Mismo patrón que D-020.
- `apps/api/src/payments/`: interfaz `PaymentProvider` (espejo de ComplianceProvider) + factory por
  jurisdicción + `StripePaymentProvider` (esqueleto ES; online off sin clave) + `DominicanStubProvider`
  (RD). `PaymentsService.reconcile` (agnóstico de pasarela): crea `Payment`, mueve `amountPaid`,
  recalcula estado PARTIAL/PAID, refleja en ledger; idempotente por `providerRef` (listo para el webhook
  de PR-4). `POST /payments` (cobro manual/parcial), `GET /payments/config`, `GET /payments/by-invoice/:id`.
- `ledger.payInvoice` ahora DELEGA en `PaymentsService.recordManualPayment` (sin duplicar lógica de
  cobro). i18n de API: claves `payments.*` (es-ES/es-DO).

Pruebas:

- e2e `payments` 8/8 (config por jurisdicción, parcial→PARTIAL, resto→PAID, exceso 400, ya-pagada 400,
  listado, atajo /pay retro-compatible, aislamiento) + `ledger` 15/15. typecheck + lint API limpios.

- **Sensibilidad / merge:** migración + ledger → **PR-y-espera** (el owner fusiona). Apilado sobre #47.
- **Siguiente:** PR-4 (Stripe Connect ES: checkout + webhook idempotente sobre `reconcile`).

### 2026-06-15 - Claude - Fase 1 (cobro) · PR-2 captura de tiempo sin fricción

Objetivo:

- Reducir el tiempo no registrado y el no facturado (palanca de rentabilidad nº1). Auto-mergeable:
  no toca migraciones/auth/compliance/prisma → fuera de CODEOWNERS. (PR-1 sigue abierto en #47,
  PR-y-espera; esta rama parte de main, sin depender de #47.)

Acciones (PR-2):

- API: `GET /ledger/time` (read-only; filtros `mine`/`unbilled`/`date`/`matterId`) en
  `ledger.service.listTime` + DTO de query. Calcula honorario por ficha y totales (la UI no recalcula).
  Acotado al tenant por RLS.
- Web: hooks `useTimeEntries` + `useLogTime` (registro global, matterId en el cuerpo); diálogo
  reutilizable `LogTimeDialog` (selector de expediente + concepto + minutos + tarifa); página `/time`
  con **Mi día** (repaso de hoy) y **Sin facturar** (agrupado por expediente, con total y enlace a
  emitir). Nav `time` habilitado → aparece también en ⌘K ("desde cualquier pantalla"). i18n es-ES/es-DO.

Pruebas:

- API e2e `ledger` 13/13 (3 nuevos: tiempo del día con honorario, tiempo sin facturar, aislamiento
  cross-tenant del tiempo). web/api typecheck + lint limpios.

- **Sensibilidad / merge:** auto-mergeable (sin rutas CODEOWNERS) → auto-merge en verde.
- **Siguiente:** PR-3 (PaymentProvider + modelo Payment; PR-y-espera, depende de PR-1/#47).

### 2026-06-15 - Claude - Fase 1 (cobro) · PR-4 Stripe Connect (ES) + webhook

Objetivo:

- Cobro online real con **Stripe Connect (Standard)**: el dinero va a la cuenta del despacho, no a la
  plataforma. Decisiones del usuario: Standard + mocks en CI (env-gated, sin claves reales). Apilado
  sobre PR-3.

Acciones (PR-4):

- Dep `stripe`. Migración `tenant_stripe_account` (Tenant.stripeAccountId; toca prisma/ → CODEOWNERS).
- `StripePaymentProvider` real (env-gated, cliente lazy): `createCheckout` (Checkout Session DIRECTO en
  la cuenta conectada del despacho, metadata invoiceId/tenantId), `verifyWebhook` (firma), Account
  Links de onboarding + estado de la cuenta. Tipos de Stripe vía `InstanceType<typeof Stripe>` (el
  namespace `Stripe.*` no resuelve como tipo con esta tsconfig).
- `PaymentsService`: `createCheckout` (exige cuenta conectada + saldo pendiente), `handleStripeWebhook`
  (verifica firma → en `checkout.session.completed` concilia bajo `runWithTenant(tenantId del evento)`,
  idempotente por `providerRef`; los conflictos de negocio no provocan reintentos), `connectOnboard`/
  `connectStatus`. Actor del webhook = sistema (audit "Sistema", sin FK).
- Controllers: `POST /payments/checkout`, `connect/onboard`+`status` (admin); **webhook PÚBLICO**
  (`PaymentsWebhookController`, `@Public`, cuerpo CRUDO vía `rawBody:true` en main.ts) separado para no
  heredar `@Roles`. i18n `payments.*`. `.env.example`: STRIPE_SECRET_KEY/WEBHOOK_SECRET/APP_PUBLIC_URL.
- Web: botón "Pagar online" en la factura (si `payments/config.onlineEnabled`) + progreso de cobro
  parcial; tarjeta "Cobro online (Stripe)" en Ajustes (conectar/gestionar/estado). Hooks + i18n.

Pruebas:

- e2e mockeado `payments-stripe` 6/6 (checkout exige conexión, onboarding guarda accountId, webhook→PAID
  - Payment STRIPE, idempotencia, evento no manejado sin efectos) + `payments` 8/8 + `ledger` 18/18.
    api/web typecheck + lint + build limpios. `pnpm audit --prod`: 0 high (stripe no añade advisory).

- **Sensibilidad / merge:** migración + dinero + webhook sin auth + secretos → **PR-y-espera**. Apilado
  sobre PR-3 (#49). **Verificación EN VIVO pendiente: el owner cablea sus claves Stripe + onboarding.**
- **Cierre Fase 1 (rebanada fina):** PR-1→PR-4 entregados. Cola (retainer/dunning/recurrente) pendiente.

#### Endurecimiento de seguridad del webhook (revisión del owner, 7 puntos)

Auditados los 7 controles del endpoint público (el más sensible del proyecto). 5 ya correctos:
metadata FIRMADA para tenant/invoice; conciliación bajo RLS del tenant (rol app + `runWithTenant`, NO
bypass); idempotencia (unique `providerRef` + dedup); checkout autenticado/rol/tenant-scoped que usa el
`stripeAccountId` de la factura; Checkout ALOJADO (redirección, SAQ A); secretos env-gated, no logueados.
**Dos huecos corregidos en la PR:**

- (1b) Firma inválida devolvía 500 → ahora `verifyWebhook` envuelve `constructEvent` y traduce a **400**
  (rechazo limpio, sin procesar). El secreto sigue obligatorio para procesar (fail-closed).
- (4) El webhook NO comparaba moneda → añadido `currency` a `reconcile`: si la moneda del evento ≠ la de
  la factura, **rechaza** (no concilia USD contra EUR). El webhook pasa `session.currency`.
- Tests nuevos: firma inválida → 400 sin conciliar; moneda distinta → no cobra. `payments-stripe` 8/8.
- **Nota RD (confirmada por el owner):** Stripe **no sirve a RD** estructuralmente (solo ~46 países). El
  stub no es "cablear Stripe luego": RD necesita Azul/CardNet o Merchant-of-Record. La abstracción
  `PaymentProvider` lo deja añadir limpio. Memoria de decisiones de Fase 1 actualizada.

### 2026-06-15 - Claude - Stripe: verificación EN VIVO (modo test) + endurecimiento

Objetivo:

- Probar el cimiento del webhook con eventos FIRMADOS de verdad antes de construir encima (dunning/
  recurrente). El owner aportó claves de test; se probó contra la API real de Stripe + firma HMAC real.

Verificado en vivo (no mocks):

- Clave real carga → `GET /payments/config` `onlineEnabled:true`. `POST /connect/onboard` hace llamada
  REAL a Stripe → devuelve 400 _"sign up for Connect"_: **hay que habilitar Connect una vez en
  dashboard.stripe.com/connect** (hallazgo real; documentado en `docs/STRIPE_TEST.md`).
- `apps/api/scripts/stripe-webhook-verify.mjs` (claves SOLO desde env): firma payloads con el SDK real
  (mismo `constructEvent` de producción) y POSTea al webhook. **11/11**: firma válida→200 y concilia a
  PAID, idempotencia ante reenvío (1 `Payment`), firma manipulada→400 sin conciliar, moneda distinta→no
  cobra. Sin navegador ni Connect.

Endurecimiento que destapó la corrida (aplicado):

- Webhook devuelve **200** (`@HttpCode(200)`), no 201 (convención de webhooks; Stripe acepta 2xx).
- Colisión `providerRef` (P2002, carrera/reentrega concurrente) se trata como **idempotente** (no 500).
- e2e mockeado `payments-stripe` ajustado a 200 (8/8). typecheck + lint limpios.

- **Sensibilidad / merge:** toca `src/payments/` (fuera de CODEOWNERS) + test/docs/script → auto-mergeable.
- **Pendiente del owner:** habilitar Connect + completar onboarding → flujo de Checkout con tarjeta real.
  **Rotar las claves de test** (estuvieron en el chat). Luego: cola de Fase 1 (retainer/dunning/recurrente).

## 2026-06-16 — Claude — Ítem 1 (Dunning) PR-D1: modelo + migración + RLS

Objetivo:

- Arrancar el dunning (Ítem 1 de la cola de Fase 1). Desglose acordado con el owner en 5 PRs pequeños
  (D1 modelo → D2 motor+in-app+manual → D3 cron → D4 UI despacho → D5 UI portal). Decisiones fijadas:
  reglas en **tabla `DunningRule`** (no JSON), disparo **manual primero + cron en D3**. Ver D-025.

Hecho (PR-D1, solo cimientos, sin lógica):

- `packages/domain/src/enums.ts`: enums agnósticos `DunningChannel { IN_APP, EMAIL, SMS }` (solo IN_APP
  se implementará en D2; EMAIL/SMS = integración Fase 2), `DunningSeverity { REMINDER, WARNING, FINAL }`
  (escalado), `DunningReminderStatus { SCHEDULED, SENT, SKIPPED, FAILED }`.
- `apps/api/prisma/schema.prisma`: modelos `DunningRule` (reglas por tenant; `@@unique([tenantId,
offsetDays])`) y `DunningReminder` (ancla de idempotencia `@@unique([tenantId, invoiceId,
offsetDays])`; FK `ruleId` ON DELETE SET NULL; instantánea de etapa). Relaciones inversas en
  `Tenant`/`Invoice`. Enums Prisma espejo.
- `apps/api/prisma/migrations/20260616120000_dunning/migration.sql`: tablas + índices + FKs + **RLS
  fail-closed** en ambas (ENABLE+FORCE+policy `tenant_isolation`, mismo patrón que Payment/D-020).

Pruebas:

- `prisma validate` → schema válido; `prisma format` aplicado. `packages/domain` typecheck limpio.
- `prisma generate` LOCAL bloqueado por `EPERM` (el API en marcha, PID `dist/main.js`, retiene el DLL
  del query engine en Windows). No es problema de schema; CI regenera en Linux. No maté el proceso del
  owner.

Sensibilidad / merge:

- Toca `prisma/` (migración) + RLS → **PR-y-espera** (no auto-merge). Sin código de negocio todavía.
- **Siguiente:** PR-D2 (DunningService + canal in-app + endpoint manual). Pendiente: verde en CI + OK
  del owner para fusionar D1.

## 2026-06-16 — Claude — Ítem 1 (Dunning) PR-D2: motor + canal in-app + endpoint manual

Contexto: D1 fusionado a main (#56, CI verde incl. e2e RLS dedicado que el owner exigió). Arranca D2,
la primera parte con lógica.

Hecho:

- `apps/api/src/ledger/overdue.util.ts`: extraídos `deriveOverdue`/`startOfTodayUtc`/`addDaysUtc`/
  `SETTLED_STATUSES`/`DEFAULT_PAYMENT_TERM_DAYS` desde `ledger.service` (fuente única; el ledger ahora
  importa de ahí, comportamiento idéntico). Evita duplicar "vencidas" en el motor.
- `apps/api/src/dunning/`: `DunningService` (evalúa vencidas vs reglas efectivas; crea recordatorios
  idempotentes capturando P2002; entrega por canal; audita `dunning.reminder_sent`), `dunning.policy.ts`
  (calendario por defecto +1/+7/+15 con fallback si no hay reglas), canal `DunningChannelDispatcher`
  multi-provider + `InAppChannel` (avisa a FIRM_ADMIN), `DunningController` (`POST /dunning/run`,
  `GET /dunning/reminders`, `@Roles(FIRM_ADMIN, LAWYER)`), `DunningModule` (registrado en `app.module`).
- Docs: PLAN (D2 [~]), DECISIONS (D-025 ampliada con decisiones de implementación), arquitectura
  07-api-reference (sección `dunning`).

Pruebas (LOCAL, contra Postgres real como `legalflow_app`; migración aplicada con `migrate deploy`):

- `apps/api/test/dunning.e2e-spec.ts` 7/7: 401 sin token, 403 CLIENT, run entrega 3 etapas, 1
  recordatorio por etapa en SENT, **doble run sin duplicados ni 500 (idempotencia)**, 3× audit
  `dunning.reminder_sent`, aislamiento por tenant. RLS de D1 7/7. typecheck + eslint API limpios.
- Nota: hubo que parar la instancia local del API (lock del query engine en Windows) para regenerar el
  cliente Prisma; el owner había autorizado reiniciarla.

Sensibilidad / merge: lógica de dunning (dinero-adyacente) → **PR-y-espera**. No toca migración.
Siguiente: PR-D3 (cron diario con `@nestjs/schedule` reutilizando `DunningService`).

## 2026-06-16 — Claude — Ítem 1 (Dunning) PR-D3: cron diario / barrido multi-tenant

Contexto: D2 fusionado a main (#57, CI verde, OK del owner). D3 cierra la automatización: las vencidas
se persiguen solas a diario.

Hecho:

- Dependencia nueva `@nestjs/schedule@^6.1.3` (compatible con Nest 10). `ScheduleModule.forRoot()` en
  `app.module` (descubre los `@Cron`).
- `apps/api/src/dunning/dunning.cron.ts`: `DunningCron` con `@Cron(EVERY_DAY_AT_6AM, name:'dunning-daily')`
  → `sweep()`, que **barre todos los tenants** reutilizando `DunningService.evaluateTenant` (actor=sistema).
  Clave RLS: el cron NO tiene contexto de request, así que lista tenants con el cliente de SISTEMA
  (BYPASSRLS) y evalúa cada uno dentro de `runWithTenant(tenantId)` → la extensión de Prisma fija
  `app.tenant_id` y las queries del motor quedan acotadas por RLS (sin fugas). Un fallo por tenant se
  registra y no detiene el barrido. Registrado en `DunningModule`.
- Docs: PLAN (D3 [~]), DECISIONS (D-025 ampliada con D3), este worklog.

Pruebas (LOCAL, Postgres real como `legalflow_app`):

- `apps/api/test/dunning-cron.e2e-spec.ts` 2/2: el barrido (llamado vía `app.get(DunningCron).sweep()`,
  sin request) genera los 3 recordatorios SENT correctos POR TENANT bajo RLS (A solo A, B solo B), y un
  segundo barrido es idempotente. Suite dunning completa 3/3 · 16 tests. typecheck + eslint limpios.

Sensibilidad / merge: automatización del cobro + dependencia nueva → **PR-y-espera**. No toca migración
ni RLS (reusa el patrón existente). Siguiente: PR-D4 (UI despacho: surfacing + "recordar ahora" + timeline).

## 2026-06-16 — Claude — Ítem 1 (Dunning) PR-D4: UI despacho

Contexto: backend del dunning completo (D1+D2+D3 en main). D4 = primera de las dos PRs de UI
(auto-mergeable: solo lectura + un botón que llama al endpoint existente; no toca auth/RLS/migración/dinero).

Hecho (apps/web):

- `lib/types.ts`: `DunningReminder`, `DunningRunSummary`, enums `DunningSeverity/Status/Channel`.
- `lib/hooks.ts`: `useDunningReminders(invoiceId?)` (GET /dunning/reminders) + `useDunningRun()`
  (POST /dunning/run; invalida reminders + invoices).
- `components/lexora/dunning.tsx`: `DunningRunButton` (botón "Recordar vencidas" con resumen
  entregados·vencidas o error en línea) y `DunningTimeline` (línea de tiempo por factura: severidad/
  estado/canal en badges + fecha; cargando/vacío/error).
- Cableado: botón en la cabecera de la lista de facturas (`(app)/invoices`); timeline en el detalle
  (`(app)/invoices/[id]`, oculto en borradores).
- i18n `dunning.*` en es-ES y es-DO (plurales ICU en `runResult`/`offsetDays`).

Pruebas (local): web `tsc` + `next lint` + `next build` + `vitest` (20) OK. Sin datos mock; estados
cargando/vacío/error; dark+light vía tokens; badges con texto (no solo color) para AA.

Sensibilidad / merge: solo UI de lectura + acción sobre endpoint existente → **auto-mergeable en verde**.
Siguiente: PR-D5 (portal cliente: banner de recordatorio con enlace de pago).

## 2026-06-16 — Claude — Ítem 1 (Dunning) PR-D5: UI portal cliente (cierra el Ítem 1)

Contexto: última pieza del dunning. El cliente NO puede llamar a `/dunning/*` (staff-only), así que el
recordatorio del portal se deriva de que SU factura esté vencida.

Hecho:

- API (lectura, no sensible): `portal.service.listInvoices` ahora añade `dueDate` y `overdue` derivado
  con `deriveOverdue` (misma regla que el despacho; reusa `ledger/overdue.util`). Acotado al cliente.
- Web: tipo `PortalInvoice` (con `overdue`/`dueDate`), `usePortalInvoices` retipado. Portal home: banner
  de recordatorio (danger) cuando hay vencidas + badge "Vencida" en la fila; el botón "Pagar online"
  existente cubre el enlace de pago (reusa el checkout de Stripe). i18n `portal.overdueBanner/overdueHint`
  (plural ICU) en es-ES y es-DO.

Pruebas (local): e2e `portal-dunning` 1/1 (overdue=true en vencida, false en vigente, dueDate expuesto,
ámbito propio). API typecheck OK. web tsc + next lint + next build + vitest (20) OK.

Sensibilidad / merge: UI + ampliación de lectura del portal → **auto-mergeable en verde**.

**Ítem 1 (Dunning) COMPLETO**: D1 modelo+RLS (#56) · D2 motor+in-app+manual (#57) · D3 cron (#58) ·
D4 UI despacho (#59) · D5 UI portal (#60). Las vencidas se persiguen solas (cron diario) + a demanda
("recordar ahora"), con aviso al despacho y recordatorio al cliente con enlace de pago. EMAIL/SMS
quedan como punto de integración para Fase 2. Siguiente ítem de la tanda: provisión de fondos/retainer.

## 2026-06-16 — Claude — Ítem 2 (Retainer) PR-R1: modelo + migración + RLS

Contexto: arranca el Ítem 2 (provisión de fondos / retainer). Desglose acordado con el owner: R1 modelo
→ R2 cobro manual + saldo → R3 aplicar a factura → R5 UI; R4 (Stripe sin factura) diferido. Decisiones
(D-026): cobro a cuenta NO fiscal · saldo en cuenta cacheada + movimientos · manual primero.

Hecho (PR-R1, solo cimientos, sin lógica):

- `packages/domain/src/enums.ts`: enum agnóstico `RetainerMovementType { DEPOSIT, APPLICATION, REFUND,
ADJUSTMENT }` (convención de signo documentada).
- `apps/api/prisma/schema.prisma`: `RetainerAccount` (1 por cliente, `clientId @unique` → 1-1; `balance`
  cacheado; moneda del tenant) y `RetainerEntry` (movimientos con signo; `invoiceId?`/`paymentId?`).
  Relaciones inversas en Tenant/Client/Invoice/Payment. Enum Prisma espejo.
- `apps/api/prisma/migrations/20260616130000_retainer/migration.sql`: tablas + índices + FKs (account/
  tenant/client CASCADE; invoice/payment SET NULL) + **RLS fail-closed** en ambas (patrón D-020).

Pruebas (LOCAL, Postgres real como `legalflow_app`; migración aplicada con `migrate deploy`):

- `apps/api/test/retainer-rls.e2e-spec.ts` 5/5: lectura acotada al tenant, cuenta/movimiento de B
  invisibles, WITH CHECK rechaza INSERT ajeno, fail-closed sin contexto, SISTEMA ve ambos. `prisma
validate` OK; api typecheck + eslint limpios. (Paré/reinicié el API local para regenerar el cliente
  Prisma — lock del DLL en Windows; autorizado.)

Sensibilidad / merge: migración + RLS → **PR-y-espera**. Sin código de negocio (llega en R2/R3).
Siguiente: PR-R2 (cobro de provisión manual + lectura de saldo/movimientos).

## 2026-06-16 — Claude — Ítem 2 (Retainer) PR-R1 ENMENDADO + D-026 reescrita (revisión del owner)

El owner pidió cerrar dos decisiones de esquema en #61 (barato ahora) y reescribir la decisión fiscal
antes de avanzar. **GATE: no arrancar R2 hasta (a) #61 enmendado fusionado y (b) D-026 ratificada por
asesor fiscal.**

Parte A — esquema enmendado en #61 (sigue PR-y-espera):

- **Granularidad POR EXPEDIENTE**: `RetainerAccount` pasa de `clientId @unique` a `matterId @unique`
  (1-1 con `Matter`). El "saldo por cliente" se DERIVA sumando las cuentas de sus asuntos (no tabla
  nueva). Relaciones inversas: quitada `Client.retainerAccount`, añadida `Matter.retainerAccount`.
- **Mono-moneda por tenant explícita**: quitado `currency` de `RetainerEntry` (la moneda es la de la
  cuenta = tenant); documentado; el guard de moneda (rechazar ≠ tenant) se implementa en R2/R3.
- Migración `20260616130000_retainer` **reescrita en sitio** (no fusionada aún): `matterId` + FK a
  `Matter` + `RetainerAccount_matterId_key`; `RetainerEntry` sin `currency`. e2e RLS actualizado
  (siembra con expediente). Local: dropeé quirúrgicamente las tablas viejas del retainer + su registro
  en `_prisma_migrations` (sin `migrate reset`, preservando datos demo) y re-apliqué la enmendada.
- Re-verificado local: `prisma validate` OK, typecheck + eslint limpios, **e2e retainer-rls 5/5**.

Parte B — D-026 reescrita como ADR **PROPUESTA, pendiente de ratificación**: default CONFORME = anticipo
de honorarios devenga IVA al cobro (art. 75.Dos LIVA) → factura inmediata; tratamiento por provisión con
ramas (genérica no delimitada sin devengo, TJUE C-419/02 BUPA; suplido sin IVA, art. 78.Tres.3º); regla
vía `ComplianceProvider` (ES LIVA/Verifactu · RD ITBIS/e-CF). NO se implementa lógica fiscal hasta ratificar.

Parte C — restricciones registradas para R2/R3 (en D-026 y PLAN): invariante `balance == Σ(entries)` con
`SELECT … FOR UPDATE` + guard de saldo negativo + test de reconciliación; APPLICATION postea `PAYMENT` al
ledger (DEPOSIT no → evita doble cómputo); REFUND con IVA → factura rectificativa.

Siguiente: avisar al owner para (1) fusionar #61 enmendado y (2) ratificar D-026. **R2 en pausa.**

## 2026-06-16 — Claude — D-026 RATIFICADA por el owner (ES cerrado, RD marco conservador)

El owner ratificó D-026 (condición (b) del gate). Confirmado:

- **ES (cerrado):** anticipo de honorarios devenga IVA **al cobro** (art. 75.Dos LIVA) → IVA 21% +
  **retención IRPF** si el cliente es retenedor + **factura de anticipo**; la **factura final deduce el
  anticipo** ya facturado (no se grava dos veces). Suplido (art. 78.Tres.3º) = excepción con justificante
  a nombre del cliente, fuera de base.
- **RD (marco + conservador, sin certeza cerrada):** ITBIS 18%; el devengo se ancla a la **emisión del
  e-CF** (art. 338 CT + Decreto 293-11), no al cobro. Default conservador: emitir e-CF con ITBIS al tomar
  el anticipo. Un contador dominicano afinaría.
- **Postura:** default conforme + conservador (ante la duda, repercutir; el error caro es infra-
  repercutir). El owner recomienda (no bloqueante) una revisión única del motor fiscal por fiscalista
  (sobre todo RD + cadena anticipo→final→rectificativa), dada la Declaración Responsable.

Actualizado D-026 → **RATIFICADA** con la mecánica confirmada y la cadena que R2/R3 implementará
(DEPOSIT anticipo → factura de anticipo vía `buildInvoiceRecord` + postea al ledger → factura final que
descuenta → rectificativa en devolución). PLAN/D-026 GATE: queda solo **(a) fusionar #61**.

Estado del gate: (b) ✅ ratificada · (a) ⛔ #61 OPEN (lo fusiona el owner). **R2 sigue en pausa hasta (a).**

## 2026-06-16 — Claude — Ítem 2 (Retainer) PR-R2: motor de saldo + tipos no fiscales + lecturas

Gate despejado (#61 fusionado + D-026 ratificada). El owner pidió SPLIT: R2 = motor + no-fiscales +
lecturas (ANTICIPO bloqueado); R2b = emisión de anticipo (Verifactu-crítica, atómica). Hecho R2:

- Dominio: enum `ProvisionKind { ANTICIPO, SUPLIDO, GENERICO }`. Prisma: enum + columna `kind` nullable
  en `RetainerEntry` (migración `20260616140000_provision_kind`, solo ALTER, sin RLS nueva).
- `apps/api/src/retainer/`: `RetainerService` con el **motor** `postMovement` (bloquea la cuenta con
  `SELECT … FOR UPDATE`, guard de saldo negativo, inserta movimiento + actualiza saldo cacheado en la
  misma tx; invariante `balance == Σ(entries)`; reutilizable por R3); `deposit` (SUPLIDO/GENERICO;
  **ANTICIPO → 400** `retainer.anticipoRequiresInvoice`, nunca saldo sin factura); guard de moneda =
  tenant; lecturas `getMatterAccount` y `getClientAggregate` (saldo por cliente = Σ asuntos, derivado).
  Controller `@Roles(FIRM_ADMIN, LAWYER)` + módulo registrado en `app.module`.
- La **creación de la cuenta** se hace en operaciones autocommit FUERA de la tx del movimiento (evita el
  _first-create race_: el INSERT perdedor bloquea en el índice único, cae en P2002 y re-lee la fila ya
  confirmada). Bug encontrado y corregido por el test de concurrencia.
- Formato de saldo con `Decimal.toFixed(2)` (no `.toString()`, que elimina ceros finales).
- i18n de error: `retainer.*` en es-ES/es-DO.

Pruebas (LOCAL, Postgres real como `legalflow_app`; migración aplicada): e2e **retainer 8/8** (ANTICIPO
→400, SUPLIDO/GENERICO suman, guard moneda, importe no positivo, role-gating CLIENT→403, aislamiento,
**concurrencia 10 depósitos sin perder updates** + invariante a nivel BD) + **retainer-rls 5/5**.
typecheck + eslint limpios.

Sensibilidad / merge: lógica de dinero + migración (columna `kind`) → **PR-y-espera**. Siguiente: PR-R2b
(emisión de factura de anticipo, atómica con serie+ledger+saldo).

## 2026-06-16 — Claude — Ítem 2 (Retainer) PR-R2b: factura de anticipo (atómica)

Pieza Verifactu-crítica. Decisiones fiscales fijadas por el owner: amount = BASE (IVA/ITBIS encima,
IRPF por `withholdingTaxCode`); factura de anticipo nace **PAID** y el retainer acredita el **total**.

Hecho:

- `LedgerService.emitInvoiceInTx(tx, user, params)`: núcleo de emisión fiscal extraído de `createInvoice`
  (serie con `count` DENTRO de la tx + encadenamiento + `buildInvoiceRecord` + factura ISSUED + apunte
  INVOICE). `createInvoice` ahora lo reutiliza (sin duplicar; **ledger e2e 15/15 intacto** = red de
  seguridad del refactor). `nextInvoiceNumber` privado eliminado (la serie se consume en la tx).
- `RetainerService.depositAnticipo` (`POST /retainer/anticipo`): en UNA `tenantTransaction` emite la
  factura vía `emitInvoiceInTx`, la marca PAID (Payment MANUAL + invoice.update + apunte PAYMENT, espejo
  de `reconcile`) y acredita el retainer por el total con `postMovement` (FOR UPDATE), `DEPOSIT(ANTICIPO)`
  ligado a factura+payment. Atómico: un fallo revierte serie+registro+ledger+saldo. taxCode estándar por
  jurisdicción (ES `IVA_STANDARD` / RD `ITBIS_STANDARD`); jurisdicción vía `ComplianceProvider`.
  `RetainerModule` importa `LedgerModule`. Sin migración ni cambio de dominio.

Pruebas (LOCAL): e2e **retainer-anticipo 4/4** (ES IVA21%+IRPF15%→total 1060, factura PAID + recordHash,
saldo 1060, segundo anticipo encadena, **atomicidad: sin NIF → 400 sin factura/saldo huérfanos**,
role-gating CLIENT→403) + **ledger 15/15** (sin regresión) + retainer 8/8 + retainer-rls 5/5. typecheck +
eslint limpios.

Sensibilidad / merge: emisión fiscal + dinero → **PR-y-espera**. No toca migración. Siguiente: PR-R3
(aplicar provisión a factura final, deduciendo el anticipo) + R5 (UI). R4 (Stripe) diferido.

## 2026-06-16 — Claude — Ítem 2 (Retainer) PR-R3a: aplicar saldo + ADR D-027 (deducción/rectificativa)

Al diseñar R3 surgió un riesgo de **doble IVA**: aplicar saldo de un ANTICIPO ya facturado a la factura
final, sin deducir el anticipo, cobra el IVA dos veces. El owner decidió SPLIT: R3a (mecánica) ahora;
R3b (deducción) + R3c (rectificativa) = emisión fiscal → ADR D-027 a ratificar antes de codificar.

Hecho (R3a):

- Dominio: `PaymentMethod.RETAINER` (Payment.method es String → sin migración).
- `RetainerService.applyToInvoice` (`POST /retainer/apply`): en UNA tx crea `Payment` RETAINER + actualiza
  factura (amountPaid, PARTIAL/PAID) + apunte PAYMENT (espejo de `reconcile`) + `RetainerEntry
APPLICATION(−)` con `postMovement` (FOR UPDATE). Valida factura del mismo expediente, cobrable, importe
  ≤ pendiente y ≤ saldo. **Bloqueo por construcción**: si el expediente tiene algún DEPOSIT ANTICIPO →
  `retainer.anticipoApplyBlocked` (400) hasta R3b. i18n es-ES/es-DO.
- D-027 redactada como **PROPUESTA pendiente de ratificación**: problema del doble IVA, opciones de
  deducción (factura por remanente vs línea negativa), rectificativa de REFUND, todo vía
  `ComplianceProvider`. R3b/R3c **no se implementan** hasta ratificar.

Pruebas (LOCAL): e2e **retainer-apply 6/6** (parcial→PAID, saldo insuficiente, **bloqueo ANTICIPO**,
factura ajena, role-gating, invariante `balance == Σ(entries)`) + ledger 15/15 (sin regresión) +
retainer 8/8 + retainer-anticipo 4/4 + retainer-rls 5/5. typecheck + eslint limpios.

Sensibilidad / merge: dinero (cobro contra saldo) → **PR-y-espera**. No toca migración. Siguiente: tras
fusionar R3a, **R5 (UI)** de lo ya hecho; R3b/R3c esperan la ratificación de D-027.

### 2026-06-16 - Claude Opus 4.8 - PR-R3b: deducción del anticipo en la factura final

Objetivo: D-027 (b) deducción del anticipo en la factura final (NO rectificativa). Tras confirmar estado
(R3a + D-027 en main) se acordó **dividir** el R3b monolítico del PLAN en **R3b (deducción, esta PR, sin
migración)** y **R3c (rectificativa, con migración)**; rectificativa = **por sustitución** primero.

Hecho (R3b):

- `packages/compliance`: `InvoiceInput.deductedAdvances?` + tipo `DeductedAdvance`; `unitPrice` admite
  negativo (líneas de deducción). ES: bloque `anticiposDeducidos` en el payload Verifactu. RD:
  `<AnticiposDeducidos>` en el e-CF final. `computeInvoiceTotals` intacto (ya cuadra con signo).
- `apps/api`: `LedgerService.emitInvoiceInTx` reenvía `deductedAdvances` a `buildInvoiceRecord`. Nuevo
  `RetainerService.invoiceFinalWithDeduction` (`POST /retainer/final-invoice`, `FinalInvoiceDto`): emite
  la final = líneas de servicio (+) + 1 línea negativa por anticipo (−) + `deductedAdvances`, encadenada
  (ISSUED), y **realiza** el anticipo con `APPLICATION(−)` sin Payment (drawdown). Guards: sin anticipo
  (`retainer.noAnticipoToDeduct`), doble cierre (`retainer.anticipoAlreadyDeducted`, detectado por
  APPLICATION sin paymentId), deducción > servicio (`retainer.deductionExceedsService` → R3c).
- **Guard `anticipoApplyBlocked` RE-ENFOCADO, no eliminado** (D6 en D-027): aplicar anticipo como cobro
  duplicaría IVA / infrapagaría la final; el `/apply` genérico sigue rechazándolo. Marcado para el owner.

Pruebas (LOCAL): e2e **retainer-deduction 6/6** (sin doble IVA, encadenado, RD e-CF, atomicidad/guards,
role) + compliance **53/53** + red de no-regresión: apply 6/6, anticipo 4/4, ledger 15/15, retainer 8/8,
retainer-rls 5/5. typecheck + eslint + prettier limpios.

Sensibilidad / merge: Verifactu/dinero → **PR-y-espera** (no toca migración). Siguiente: **R3c**
(rectificativa del refund, con migración `Invoice`) o **R5 (UI)** del retainer. Pendiente: OK del owner
sobre el re-enfoque del guard (D6) y, no bloqueante, revisión de fiscalista del motor completo.

### 2026-06-16 - Claude Opus 4.8 - PR-R3c: rectificativa del refund (apilada sobre R3b)

Objetivo: D-027 (c) devolución de un anticipo facturado = factura rectificativa (NO restar saldo).
**Apilada sobre R3b** (mismos ficheros: compliance, retainer, docs) para evitar conflictos; **retargetear
a main al fusionar R3b**. R3b CI: **todo verde** (#66). Rectificativa = **por sustitución** (acordado).

Hecho (R3c):

- Dominio + Prisma: enums `InvoiceDocumentType` (NORMAL|RECTIFICATIVA) + `RectificationMode`
  (SUSTITUCION|DIFERENCIAS). `Invoice` gana `documentType`, `rectifiesInvoiceId` (self-FK),
  `rectificationReason`, `rectificationMode`, `withholdingTaxCode` (reversar IRPF exacto). Migración
  pendiente (necesita parar el API local por EPERM de prisma generate).
- `packages/compliance`: `InvoiceInput.documentType` + `rectifies { invoiceNumber, issueDate?, reason,
mode }`. ES Verifactu → bloque `rectificativa` (R1 + tipoRectificativa S/I + facturasRectificadas +
  causa). RD → e-CF `<TipoeCF>34</TipoeCF>` (nota de crédito) + `<InformacionReferencia><NCFModificado>`.
  Normal → TipoeCF 31 sin referencia. Unit tests compliance 57/57 (+4).
- `apps/api`: `emitInvoiceInTx` acepta `rectification` (FK + datos fiscales) y persiste los campos +
  `withholdingTaxCode`. Nuevo `RetainerService.refundAnticipo` (`POST /retainer/refund`,
  `RefundAnticipoDto`): rectificativa por sustitución (espejo en negativo del anticipo, misma retención)
  - `RetainerEntry REFUND(−)`, atómico. Guards: notAnAnticipoInvoice / anticipoAlreadyRefunded /
    anticipoAlreadyDeducted. **Interacción R3b:** `invoiceFinalWithDeduction` excluye anticipos devueltos.
- e2e retainer-refund.e2e-spec.ts (7): rectificativa R1/S encadenada + inmutabilidad, reversa con IRPF,
  doble refund, no-anticipo, interacción refund→deducción, RD nota de crédito tipo 34, role-gating.

Pruebas: compliance **57/57** OK (local). e2e del API y typecheck **pendientes de la migración** (API
local corriendo → prisma generate da EPERM; requiere autorización del owner para parar/reiniciar).

Sensibilidad / merge: migración + Verifactu/dinero → **PR-y-espera**. Bloqueante actual: autorización
para parar el API local (PID 45832) y aplicar la migración + generate + e2e.

### 2026-06-16 - Claude Opus 4.8 - Merge R3b+R3c, PR-R5 (UI) y PR-R5b (portal)

- **Merges (autorizados por el owner):** R3b (#66) y R3c (#67) a main, CI verde real. Orden de PR apilada:
  retarget R3c→main, merge R3b, rebase R3c sobre el nuevo main (sin conflictos), auto-merge en verde.
- **PR-R5 (#68, UI, auto-merge en verde):** tab «Provisión» en la ficha de expediente (saldo +
  movimientos; cobrar provisión SUPLIDO/GENERICO, cobrar anticipo→factura, aplicar a factura) + saldo
  agregado en la ficha de cliente. Hooks + tipos + i18n es-ES/es-DO. Sin tocar backend. typecheck +
  eslint + vitest 20/20.
- **PR-R5b (portal, PR-y-espera):** `GET /portal/matters/:id/retainer` (read-only, `assertMatterAccess`
  - reutiliza `RetainerService.getMatterAccount`; PortalModule importa RetainerModule) + tab «Provisión»
    solo lectura en el portal del cliente. e2e portal-retainer 3/3 (saldo propio, aislamiento cross-cliente
    403, role-gating staff 403) + portal regresión verde. typecheck API+web + eslint limpios. Sin migración.

Operativo: el API local que bloqueaba prisma generate era `node dist/main.js` (PID 48120), no el web
(`next start`, PID 45832). Parado/reiniciado para R3c; ahora en :4000 (`/api/health` 200).

Siguiente sugerido: R5c (UI de cierre con deducción + devolución) o el ítem recurrente/planes de pago
(el más compliance-pesado; proponer opciones de cobro recurrente antes de implementar).

### 2026-06-16 - Claude Opus 4.8 - Fixes UX (apply anticipo) + QR Verifactu

- **fix UX apply anticipo (#70, merged):** aplicar saldo de anticipo a una factura lo bloquea el backend
  (doble IVA); la UI mostraba error genérico. Ahora el diálogo «aplicar» avisa de forma proactiva y se
  deshabilita si el expediente tiene anticipo, y los diálogos muestran el mensaje real del backend
  (`ApiError.message`). Reproducido y verificado en navegador (preview).
- **fix QR Verifactu (fecha):** el parámetro `fecha` del cotejo AEAT iba en ISO (aaaa-mm-dd); la AEAT lo
  exige en **dd-mm-aaaa**. Reordenado en `spain.provider` (no afecta a la huella/encadenamiento, que usa
  `issueDate`; solo cambia la URL del QR). Test añadido. compliance 57/57.

### 2026-06-16 - Claude Opus 4.8 - PR-R5c: UI de cierre fiscal (deducción + devolución)

UI de las acciones de cierre del anticipo en el tab «Provisión» (apps/web; sin backend nuevo, reusa los
endpoints R3b/R3c). Panel «Cierre del anticipo» visible solo si el expediente tiene anticipo facturado:

- **Factura final (deducir anticipo)** → `useRetainerFinalInvoice` / `POST /retainer/final-invoice`:
  editor de líneas de servicio + IRPF opcional; al éxito muestra nº de factura, neto y nº de anticipos
  deducidos, con enlace.
- **Devolver anticipo** → `useRetainerRefund` / `POST /retainer/refund`: selector del anticipo (nº de la
  factura) + causa → rectificativa; al éxito muestra nº + enlace.
- Mensajes de error reales del backend (`ApiError.message`). i18n es-ES/es-DO.

Verificado **end-to-end en navegador** (preview + API local): panel con ambos botones; factura final
FAC-2026-0017 neto 1.815 € (servicio 2500 − anticipo 1000) «1 anticipo deducido»; refund → rectificativa
FAC-2026-0018, saldo del expediente → 0 (REFUND −968 + DEPOSIT 968). typecheck + eslint + vitest 3/3 +
JSON i18n válido. Sin errores de consola.

Nota: esta entrada se solapa en el tiempo con los fixes UX-apply (#70) y QR-Verifactu (#71).
Siguiente: ítem recurrente / planes de pago (proponer opciones antes de implementar).
