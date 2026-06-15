# Informe de QA — Lexora

- **Fecha:** 2026-06-15
- **Versión:** `main` @ `f4e3a7e`
- **Demo:** http://localhost:3000 (web prod) · http://localhost:4000/api (API) · Postgres/MinIO/Redis en Docker
- **Método:** exploración con Playwright (chromium headless), sesión staff (`owner@lexora.test`) y sesión cliente (`cliente@lexora.test`). 41 capturas en `qa-screenshots/` (gitignoreado).

> **Regla cumplida:** no se modificó código de la app durante el QA. Lo único escrito fuera de `qa-screenshots/` es este informe y una línea en `.gitignore`. Los hallazgos se describen, no se arreglan.

---

## Estado del entorno (relanzamiento desde main)

Al apagar lo que estaba levantado se detectó que **lo que servía en `:3000` no era main, sino el worktree `.claude/worktrees/invoice-pdf`** (tres procesos `next dev`), y que **main tenía artefactos de build stale**:

- Cliente **Prisma** desactualizado: faltaban `anonymizedAt`, `dataRegion`, `retentionMonths` (existen en migraciones `…gdpr_anonymize_retention` y `schema.prisma`).
- Paquete **`@legalflow/compliance`** sin reconstruir: `previewInvoice` estaba en el `src` pero no en el `dist` (08:51, anterior al commit del feature #30).

Acciones para dejar main limpio: `pnpm db:generate` + rebuild de `packages/**` + `next build`. Tras eso, **API y web arrancan y compilan sin errores desde main**:

| Servicio                 | Estado                                                   | Origen |
| ------------------------ | -------------------------------------------------------- | ------ |
| API `:4000/api`          | ✅ healthy · login 200 / 401 correcto                    | main   |
| Web `:3000`              | ✅ `next start` (prod) · BFF setea `lf_session` httpOnly | main   |
| Postgres / MinIO / Redis | ✅ up                                                    | docker |
| Datos demo               | ✅ `owner@lexora.test`, `cliente@lexora.test` presentes  | DB     |

---

## Resumen ejecutivo

| Sección                                                | Estado      | Hallazgos                                                    |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------ |
| Auth (login/logout/anti-enumeración)                   | 🟢          | 0                                                            |
| Dashboard                                              | 🟢          | 0                                                            |
| Expedientes (lista + ficha + tabs)                     | 🟢          | 0                                                            |
| Clientes (lista + alta + validación NIF)               | 🟢          | 0                                                            |
| Documentos (subida)                                    | 🟢          | 0 (download no ejercido)                                     |
| Tareas                                                 | 🟢          | 0                                                            |
| Facturas (lista + detalle + QR Verifactu)              | 🟢          | 0                                                            |
| Facturación / Nueva factura (preview en vivo + emitir) | 🟢          | 0                                                            |
| Agenda / Calendario                                    | 🟢          | 0 (crear evento no ejercido)                                 |
| Mensajes                                               | 🟢          | 0                                                            |
| Notificaciones                                         | 🟢          | estado vacío correcto                                        |
| Ajustes                                                | 🟢          | render OK (guardado no ejercido)                             |
| Aprobaciones / Auditoría                               | 🟢          | 0                                                            |
| Command bar (Ctrl/⌘K)                                  | 🟢          | 0                                                            |
| Dark / Light                                           | 🟢          | 0                                                            |
| Responsive / móvil                                     | 🟢          | 0                                                            |
| Portal cliente + aislamiento de rol                    | 🟢          | 1 (info)                                                     |
| **Entorno de desarrollo (`next dev`)**                 | ✅ resuelto | era 1 (DX)                                                   |
| Login (toggle de tema)                                 | ✅ resuelto | era 1                                                        |
| Accesibilidad (diálogos)                               | ✅ resuelto | era 1                                                        |
| Rutas/ruido menor                                      | 🟡          | `/portal/matters` ✅ · refresh ⏳ OK · filas factura (menor) |

**Veredicto:** **no hay 🔴 bloqueantes de cara al piloto.** Los dos riesgos explícitamente señalados como "piloto fallido" —**500 al emitir factura** y **500 al subir documento**— se probaron y **ambos funcionan sin error**. El aislamiento de rol staff↔cliente es sólido. Lo 🟡 es DX y pulido, no impide enseñar la app.

---

## Hallazgos por sección

### Auth

- 🟢 **Login correcto → dashboard.** `owner@lexora.test` entra y aterriza en `/es-ES/dashboard`. La cookie de sesión `lf_session` es `httpOnly` (verificado por el BFF).
- 🟢 **Anti-enumeración.** Con email inexistente + clave mala, el mensaje es genérico **"Credenciales inválidas."** y la API devuelve **401** sin revelar si el email existe. No filtra enumeración. (`qa-screenshots/probe-badlogin.png`)
- 🟢 **Logout limpia sesión.** Tras cerrar sesión vuelve a `/login` y un acceso posterior a `/dashboard` redirige a `/login` (sesión invalidada).

### Dashboard (`/dashboard`)

- 🟢 KPIs con datos reales: expedientes activos (4 de 8), plazos próximos (6), facturable mes (2.650 €), revisiones pendientes (2). Gráfico de ingresos (11.236 €) renderiza. Plazos procesales próximos y actividad reciente con datos. (`owner-01-dashboard.png`)

### Expedientes (`/matters`)

- 🟢 Lista con datos (EXP-2026-0001..0008), columnas referencia/título/cliente/letrado/estado/actualizado, y filtros por estado (Todos/Abierto/En curso/En espera/Cerrado/Archivado).
- 🟢 **Ficha de expediente** con todos los tabs: **Resumen, Documentos, Tareas, Costes, Chat, Actividad**. Muestra cliente, tipo, letrado (selector), plazos procesales, saldo/ledger, "Proponer coste", cronómetro de **Tiempo** y "Cambiar estado". (`owner-15-matter-detail.png`)
- ⚠️ _No ejercido:_ guardar entrada del cronómetro, crear tarea/plazo, marcar completada, transición de estado completa (ver cobertura).

### Clientes (`/clients`)

- 🟢 Lista con NIF validado, tipo, nº expedientes y saldo.
- 🟢 **Validación de identificador fiscal.** Alta con NIF inválido (`00000000`) → diálogo permanece abierto, error inline **"Identificador fiscal no válido para la jurisdicción del despacho."** y la API responde **400**. (`probe3-client-invalid-nif.png`)
- 🟢 Ficha de cliente con tabs Expedientes/Documentos/Facturas y estado del portal. (`owner-16-client-detail.png`)

### Documentos (`/documents` y tab del expediente)

- 🟢 Vista global agrupada por expediente con estado (En revisión/Aprobado).
- 🟢 **Subida de documento funciona y NO da 500.** Subido `qa-upload-sample.txt` desde el tab Documentos del expediente; el archivo aparece en la lista sin errores 4xx/5xx (round-trip de almacenamiento cifrado OK a nivel de no-error).
- ⚠️ _No ejercido:_ **descarga** desde la UI (botón no pulsado) ni **comparar versiones** (solo hay docs v1 en demo).

### Tareas (`/tasks`)

- 🟢 Lista global con filtros (Todas/Pendiente/En curso/Hecha/Cancelada), plazos procesales con vencimiento y estado. "Nueva tarea" y "Desde plazo" presentes.

### Facturas (`/invoices`)

- 🟢 Lista de facturas con número/cliente/fecha/total/estado (Pagada/Emitida). (`owner-06-invoices.png`)
- 🟢 **Detalle de factura con QR Verifactu REAL renderizado** (imagen escaneable de módulos, no texto plano). Datos fiscales correctos: Base 1.700 € · Impuestos 357 € (21%) · Retención −255 € (15%) · **Total 1.802 €**. Incluye **huella (hash)**, **encadenamiento (huella anterior)** y el registro Verifactu/AEAT. La URL de cotejo AEAT se muestra además como texto bajo el QR (transparencia). (`probe-invoice-detail.png`)
- 🟡 (menor) Las filas de la lista son `<button>` con `router.push`, no `<a>` — no permiten abrir en pestaña nueva / clic central.

### Facturación / Nueva factura (`/billing` + diálogo "Nueva factura")

- 🟢 `/billing`: resumen por expediente (facturado total 11.236 €, saldo pendiente 10.300 €, 28 movimientos).
- 🟢 **Preview fiscal EN VIVO reactivo.** En "Nueva factura" del expediente, con Cant 2 × Precio 500 → "CÁLCULO FISCAL EN VIVO" actualiza: Base 1.000 € · Impuestos 210 € · Retención −150 € · **Total 1.060 €** (jurisdicción ES, Verifactu). (`probe4-preview.png`)
- 🟢 **Emitir factura funciona, sin 500.** Se emitió FAC-2026-0009 (la app navega al detalle, QR + encadenamiento renderizados). El cálculo de emisión coincide con el preview (misma matemática fiscal, sin divergencia). (`probe4-after-emit.png`)
  - Nota de dato: este QA dejó **un cliente** y **una factura** de prueba creados vía UI (no se borraron, son datos de demo).

### Agenda / Calendario (`/calendar`)

- 🟢 Vista mensual (junio 2026) con día "HOY" marcado y plazos "Contestación a la demanda" distribuidos. (`owner-08-calendar.png`)
- ⚠️ _No ejercido:_ crear evento.

### Mensajes (`/messages`)

- 🟢 Lista de conversaciones, una por expediente, con último mensaje y antigüedad.

### Notificaciones (`/notifications`)

- 🟢 Centro de notificaciones abre, con **estado vacío correcto** ("No tienes notificaciones") y acción "Marcar todas como leídas".
- ⚠️ _No ejercido:_ marcar como leída (no había notificaciones en demo).

### Ajustes (`/settings`)

- 🟢 Render correcto de: Datos del despacho (nombre/ID fiscal/jurisdicción ES/moneda EUR/serie), Licencia (asientos por rol). (`owner-11-settings.png`)
- ⚠️ _No ejercido:_ guardar cambios, invitar usuario, festivos, serie fiscal, RGPD (exportar/anonimizar) desde la UI (sí cubierto en E2E de API — ver cobertura).

### Aprobaciones (`/approvals`) y Auditoría (`/audit`)

- 🟢 Aprobaciones: cola visible con estado vacío explicativo del flujo letrado→admin→ledger.
- 🟢 Auditoría: registro inmutable append-only (actor · acción · recurso · fecha) con datos reales.

### Command bar (Ctrl/⌘K)

- 🟢 Se abre con `Ctrl+K`, acepta búsqueda ("clien" devuelve resultado) y navega. (`probe-cmdk-open.png`, `probe-cmdk-search.png`)

### Dark / Light

- 🟢 El toggle cambia `documentElement` de `dark`→`light`; ambos modos legibles, buen contraste, gráficos visibles. (`probe-theme-toggled.png`)

### Responsive / móvil (~375px)

- 🟢 La sidebar colapsa y aparece **hamburguesa** (2 candidatos de botón de menú detectados); el dashboard se reordena en una columna sin romperse. (`owner-18-mobile-dashboard.png`)

### Portal cliente (`cliente@lexora.test`)

- 🟢 Login del cliente → **`/portal`** (no al panel staff). Muestra solo **sus** expedientes (EXP-2026-0006) y **sus** facturas (FAC-2026-0006). (`client-01-portal.png`)
- 🟢 Ficha de expediente del portal (`/portal/matters/[id]`) con tabs **Documentos · Costes · Tareas · Chat** y estado vacío correcto ("Aún no hay documentos en este expediente").
- 🟢 **Aislamiento de rol sólido:** intentos a `/dashboard`, `/clients`, `/settings`, `/matters` como cliente **redirigen todos a `/portal`** — nunca muestran datos de staff ni de otros tenants.
- 🟢 (info) El _landing_ del portal expone solo Expedientes + Facturas; Documentos y Mensajes son accesibles **por expediente** (dentro de la ficha), no como navegación global. Es diseño, no fallo — se anota por si el checklist esperaba accesos globales.

---

## 🟡 Mejoras / pulido (no bloquean piloto)

> **Estado (rama `fix/qa-yellows-web`):** #1–#4a **RESUELTOS y verificados**. El #4b (ruido de refresh) toca lógica de auth/sesión → **sacado a PR aparte, a la espera del OK** del responsable.

1. **✅ RESUELTO — `next dev` se caía en main.** `apps/web/tailwind.config.ts:72` usaba `require('tailwindcss-animate')` en un módulo ESM; bajo Node v24, `next dev` lanzaba `ReferenceError: require is not defined`. **Fix:** cambiado a `import tailwindcssAnimate from 'tailwindcss-animate'`. **Verificado:** `next dev` compila `/[locale]/login` (200) sin el error. (`next build`/`start` ya iban bien.)
2. **✅ RESUELTO — toggle de tema del login era `type="submit"`.** Podía enviar el `<form>` de login. **Fix:** `type="button"` en el componente compartido `ThemeToggle`. **Verificado:** clic en el toggle de `/login` cambia el tema (→ light) sin enviar el formulario (sigue en `/login`).
3. **✅ RESUELTO — a11y: diálogo sin `DialogTitle`.** El warning de Radix venía del **command bar** (`CommandDialog` no incluía título). **Fix:** `DialogTitle` (+`DialogDescription`) visually-hidden (`sr-only`) en `CommandDialog`, con `label` accesible desde `command-menu`. Los 7 diálogos de páginas y los 2 `Sheet` (panel IA y drawer móvil) ya tenían título. **Verificado:** abrir ⌘K ya no emite el warning.
4. **✅ RESUELTO (#4a) — `/portal/matters` (índice) daba 404.** **Fix:** añadida ruta índice `portal/matters/page.tsx` que redirige a `/portal`. **Verificado:** como cliente autenticado, `/portal/matters` → `/portal` (ya no 404).
5. **⏳ PENDIENTE OK (#4b) — Ruido `401 POST /api/auth/refresh`** en cargas no autenticadas. **Causa raíz:** `AuthProvider` (`apps/web/src/lib/auth.tsx:42`) llama a `refreshAccessToken()` al montar **siempre**, también en rutas públicas (login/onboarding). **Fix propuesto:** condicionar ese bootstrap para no refrescar en rutas públicas. `auth.tsx` no está en CODEOWNERS, pero por ser lógica de auth/sesión se saca a **PR aparte** y se espera OK antes de mergear.
6. **🟡 (menor, no abordado) Filas de facturas no son enlaces** (`<button>` con navegación JS): sin abrir-en-pestaña-nueva ni clic central. Cosmético; queda anotado.

---

## Cobertura E2E existente vs exploración

### Lo que ya cubren los tests (Paso 0)

**API (`apps/api/test/`, Jest e2e):**

- `auth` — login, tokens, cookies, 401.
- `clients-matters` — CRUD de clientes y expedientes.
- `documents` + `encryption` — subida y cifrado a nivel app (AES-256-GCM).
- `ledger` — facturación/apuntes (incl. `previewInvoice` con paridad emisión/preview, cubierto también en `packages/compliance/src/invoicing.spec.ts`).
- `tasks`, `dashboard` — tareas y resumen.
- `gdpr` + `gdpr-anonymize` — exportar y anonimizar datos de cliente.
- `portal-realtime` + `api-messages` + `realtime-tenant-context` — portal, mensajería y tiempo real con contexto de tenant.
- `rls`, `rls-wiring`, `security` — aislamiento por fila (RLS fail-closed) y seguridad multi-tenant.
- `tanda-b`, `tanda-b2` — licencias/asientos, aprobaciones, serie fiscal, festivos, certificado.

**Web (`apps/web/e2e/`, Playwright smoke):**

- `auth.smoke` — login por BFF (cookie httpOnly), ruta protegida sin sesión → login, credenciales inválidas → 401 sin cookie.
- `role-isolation.smoke` — un CLIENT es expulsado de la firm app al portal; un FIRM_ADMIN sí entra.
- `global-setup` — siembra determinista (tenant ES + admin + cliente portal).

### Lo que añadió esta exploración (lo no cubierto = mayor riesgo)

El E2E valida **el cableado y la lógica** (API, RLS, cifrado, matemática fiscal); **no valida el render ni la interacción de UI**. Esta pasada cubrió ese hueco:

- **Render visual** de las 17 secciones staff + portal (capturas), sin errores de consola ni 500 en ninguna.
- **QR Verifactu** efectivamente renderizado como imagen escaneable en el detalle (el E2E comprueba el cálculo, no el pintado del QR).
- **Preview fiscal en vivo** reactivo en el diálogo de Nueva factura (UI), y **emisión** end-to-end desde la UI.
- **Subida de documento** desde la UI (no solo API).
- **Validación de NIF** mostrada inline en el formulario.
- **Command bar, dark/light, responsive/hamburguesa, anti-enumeración visible, logout** — todo ello sin cobertura E2E previa.

### Huecos de cobertura (recomendado automatizar/probar después)

Descarga de documento desde UI · comparar versiones · guardar cronómetro de tiempo · crear evento de calendario · guardar Ajustes / invitar usuario / festivos / serie fiscal desde UI · RGPD export/anonimizar desde UI · marcar notificación como leída · onboarding multi-paso (el owner ya está onboarded → redirige a dashboard).

---

## Recomendaciones priorizadas

1. **(DX, antes de seguir desarrollando)** Arreglar `tailwind.config.ts:72` para que `next dev` no se caiga en main (`import` en vez de `require`). No afecta al piloto (prod va bien) pero rompe el bucle de desarrollo local.
2. **(Pulido visible en el piloto)** Cambiar el toggle de tema del login a `type="button"` para que no envíe el formulario.
3. **(A11y)** Añadir `DialogTitle` (o `VisuallyHidden`) a los diálogos para lectores de pantalla.
4. **(Robustez)** Manejar `/portal/matters` (índice) — redirigir a `/portal` en vez de 404 — y silenciar el `401 /api/auth/refresh` en páginas públicas.
5. **(Cobertura)** Subir un par de smoke E2E de UI para los flujos no cubiertos visualmente: descarga de documento, guardar tiempo, y emitir factura desde la UI (ya verificados manualmente aquí, conviene blindarlos).

**Para enseñar a despachos:** ✅ adelante. Ningún 🔴. Los caminos críticos (emitir factura con QR Verifactu, subir documento, aislamiento staff/cliente) funcionan. Lo pendiente es pulido (1–4) y endurecer cobertura (5).
