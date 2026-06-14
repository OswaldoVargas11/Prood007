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
