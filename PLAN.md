# LegalFlow — Plan de construcción (MVP Fase 1)

> SaaS de gestión legal multi-jurisdicción (España `es` + República Dominicana `do`).
> Principio rector: **núcleo agnóstico de jurisdicción + adaptadores de cumplimiento enchufables**.

## Leyenda de estado

- `[ ]` pendiente · `[~]` en progreso · `[x]` completado · `[!]` bloqueado

## Dependencias de alto nivel

```
E0 Andamiaje ──► E1 Auth/RBAC ──► E2 Clientes/Expedientes ──► E3 Documentos
                                            │                        │
                                            ├──► E4 Tareas/Plazos     │
                                            └──► E5 Ledger/Facturación┘
E6 Portal cliente  ◄── E2,E3,E5
E7 Auditoría/Notif ◄── transversal (engancha en cada módulo)
E8 i18n/Multimoneda◄── transversal (desde E0)
E9 Cumplimiento    ◄── paquete base (se consume desde E2 y E5)
```

---

## E0 — Andamiaje del monorepo `[~]`

- [x] `git init` aislado en `Prod007` (no usar el repo del home).
- [x] `PLAN.md` y `DECISIONS.md`.
- [x] `pnpm-workspace.yaml` + `package.json` raíz + `.npmrc`.
- [x] `.gitignore`, `.editorconfig`, `.env.example`.
- [x] `packages/config`: tsconfig base, ESLint, Prettier compartidos.
- [x] `packages/domain`: enums y tipos compartidos del dominio.
- [x] `packages/compliance`: interfaz + providers (ver E9).
- [x] `apps/api`: esqueleto NestJS + `nest-cli.json` + `tsconfig`.
- [x] `apps/web`: esqueleto Next.js (App Router) + Tailwind + i18n.
- [x] `apps/api/prisma/schema.prisma`: modelo de dominio completo.
- [x] `docker-compose.yml`: Postgres + MinIO + Redis.
- [x] `pnpm install` y verificación de build (domain/compliance/api/web compilan).
- [x] `prisma migrate dev` (migración inicial `20260613174416_init` aplicada).
- [x] Smoke test: API arranca, conecta a Postgres y `/api/health` responde 200.
- [x] Husky + lint-staged (prettier) + commitlint (Conventional Commits) activos.
- [x] CI (GitHub Actions): install + build + lint + unit + e2e (Postgres) — **verde**.

## E1 — Auth multi-tenant + RBAC `[~]`

- [x] Modelo `Tenant`, `User`, `Role`, `Permission`, `RefreshToken` (en schema/migración).
- [x] `AuthModule`: registro de tenant + siembra de RBAC + primer usuario FIRM_ADMIN.
- [x] Login con JWT **access** (15 min) + **refresh** (7 d, rotación + revocación + reuse-detection).
- [x] `JwtStrategy` (access) + rotación de refresh en `TokensService` + guards globales.
- [x] RBAC: roles `CLIENT` / `LAWYER` / `FIRM_ADMIN`; decorador `@Roles` + `RolesGuard`.
- [x] Hash de contraseñas con **argon2**; política mínima (≥10 chars en DTO).
- [x] `tenantId` + jurisdicción propagados en el token y en `RequestUser`.
- [x] Tests e2e (8): registro, validación, login, 401, /me con rol, rotación+reuse, health público.
- [x] Aislamiento por tenant en queries de negocio (consolidado en E2: todo filtra por `tenantId`).
      Pendiente futuro: activar Postgres RLS como defensa en profundidad (documentado en DECISIONS).

## E2 — Clientes y Expedientes `[x]`

- [x] CRUD `Client` con `validateTaxId` del provider (NIF/CIF · RNC/Cédula) + normalización.
- [x] CRUD `Matter` (tipo, cliente, abogado responsable, estado) + referencia autogenerada.
- [x] Máquina de estados del expediente (`matter-status.ts`, transiciones validadas).
- [x] Asignación de abogado (validada en tenant + rol); permisos por rol (`@Roles`).
- [x] **Aislamiento por tenant** en todas las queries (filtro `tenantId` + `updateMany/deleteMany`).
- [x] `AuditService` inmutable enganchado en create/update/status.
- [x] Tests e2e (9): validación fiscal, transiciones válidas/ inválidas, aislamiento cross-tenant.

## E3 — Documentos `[x]`

- [x] `StorageProvider` (interfaz en domain) + impl. S3/MinIO (`minio`) + impl. disco local (dev),
      seleccionada por `STORAGE_DRIVER`. Local con protección anti path-traversal.
- [x] Subida de `Document` + `DocumentVersion` (hash SHA-256, mime, tamaño) + versionado incremental.
- [x] Flujo de revisión (APPROVED/REJECTED/CHANGES_REQUESTED/IN_REVIEW) + comentarios (`DocumentReview`).
- [x] Notificaciones persistidas al autor en cada revisión (`NotificationsService`).
- [x] Descarga autenticada por streaming; límite de subida 25 MB.
- [x] Tests e2e (7): subida, descarga, versionado, revisión, notificación, aislamiento, 400 PENDING.

## E4 — Tareas y plazos procesales `[x]`

- [x] CRUD `Task` con fecha límite, estado y asignación (+ notificación al asignado).
- [x] `POST /tasks/from-deadline`: crea la tarea con `dueDate` calculada por `getProceduralDeadlines`
      (isProcedural + deadlineType persistidos).
- [x] Cálculo **real** ES (días hábiles + festivos nacionales, Viernes Santo incl.); RD solo findes.
- [x] Tests: unit de plazos (Pascua/festivos/días hábiles) + e2e from-deadline (Navidad).

## E5 — Ledger + Facturación jurídica `[x]`

- [x] `LedgerEntry`: provisiones, suplidos, honorarios + `TimeEntry` (horas con tarifa → TIME_FEE).
- [x] Ledger transparente con saldo calculado (convención de signo documentada) por expediente.
- [x] `Invoice` + `InvoiceLine` con campos fiscales y `complianceRecord` (JSON opaco) del provider.
- [x] `buildInvoiceRecord` real: **Verifactu** (huella SHA-256 + QR + encadenamiento) en ES;
      **e-CF** (XML DGII con totales) en RD.
- [x] Cálculo fiscal real (`tax-math.ts`): IVA 21% + retención IRPF (ES); ITBIS 18% (RD).
- [x] Envío a AEAT/DGII **stubbeado** (`submission.status = STUBBED`).
- [x] Cobro de factura (PAYMENT + estado PAID).
- [x] Tests: unit fiscal/encadenamiento (compliance 24) + e2e ledger/factura/cobro/aislamiento (7).

## E6 — Portal del cliente `[x]`

- [x] `PortalModule` (rol `CLIENT`, solo lectura): sus expedientes, documentos, tareas, ledger y facturas.
- [x] Aprovisionamiento de usuario de portal (`POST /clients/:id/portal-user`) vinculado a la ficha.
- [x] Acceso acotado a los expedientes propios (`assertMatterAccess` + `Client.userId`).
- [x] Notificaciones realtime vía WebSocket (Socket.IO) al usuario.
- [x] Tests e2e: visibilidad propia, 403 a lo ajeno, 403 de rol cruzado.

## E7 — Auditoría y notificaciones (transversal) `[x]`

- [x] `AuditLog` inmutable (append-only) en acciones sensibles de todos los módulos.
- [x] `NotificationsModule` + entrega realtime (Socket.IO, salas `user:`/`tenant:`/`matter:`).
- [x] `Message`: chat por expediente con control de acceso (staff + cliente del expediente) + emit realtime.
- [x] Tests e2e: chat, aislamiento y recepción de notificación en tiempo real.

## E8 — i18n y multimoneda (transversal) `[x]`

- [x] Locales `es-ES` y `es-DO` operativos en web (next-intl, sin strings hardcodeados en UI).
- [x] Moneda por tenant (EUR / DOP); ledger y facturas usan `tenant.currency`.
- [x] Errores de cumplimiento con `messageKey` para traducir en UI.
- [x] Catálogo i18n exhaustivo de mensajes de API: todo error sale por `messageKey` traducible con
      catálogo COMPLETO es-ES/es-DO + gate de completitud. **Fusionado a main (PR #32).**

## E9 — Capa de cumplimiento (paquete base) `[x]`

- [x] Interfaz `ComplianceProvider` + tipos.
- [x] `SpainComplianceProvider` (esqueleto: IVA/IRPF, Verifactu, LexNET, SII, plazos).
- [x] `DominicanComplianceProvider` (esqueleto: ITBIS, e-CF/DGII, RNC, 606/607).
- [x] `ComplianceProviderFactory` (selección por `tenant.jurisdiction`).
- [x] Implementación real `validateTaxId` (NIF/CIF/NIE, RNC, Cédula con dígitos de control).
- [x] Implementación real `getTaxRates` por jurisdicción (IVA/IRPF ES, ITBIS RD).
- [x] `buildInvoiceRecord` estructuralmente correcto (Verifactu / e-CF XML).
- [x] `getProceduralDeadlines` real ES (fines de semana + festivos nacionales).
- [x] **Tests obligatorios** de cobertura en toda la capa.

## Frontend — Integración del prototipo Lexora (slices verticales) `[~]`

> Convertir el prototipo de diseño en el frontend real de `apps/web` (Next.js 14 + Tailwind 3 +
> shadcn/ui + next-intl), cableado a la API real, por **slices verticales** (cada uno: pantalla +
> componentes reales + endpoints + estados cargando/vacío/error + tests + cero mock). Ver D-014.

- **F0 — Fundación + login E2E** `[x]` (PARADO para revisión)
  - [x] Tokens del diseño en `globals.css` + `tailwind.config` extendido (handoff §03).
  - [x] Primitivos shadcn/ui (button, input, label, card, badge, skeleton, sheet, command, dialog,
        dropdown-menu, avatar) + `lib/utils` (cn).
  - [x] Providers: TanStack Query + `next-themes` (tema claro/oscuro) + NextIntlClientProvider.
  - [x] **Auth (BFF httpOnly):** Route Handlers `app/api/auth/{login,refresh,logout}`; access en
        memoria; `lib/api` con Bearer + refresh en 401; `lib/auth` (sesión).
  - [x] **Middleware** de rutas (no autenticado → login; con sesión → fuera de login) + i18n.
  - [x] App shell: sidebar flotante, command bar ⌘K (cmdk), panel IA (Sheet) como patrón, toggle tema,
        menú de usuario/tenant.
  - [x] **Login real E2E** (verificado contra la API real): login → cookie httpOnly/access → `/me` →
        dashboard con datos reales; refresh con rotación; logout; middleware redirige.
  - [x] Tests: cliente de API (token/refresh, 4 verdes en Vitest).
  - [x] **framer-motion** con los tokens del handoff (ease [0.22,0.8,0.2,1], entrada 220 ms, respeta
        `prefers-reduced-motion`) + **webfont Geist** (next/font, self-hosted). Fusionado (PR #34).
  - [x] **Nav móvil (Drawer)**: la sidebar flotante colapsa en un Sheet lateral por debajo de `lg`,
        con botón hamburguesa. Fusionado (PR #33).
- **F1 — Dashboard + Expedientes (lista + detalle hero)** `[~]`
  - [x] Dashboard: KPIs reales (expedientes, clientes) + expedientes recientes + cumplimiento por
        jurisdicción; estados cargando/error.
  - [x] Expedientes: lista real (`GET /matters`, paginación, filtro por estado, badges de la máquina
        de estados, cargando/vacío/error).
  - [x] Ficha de expediente (hero): overview con datos reales + **control de transición de estado**
        (solo transiciones válidas → `PATCH /matters/:id/status`) + tabs (Resumen activo).
  - [x] Hooks TanStack Query (`useMatters`/`useMatter`/`useChangeMatterStatus`) + tests
        (matter-status, scope). Verificado E2E contra la API real.
  - Pendiente (se completa con sus slices): tabs Documentos/Tareas/Costes/Chat/Actividad (F2–F5),
    alta de expediente, búsqueda semántica (la API aún no expone búsqueda de texto), cronómetro.
- **F2 — Documentos (subida/versión/revisión)** `[x]` (en el tab Documentos de la ficha)
  - [x] Lista por expediente (`GET /documents/by-matter/:id`) con versiones y badges de revisión.
  - [x] Subida (multipart) y nueva versión; descarga autenticada (blob). Cliente API ampliado
        (`api.upload`/`api.download` con refresh).
  - [x] Flujo de revisión (Aprobar/Solicitar cambios/Rechazar/En revisión + comentario) →
        `POST /documents/versions/:id/review`. Estados cargando/vacío/error.
  - Pendiente: pantalla global de Documentos (la API solo expone por expediente) y comparación
    de versiones lado a lado.
- **F3 — Tareas y plazos procesales (+ crear desde plazo)** `[x]`
  - [x] Página global de Tareas + tab Tareas en la ficha (mismo `TasksPanel`, filtrado por expediente).
  - [x] Lista real (`GET /tasks`, filtro por estado), badges, marcador de plazo procesal, resaltado de
        vencidas; cambio de estado (`PATCH /tasks/:id`).
  - [x] Crear tarea y **crear desde plazo** (`POST /tasks/from-deadline`): la jurisdicción calcula la
        fecha (días hábiles + festivos); se muestra el vencimiento y los festivos aplicados.
  - [x] Nav "Tareas" habilitado; i18n tasks.\*. Verificado E2E (ES: 23-dic+5 → 31-dic, festivo 25-dic).
- **F4 — Facturación (ledger, factura, detalle con bloque de cumplimiento)** `[x]` (tab Costes + /invoices/[id])
  - [x] Tab Costes: ledger transparente con **saldo** + tabla de apuntes (signo por tipo), añadir
        apunte, registrar tiempo, y **emitir factura** (líneas + retención).
  - [x] Detalle de factura `/invoices/[id]`: cabecera fiscal, líneas, totales (base/IVA o ITBIS/
        retención/total), estado, **bloque de cumplimiento real** (formato Verifactu/e-CF + huella +
        encadenamiento + payload), y **marcar como pagada**.
  - [x] Códigos fiscales por jurisdicción (IVA/IRPF vs ITBIS). i18n billing.\*. Verificado E2E
        (ES Verifactu: base 1000, IVA 210, IRPF 150, total 1060; cobro → PAID).
  - [x] **QR Verifactu renderizado** en el detalle (qrcode.react; contenido = URL de cotejo AEAT del
        complianceRecord; jurisdicción-aware: en RD/e-CF no aplica). Fusionado (PR #31).
  - [x] **Preview fiscal en vivo** antes de emitir: endpoint read-only `POST /ledger/invoices/preview`
        que reutiliza la MISMA matemática fiscal que la emisión (`buildInvoiceRecord` delega en
        `previewInvoice`) + UI en vivo con indicador Verifactu/e-CF. **Fusionado a main (PR #30).**
  - Pendiente: pantalla global de facturación (sin endpoint de listado).
- **F5 — Tiempo real (notificaciones + chat por expediente, Socket.IO)** `[x]`
  - [x] Socket.IO cliente (autenticado con el access token; `auth` callback reevaluado en cada
        reconexión). Singleton `lib/socket`.
  - [x] Chat en el tab Chat de la ficha: historial + envío + recepción en vivo (`matter:subscribe` +
        `message:new` → refresco); burbujas propias/ajenas; cargando/vacío/error.
  - [x] Campana de notificaciones en la topbar: contador de no leídas, lista, marcar leída, y refresco
        en vivo (`notification:new`). i18n chat._/notifications._.
  - [x] Verificado E2E: enviar/listar mensajes; flujo de notificación (asignar tarea al CLIENT → la
        recibe → marcar leída). El live socket está probado en el backend (portal-realtime e2e).
- **F6 — Portal del cliente (rol CLIENT, solo lectura + chat)** `[x]`
  - [x] Shell de portal propio (sin sidebar del despacho) + guard de sesión. Llegada por el role gate.
  - [x] Home: mis expedientes + mis facturas (`/portal/matters`, `/portal/invoices`).
  - [x] Ficha read-only con tabs Documentos/Costes/Tareas/Chat (`/portal/matters/:id/*`); el chat es
        interactivo (mismo endpoint, el cliente del expediente puede escribir).
  - [x] i18n portal.\*. Verificado E2E como CLIENT (perfil, 1 expediente, docs, ledger 1880, 2 tareas,
        1 factura) + aislamiento (CLIENT → endpoint de staff = 403).
- **Sidebar agrupado fiel a la plantilla (4 grupos) + vistas globales** `[x]`
  - [x] Sidebar reagrupado igual que la plantilla (Lexora.dc.html 112–192): **Espacio de trabajo**
        (Panel/Expedientes/Clientes/Tareas/Documentos) · **Finanzas** (Facturación/Facturas) ·
        **Comunicación** (Mensajes) · **Despacho** (Agenda/Aprobaciones/Auditoría/Ajustes). Agenda
        reubicada en Despacho. `NAV_GROUPS` en `lib/nav`; cabeceras de grupo en el sidebar.
  - [x] **Gating por rol**: Aprobaciones/Auditoría/Ajustes (`adminOnly`) solo visibles para FIRM_ADMIN;
        además deshabilitadas ("Pronto") hasta su backend (Tanda B).
  - [x] **Facturas** (`/invoices`): lista global de facturas (agrega `invoiceId` de apuntes INVOICE +
        `GET /ledger/invoices/:id`). **Mensajes** (`/messages`): bandeja global (último mensaje por
        expediente). Ambas en cliente, sin backend nuevo. Deep-link `?tab=` en la ficha de expediente.
- **Tanda A — pantallas del prototipo sobre endpoints existentes (solo frontend)** `[x]` COMPLETA
  - [x] **A.1 Onboarding** (alta de despacho multi-paso, 5 pasos: nombre → jurisdicción → moneda →
        ID fiscal → cuenta admin) sobre `POST /api/auth/register-tenant`. BFF `register-tenant` (cookie
        httpOnly + scope), `register()` en el contexto de auth, gate público de `/onboarding` en el
        middleware, enlace desde el login. i18n `onboarding.*`. Auto-login → `/dashboard`.
  - [x] **A.2 Centro de notificaciones** (página `/notifications`, agrupada por fecha —Hoy/Ayer/Esta
        semana/Anterior—, badge "en directo" por socket, icono por tipo, marcar una/todas como leídas).
        Sobre `GET /notifications` + `PATCH /notifications/:id/read`. "Marcar todas" en paralelo
        cliente-side (sin endpoint nuevo). Enlace "Ver todas" desde la campana.
  - [x] **A.3 Agenda/Calendario de plazos** (página `/calendar`): rejilla mensual lunes-first
        (calendario propio, sin dep nueva) con chips de plazo por día coloreados por urgencia + rail
        "carga de plazos" próximos. Deriva de `GET /tasks` (con `dueDate`, sin cancelar) + `GET /matters`
        para la referencia. Click → expediente. Nav `calendar` habilitado. i18n `calendar.*`.
  - [x] **A.4 Documentos (vista completa) + comparar versiones**: split-view por expediente
        (`/matters/:id/documents`: dropzone + lista agrupada por documento con versiones + rail de vista
        previa) y pantalla de comparación/revisión (`/matters/:id/documents/:docId`: selector de
        versiones lado a lado, panel de revisión aprobar/cambios/rechazar + cronología). Sobre
        `GET /documents/by-matter/:id`, `GET /documents/:id`, `POST /documents/versions/:id/review`. El
        diff de texto del prototipo se sustituye por metadatos+preview+descarga (el contenido es binario;
        sin mock). Enlace desde el tab Documentos.
  - [x] **A.5 Ficha de expediente acercada al prototipo**: pestaña Resumen reconvertida en 2 columnas
        (resumen a la izquierda + rail a la derecha). Rail (`components/lexora/matter-rail`): tarjeta de
        **plazos procesales** (de `GET /tasks?matterId`), tarjeta de **saldo** (de `GET /ledger/matter/:id`
        con facturado/movimientos + "ver ledger →" cambia a la pestaña Costes) y **cronómetro** en vivo
        (start/stop → ficha tiempo a `POST /ledger/time` con concepto+tarifa). Tabs ahora controladas.
- **Tanda B — grupo «Despacho» (backend NUEVO + frontend)** `[x]`
  - [x] **Licencia de plazas**: Tenant.{plan,maxAdmins,maxLawyers}. Gestión de usuarios staff (módulo
        Users, FIRM_ADMIN): alta de letrado/admin con enforcement de licencia, activar/desactivar,
        cambiar rol, anti-bloqueo del último admin, revoca sesiones al desactivar.
  - [x] **Ajustes** (`/settings`): datos del despacho + licencia/asientos + gestión de usuarios.
  - [x] **Auditoría** (`/audit`): listado paginado del AuditLog con nombre de actor.
  - [x] **Aprobación de costes** (`/approvals`): letrado propone (en la ficha) → admin aprueba/rechaza;
        el saldo solo cuenta apuntes APPROVED; el portal del cliente nunca ve propuestas.
  - [x] **Alta desde la UI**: cliente (con validación fiscal real), expediente (selector de cliente),
        y **acceso al portal** del cliente (crea su usuario CLIENT). Cierra el bucle cliente↔despacho.
  - [x] Verificado de punta a punta (40/40 flujos admin/letrado/cliente) + e2e 74/74.
- **F7 — (sustituido por Tanda B, arriba)** `[x]`

Reglas: cero datos mock al cerrar un slice · nada de país hardcodeado (todo fiscal/idioma sale de la
jurisdicción del tenant) · estados cargando/vacío/error en cada vista · dark+light · AA · TanStack
Query para estado de servidor · `NEXT_PUBLIC_API_URL` por entorno.

## FASE 1 — Cobro y rentabilidad `[~]` (ver D-024)

> Objetivo: que el dinero entre y entre rápido. Extiende el módulo ledger/facturas. Decisiones del
> usuario (2026-06-15): `PaymentProvider` enchufable por jurisdicción · **Stripe Connect** en ES +
> **RD stub** · rebanada fina primero (PR-1→PR-4) · dunning in-app/portal ahora (email/SMS en Fase 2).

- [~] **PR-1 — Estados ricos de factura + vencimiento** (PR-y-espera, migración):
  - [x] `InvoiceStatus += PARTIAL, OVERDUE`; `Invoice.{dueDate,paidAt,amountPaid}` + índices.
        Migración `20260615192441_invoice_states_due_date`.
  - [x] `dueDate` por defecto (issueDate + 30 d); cobro fija `paidAt`/`amountPaid`.
  - [x] `GET /ledger/invoices` (listado real, filtros `status`/`overdue`); `overdue` derivado en lectura.
  - [x] Web: lista global con filtros (incl. **Vencidas**) + columna de vencimiento; i18n es-ES/es-DO.
  - [x] e2e ledger 15/15; typecheck/lint limpios. **Pendiente: verde en CI + OK del owner para fusionar.**
- [ ] **PR-2 — Captura de tiempo sin fricción** (auto-mergeable): entrada rápida global, "tiempo sin
      facturar" (`TimeEntry.billed=false`), repaso del día.
- [ ] **PR-3 — `PaymentProvider` + modelo `Payment`** (PR-y-espera): interfaz por jurisdicción, entidad
      `Payment` (RLS), refactor de `payInvoice` con soporte de cobro parcial. Sin red todavía.
- [ ] **PR-4 — Stripe Connect (ES) + webhook** (PR-y-espera): enlace de pago + Checkout + webhook
      idempotente que concilia `Payment`↔`Invoice`. RD = stub.
- [ ] Cola de Fase 1: provisión de fondos/retainer · dunning (in-app) · recurrente/planes de pago ·
      "tiempo sin facturar" como sugerencia. **PDF con QR ya existe** (no rehacer).

## Diferido (stubs detrás de interfaz — NO construir aún)

- Envío real AEAT/DGII, LexNET en vivo, firma electrónica (Signaturit/DocuSign), SMS.
- `AiAssistantProvider` (solo contrato): redacción/resumen/revisión con citación y anti-alucinación.
- CRM/captación, dashboards avanzados, app móvil.

## CI/CD — Pipeline del monorepo `[~]` (ver DECISIONS D-016/D-017/D-018)

> Tests como pieza central. CI completo ahora; CD hasta staging cableado aparte; producción
> desconectada (entorno protegido con aprobación manual) hasta tener hosting.

- **CI — workflow de Pull Request** `[~]`
  - [x] **Paso 0:** inspección de `ci.yml`, scripts, tests, docker-compose y RLS registrada (D-016).
  - [x] **Estrategia de pruebas + 4 gates** definidos (RLS, fiscal ≥90%, 403 de rol, cobertura crítica).
  - [x] Job 1 **setup** — install con caché (composite action) + build de paquetes compartidos.
  - [x] Job 2 **lint + typecheck** — `pnpm -r lint` + `pnpm -r typecheck` (scripts `typecheck` nuevos).
  - [x] Job 3 **unit + coverage** — compliance ≥90% (GATE), web (cliente API+auth) con umbrales; artefacto.
  - [x] Job 4 **api-integration** — Postgres service, migraciones con `DIRECT_DATABASE_URL`, e2e como
        `legalflow_app` (RLS real) + cobertura auth (GATE).
  - [x] Job 5 **web-e2e** — Postgres + API:4000 + web:3000 + Playwright smoke (login BFF + 403 de rol).
  - [x] Job 6 **security** — `pnpm audit --prod` (bloquea, allowlist D-017), licencias, gitleaks, CodeQL.
  - [x] Job 7 **migration-check** — drift `prisma migrate diff` (replay en BD shadow ↔ schema).
  - [x] Job 8 **build** — `pnpm -r build` (api + web compilan de verdad).
  - [x] `concurrency` (cancela runs obsoletos) + gate agregado `ci-ok`.
  - [ ] **Verde en un PR real** (en curso) → parar y avisar antes de tocar CD.
- **Gobernanza** `[~]`
  - [x] `CODEOWNERS` (migraciones, RLS, auth, compliance, cliente API/auth web, `.github/`).
  - [x] `dependabot.yml` (npm/pnpm + github-actions, agrupado).
  - [x] **Branch protection** en `main` (vía API): check requerido `CI OK` + strict (rama al día),
        review de CODEOWNERS en rutas sensibles (`require_code_owner_reviews`, count 0), sin force-push,
        sin deletion, resolución de conversaciones, `enforce_admins: false` (override de admin para que
        el owner fusione los PR sensibles tras revisarlos). Pendiente: decidir el catch-all de CODEOWNERS
        (hoy `* @owner` obliga review en todos; quitarlo deja auto-mergeables los PR no-sensibles).
- **CD — entrega** `[ ]` (NO en esta tanda)
  - [ ] build+push de imágenes api/web a GHCR (SHA + latest) en push a `main`.
  - [ ] deploy a `staging` con `prisma migrate deploy` (`DIRECT_DATABASE_URL`).
  - [ ] deploy a **producción**: entorno protegido + aprobación manual + backup + rollback —
        **cableado pero desconectado** hasta elegir hosting. No activar.

## Transversales de seguridad / cumplimiento de datos

- [~] Cifrado en tránsito (TLS) y en reposo (campos sensibles / disco).
  - [x] **En reposo — contenido de documentos**: AES-256-GCM (`EncryptedStorageProvider`, decorador
        agnóstico del backend); clave obligatoria en producción; passthrough de objetos legacy. Ver D-021.
  - [x] **TLS en el borde** documentado en `RUNBOOK.md` (terminación, HSTS, 80→443, `sslmode=require`).
  - [ ] **PII de clientes a nivel de columna** (fase diferida: blind index / TDE de disco; ver D-021).
- [x] Control de acceso granular + aislamiento estricto por tenant. **Postgres RLS activa y cableada**
      como defensa en profundidad: políticas + rol de mínimo privilegio + la app fija `app.tenant_id` por
      request (interceptor + extensión Prisma). Enforcement probado por tests (ver D-013).
  - [x] **RLS a FAIL-CLOSED** (sin contexto → cero filas; rutas de sistema vía rol `legalflow_system`
        con BYPASSRLS, no por ausencia de contexto). Fusionado a main (PR #19). 90/90 e2e. Ver D-020.
- [~] Preparado RGPD/LOPDGDD (ES) y Ley 172-13 (RD); trazabilidad para futuro AI Act.
  - [x] **Acceso/portabilidad**: `GET /clients/:id/gdpr-export` (FIRM_ADMIN) + **RAT** (`RAT.md`, art. 30).
        Fusionado a main (PR #28). Ver D-022.
  - [x] **Supresión por ANONIMIZACIÓN** (no hard-delete; preserva expediente/facturas/auditoría) +
        **retención configurable** (`Tenant.dataRegion`/`retentionMonths`). **Fusionado a main (PR #29).**
        Ver D-022.
  - [x] **UI RGPD** en la ficha de cliente (solo FIRM_ADMIN): exportar (descarga JSON) y anonimizar
        con confirmación fuerte (escribir el nombre exacto; irreversible). **Fusionado (PR #40).**

---

## Estado actual de la sesión

- ✅ Entregado para revisión: `PLAN.md`, `DECISIONS.md` y andamiaje completo del monorepo (archivos).
- ⚠️ **Bloqueante de entorno:** esta máquina no tiene Node.js / pnpm / Docker instalados (solo git).
  No se ha podido ejecutar `pnpm install`, build, ni `prisma migrate`. Ver `DECISIONS.md` §Entorno.
- ⏭️ Siguiente al aprobar: E1 (Auth multi-tenant + RBAC).

### Actualizacion 2026-06-14 - Codex

- Entorno local con Node/pnpm operativo; se han ejecutado pruebas unitarias de compliance, e2e de API
  y comprobaciones TypeScript.
- Backend MVP Fase 1 avanzado hasta E7 y E9 validado con tests.
- Frontend existente en `apps/web`, pero todavia es una pantalla inicial basica; falta UI funcional
  para operar clientes, expedientes, documentos, tareas, ledger y portal.
- Siguiente foco recomendado: corregir configuracion de lint/CI (E0), ampliar UI funcional (E8/web)
  y abordar transversales de seguridad/datos.
