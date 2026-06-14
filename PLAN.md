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

## E8 — i18n y multimoneda (transversal) `[~]`

- [x] Locales `es-ES` y `es-DO` operativos en web (next-intl, sin strings hardcodeados en UI).
- [x] Moneda por tenant (EUR / DOP); ledger y facturas usan `tenant.currency`.
- [x] Errores de cumplimiento con `messageKey` para traducir en UI.
- [ ] Catálogo i18n exhaustivo de mensajes de API (pendiente de pulido).

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
  - Pendiente de slices siguientes: framer-motion (animaciones), nav móvil (Drawer), Geist webfont.
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
  - Pendiente: preview fiscal en vivo antes de emitir (la API no expone cálculo previo); QR Verifactu
    renderizado (se muestra el payload/huella); pantalla global de facturación (sin endpoint de listado).
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
- **F7 — Resto (ajustes/admin, agenda/calendario, aprobaciones, auditoría)** `[ ]` — **diferido**: el
  backend aún no expone estos endpoints (settings/suscripción/certificado/series fiscales/listado de
  auditoría); construirlos requeriría datos mock, lo que rompe la regla. Va "tras validar con despachos".

Reglas: cero datos mock al cerrar un slice · nada de país hardcodeado (todo fiscal/idioma sale de la
jurisdicción del tenant) · estados cargando/vacío/error en cada vista · dark+light · AA · TanStack
Query para estado de servidor · `NEXT_PUBLIC_API_URL` por entorno.

## Diferido (stubs detrás de interfaz — NO construir aún)

- Envío real AEAT/DGII, LexNET en vivo, firma electrónica (Signaturit/DocuSign), SMS.
- `AiAssistantProvider` (solo contrato): redacción/resumen/revisión con citación y anti-alucinación.
- CRM/captación, dashboards avanzados, app móvil.

## Transversales de seguridad / cumplimiento de datos

- [ ] Cifrado en tránsito (TLS) y en reposo (campos sensibles / disco).
- [x] Control de acceso granular + aislamiento estricto por tenant. **Postgres RLS activa y cableada**
      como defensa en profundidad: políticas + rol de mínimo privilegio + la app fija `app.tenant_id` por
      request (interceptor + extensión Prisma). Enforcement probado por tests (ver D-013).
- [ ] Preparado RGPD/LOPDGDD (ES) y Ley 172-13 (RD); trazabilidad para futuro AI Act.

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
