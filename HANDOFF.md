# HANDOFF — Lexora / LegalFlow (para continuar en otro chat)

> Pega este archivo (o su ruta) al iniciar un chat nuevo. Es autosuficiente: estado real, contexto
> técnico y el roadmap de pantallas pendientes basado en la **plantilla del prototipo**.

## Qué es

SaaS de gestión legal multi-jurisdicción **España (`es`)** + **República Dominicana (`do`)**. Producto
mostrado como **"Lexora"** (paquetes siguen `@legalflow/*`; rebrand diferido). Principio no negociable:
**núcleo agnóstico de jurisdicción + adaptadores de cumplimiento** (`packages/compliance`, factory por
`tenant.jurisdiction`). El **locale** (es-ES/es-DO) gobierna formato/moneda; la **jurisdicción** del
tenant gobierna impuestos e identificadores (Verifactu/IVA+IRPF vs e-CF/ITBIS, NIF/CIF vs RNC). Nunca
hardcodear país en la UI.

## Repo, entorno y convenciones (IMPORTANTE)

- GitHub: `https://github.com/OswaldoVargas11/Prood007` (ojo: "Pro**o**d007", doble o). Rama única de
  trabajo: **`feat/mvp-fase1`** → PR #1. `gh` autenticado.
- **Worktrees:** este chat trabaja en un worktree. Al abrir uno nuevo, si está pinneado a un commit
  viejo, reconciliar antes de tocar nada: `git fetch origin && git reset --hard origin/feat/mvp-fase1`.
  **Commitear en el worktree y empujar SIEMPRE con `git push origin HEAD:feat/mvp-fase1`** (no a ramas
  `claude/*`). El `.env` está gitignored: cópialo del checkout principal al worktree
  (`apps/api/.env`).
- PATH en cada comando Bash:
  `export PATH="/c/Program Files/nodejs:/c/Program Files/GitHub CLI:/c/Program Files/Docker/Docker/resources/bin:$PATH"`
- **Commits:** `git commit -F <archivo>` (NO here-strings `@'...'@`; rompe el mensaje). commitlint =
  Conventional Commits, **subject en minúscula**. Hooks husky activos (prettier + commitlint) →
  reformatean al commitear, es normal.
- **Coordinación:** otra IA (Codex) también trabaja la rama. Añadir entrada por bloque en
  **`AI_WORKLOG.md`**. Mantener `PLAN.md` y `DECISIONS.md` al día.
- **Regla de calidad:** cada incremento se prueba (tsc/lint/build + e2e/E2E real) y se commitea con CI
  en verde. Nada de datos mock en pantallas: todo cableado a la API real.

## Stack

Monorepo pnpm: `apps/api` (NestJS + Prisma + Postgres, **RLS activa**), `apps/web` (Next.js 14 App
Router + Tailwind 3 + **shadcn/ui propio** + next-intl + **TanStack Query** + socket.io-client),
`packages/{domain,compliance,config}` (CommonJS). Postgres en Docker: `legalflow-postgres`.

### Base de datos / RLS (no romper)

- RLS por tenant ACTIVA y **FAIL-CLOSED** (D-013 + **D-020**). La app conecta como **rol de mínimo
  privilegio `legalflow_app`** y fija `app.tenant_id` por request (interceptor
  `prisma/tenant-context.interceptor` + extensión en `prisma/prisma.service`). **Sin contexto → cero
  filas** (no bypass). **Tres URLs en `.env`:** `DATABASE_URL` (rol app, runtime), `DIRECT_DATABASE_URL`
  (rol propietario `legalflow`, para migraciones) y **`SYSTEM_DATABASE_URL`** (rol `legalflow_system`
  con BYPASSRLS, SOLO para rutas cross-tenant legítimas: login/registro/carga de token, vía
  `SystemPrismaService`). Si falta `SYSTEM_DATABASE_URL`, cae a `DIRECT_DATABASE_URL`. Sin
  `DIRECT_DATABASE_URL`, `prisma generate/migrate` fallan. Las queries de servicio filtran por `tenantId`
  además de RLS. ⚠️ Cualquier ruta nueva que olvide el contexto de tenant fallará de forma ruidosa (cero
  filas / error WITH CHECK), nunca filtra.
- Migraciones con `prisma migrate deploy` (usa `directUrl`). El rol app lo crea
  `20260614121000_app_role`.

## Auth (cómo funciona — D-014/D-015)

- Backend devuelve los tokens en el **cuerpo JSON** (no cookie). El web usa un **BFF** (Route Handlers
  `apps/web/src/app/api/auth/{login,refresh,logout}`) que proxya a Nest y guarda el **refresh en cookie
  httpOnly**; el **access vive en memoria** (`lib/api.ts`). Refresh automático en 401. El cliente
  **nunca** envía `tenantId`.
- **Gate de rutas en servidor** (`middleware.ts`): sin cookie → `/login`; cookie `lf_scope` (firm/
  client, la fija el BFF) → CLIENT solo puede entrar al **/portal**, staff a la firm app.

## Estado ACTUAL (todo en verde, CI verde)

**Backend MVP E1–E9 completo + RLS.** API e2e: **11 suites / 62 tests**. Endpoints por módulo: auth,
clients, matters, documents (multipart + review), tasks (+ `/tasks/from-deadline`), ledger (entries/
time/invoices/pay), messages (`/matters/:id/messages`), notifications, portal (`/portal/*`),
**dashboard (`GET /dashboard/summary`)**, realtime (Socket.IO: `matter:subscribe`, `message:new`,
`notification:new`). **RGPD/172-13 (D-022):** `GET /clients/:id/gdpr-export` (portabilidad) y
`POST /clients/:id/anonymize` (supresión por anonimización, **preserva** expediente/facturas/auditoría),
ambos FIRM_ADMIN — **expuestos en la UI** en la ficha de cliente (tarjeta RGPD: exportar + anonimizar
con confirmación fuerte, PR #40). Cifrado en reposo de documentos (AES-256-GCM, D-021) + RLS fail-closed (D-020).

**Frontend (apps/web) — integración del prototipo, hecho:**

- F0 Fundación + login E2E (BFF httpOnly, shell: sidebar flotante, ⌘K cmdk, panel IA Sheet, tema,
  menú usuario). Primitivos shadcn propios en `components/ui/*`, helpers en `lib/*`.
- F1 Dashboard (reconstruido **idéntico al diseño**: KPIs, gráfico de ingresos SVG, "Resumen del día"
  calculado, plazos, actividad) + Expedientes (lista + ficha hero con tabs y transición de estado).
- F2 Documentos (tab: subir/versión/revisión/descarga). F3 Tareas (+ crear desde plazo). F4
  Facturación (tab Costes + `/invoices/[id]` con bloque Verifactu/e-CF). F5 Tiempo real (chat + campana
  de notificaciones). F6 Portal del cliente (solo lectura + chat).
- **Clientes** (lista) + **Ficha de cliente** (tabs Expedientes/Documentos/Facturas).
- **Pulido (Tarea 5, D-023) — todo fusionado:** QR Verifactu escaneable (PR #31), **nav responsive**
  (sidebar → Drawer en móvil, PR #33), **animaciones framer-motion + webfont Geist** (tokens del
  handoff, respeta `prefers-reduced-motion`, PR #34), **preview fiscal en vivo** (PR #30, read-only
  que reusa la matemática fiscal real: `buildInvoiceRecord` delega en `previewInvoice`) y **catálogo
  i18n exhaustivo de la API** (PR #32, todo error por messageKey con catálogo es-ES/es-DO; **E8 cerrado**).
- **Datos de demo sembrados** (`apps/api/scripts/seed-demo.mjs`): 7 clientes, 9 expedientes, tareas,
  facturas en 6 meses, documentos, chat, actividad. Demo: `admin@demo.test` / `Sup3rSecret!2026`;
  cliente portal: `cliente1@demo.test` / `Cli3ntPass!2026`.

## La PLANTILLA es la fuente de verdad de diseño

`design/Lexora.dc.html` (1842 líneas) define **~20 pantallas**. El usuario quiere replicarlas **tal cual**
y luego ver datos. (Es un `.dc.html` que renderiza con React/Babel + `support.js` y datos mock; importa
**solo el layout/estados/estilo**, los datos van de la API real.) Handoff técnico de mapeo a shadcn:
`design/Lexora-Implementation.dc.html`. Tokens ya integrados en `apps/web/src/app/globals.css`.

**Líneas de cada pantalla en `design/Lexora.dc.html`** (leerlas antes de implementar cada una):
Dashboard 283 · Matters list 409 · **Matter detail 453** (rail con cronómetro, plazos, saldo —
nuestra ficha es por tabs; falta acercarla a este layout) · Clients 555 · Billing 579 · Client profile
639 · Documents 677 · **Doc review 706** (comparar v2→v3) · Tasks 739 · Invoice detail 763 ·
Notifications center 802 · **Calendar/agenda 868** · **Cost approvals 905** · **Audit log 928** ·
**Settings/admin 950** · AI panel 1039 · **Conflict modal 1089** · Command palette 1115 · Login 1152 ·
**Onboarding 1219** · Client portal 1311. Datos/labels (kpis, clients, ledger…) ~1525–1780.

## PENDIENTE — roadmap por tandas (lo que pidió el usuario)

### Tanda A — solo frontend (sobre endpoints que YA existen):

1. **Onboarding** (alta de despacho multi-paso) → `POST /api/auth/register-tenant`. Pantalla pública
   tipo login.
2. **Centro de notificaciones** (página completa, agrupada por fecha, "marcar todas leídas") →
   `GET /notifications`, `PATCH /notifications/:id/read`. Ya hay campana; falta la página.
3. **Agenda/Calendario de plazos** → derivar de `GET /tasks` (procesales con `dueDate`).
   `react-day-picker` (añadir dep) o calendario propio.
4. **Documentos (vista global del expediente) + comparar versiones (v2→v3)** → `GET /documents/
by-matter/:id`, `GET /documents/:id`. Hoy está como tab; el prototipo tiene split-view + preview +
   pantalla de review con diff.
5. **Acercar la ficha de expediente al layout del prototipo** (líneas 453–552): rail derecho con
   **cronómetro** (start/stop de tiempo → `/ledger/time`), tarjeta de plazos procesales y tarjeta de
   saldo; resumen del asunto a la izquierda.

### Tanda B — requieren BACKEND NUEVO (⚠️ features que no existen; crear módulo + endpoints + e2e):

6. **Ajustes/Admin** (Settings, líneas 950): gestión de **usuarios del despacho** (invitar/rol),
   **suscripción**, **series fiscales**, **certificado** (subida), **festivos locales**. Hay que diseñar
   modelos/endpoints nuevos. Empezar por usuarios (User CRUD por tenant) y festivos.
7. **Auditoría** (línea 928): exponer `GET /audit` (listado paginado del `AuditLog`, ya existe la tabla;
   falta controller/service @Roles FIRM_ADMIN).
8. **Aprobación de costes** (línea 905): estado de aprobación en apuntes de ledger (campo nuevo +
   endpoints approve/reject) y pantalla.
9. **Comprobación de conflictos** (modal, línea 1089): endpoint de búsqueda de partes/clientes por
   nombre para detectar conflicto de interés antes de crear cliente/expediente.

Además, **alta de cliente y alta de expediente** desde la UI (hoy solo se crean vía API/seed): formular-
ios con `react-hook-form + zod` y validación fiscal en vivo (el backend valida de verdad en
`/clients`).

## Cómo construir una pantalla nueva (patrón establecido)

- **Tipos** en `apps/web/src/lib/types.ts`; **hooks** TanStack Query en `lib/hooks.ts`
  (`useX`/`useCreateX`…); **cliente** `lib/api.ts` (`api.get/post/patch/del/upload/download`).
- **UI**: primitivos en `components/ui/*` (button, card, input, label, badge, skeleton, dialog, sheet,
  command, dropdown-menu, avatar, tabs, textarea). Componentes de pantalla en `components/lexora/*`.
  Estilo por **tokens** (`var(--brand)`, `bg-card`, `text-muted-foreground`, `tabular-nums`…).
- **Páginas**: firm app en `app/[locale]/(app)/<ruta>/page.tsx` (envueltas por `AppShell` con guard);
  portal en `app/[locale]/portal/*`. Navegación localizada con `@/i18n/navigation` (`Link`,
  `useRouter`). Habilitar secciones en `lib/nav.ts`.
- **i18n**: añadir claves a `apps/web/messages/es-ES.json` y `es-DO.json` (ambos español; plurales ICU
  soportados). Sin strings hardcodeados.
- **Estados** cargando(skeleton)/vacío/error en cada vista. Dark+light. RLS hace el scoping por tenant
  automáticamente (no enviar tenantId).

## Cómo correr / probar / sembrar

```
docker compose up -d postgres
# API (rol app + storage local para dev):
cd apps/api && pnpm exec prisma migrate deploy   # usa DIRECT_DATABASE_URL
STORAGE_DRIVER=local STORAGE_LOCAL_PATH=./storage node dist/main.js   # tras `pnpm build`
# Web (producción, más estable para revisar):
cd apps/web && pnpm build && node node_modules/next/dist/bin/next start -p 3000
# Seed de demo (con la API arriba):
node apps/api/scripts/seed-demo.mjs
```

Verificación por slice: `pnpm --filter @legalflow/web exec tsc --noEmit`, `... lint`, `... build`;
api: `pnpm --filter @legalflow/api lint && pnpm exec jest --config test/jest-e2e.json`. Tras push,
`gh run watch` hasta `success`.

## Documentos clave

`PLAN.md` (épicas E0–E9 + **Frontend F0–F7** con estado), `DECISIONS.md` (ADR; **D-013** RLS, **D-014**
auth BFF, **D-015** gate de rol), `AI_WORKLOG.md` (bitácora), `design/*` (prototipo + handoff de
diseño), `apps/api/scripts/seed-demo.mjs` (seed).

## Siguiente acción recomendada en el nuevo chat

1. Reconciliar el worktree a `feat/mvp-fase1` y copiar `apps/api/.env`. Levantar Postgres + API + web +
   seed; abrir `http://localhost:3000/es-ES/login`.
2. Continuar **Tanda A (1→5)** una pantalla por commit (probada, CI verde), leyendo cada pantalla en
   `design/Lexora.dc.html` por sus líneas. Luego **Tanda B (6→9)** creando los endpoints nuevos.
3. Registrar cada bloque en `AI_WORKLOG.md` y marcar en `PLAN.md`.
