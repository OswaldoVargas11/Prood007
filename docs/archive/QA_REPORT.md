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
| Documentos (subida + descarga + comparador)            | 🟢          | 0 — download y comparador v1/v2 verificados (Parte B)        |
| Tareas                                                 | 🟢          | 0                                                            |
| Facturas (lista + detalle + QR Verifactu)              | 🟢          | 0                                                            |
| Facturación / Nueva factura (preview en vivo + emitir) | 🟢          | 0                                                            |
| Cronómetro → Costes (facturable)                       | 🟢          | 0 — iniciar/parar/guardar verificado (Parte B)               |
| Agenda / Calendario                                    | 🟡          | sin alta de eventos (solo plazos, read-only)                 |
| Mensajes                                               | 🟢          | 0                                                            |
| Notificaciones                                         | 🟢          | marcar leída verificado · enum i18n ✅ resuelto (#41)        |
| Ajustes (guardar · serie · festivos · invitar)         | 🟢          | 0 — persistencia verificada (Parte B)                        |
| RGPD (export + anonimizar)                             | ✅ resuelto | UI en la ficha de cliente (#40) · backend ya verificado      |
| Onboarding (wizard 5 pasos)                            | 🟢          | 0 — crea tenant nuevo (Parte B)                              |
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

### Huecos de cobertura → cerrados en la **Parte B** (ver sección siguiente)

La primera pasada dejó 8 flujos sin pulsar. La Parte B los ejercitó de verdad (creando los datos que faltaban por la propia UI). Resultado: **6 🟢 y 2 🟡 (gaps de UI)**. Detalle abajo.

---

## Segunda pasada — Parte B (flujos ejercitados de verdad)

> Ejecutado contra la web en **producción** (`next build` + `next start`) tras el fix del toggle/Tailwind. Los datos que faltaban se crearon **por la UI** (salvo RGPD, que no tiene UI — ver abajo). Capturas `bdocs-*`, `btimer-*`, `bset-*`, `bnotif-*`, `bonb-*`.

| #   | Flujo                             | Estado | Resultado                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Descargar documento** (UI)      | 🟢     | Descarga autenticada OK (`qa-upload-sample.txt-v1`, 38 B). El blob baja con bearer token.                                                                                                                                                                                                   |
| 2   | **Comparar versiones**            | 🟢     | Subí v2 (81 B) por "Nueva versión"; el detalle del documento muestra **comparador lado a lado "Comparando v1 → v2"** con selector de versiones y descarga por versión. (La 1ª pasada dudaba que existiera: **existe y funciona**.)                                                          |
| 3   | **Cronómetro** (load-bearing)     | 🟢     | Iniciar → contar → parar → **Fichar 1 min** → guarda sin error. Aparece en **Costes** como `Honorarios (tiempo)` **facturable** ("Honorarios (0.02 h): QA cronometro prueba −2,00 €"); alimenta el ledger y es facturable vía "Nueva factura".                                              |
| 4   | **Agenda — crear evento**         | 🟡     | **No existe creación de eventos.** La Agenda es una vista **read-only de plazos procesales** (cómputo por jurisdicción con festivos). Gap respecto al checklist.                                                                                                                            |
| 5   | **Ajustes**                       | 🟢     | Guardar datos del despacho + **serie fiscal** (cambié nombre `Lexora Demo`→`+QA` y serie `FAC`→`QAX`, **persisten tras recargar**, luego revertí) · **añadir festivo** (Navidad QA 25-dic) · **invitar usuario** (QA Lawyer, rol LAWYER). Todo sin error.                                   |
| 6   | **RGPD** (export + anonimizar)    | 🟢     | Backend verificado de extremo a extremo (export devuelve PII; `anonymize` borra PII y **`preserved: {matters:1, invoices:1}`**). **UI añadida (#40):** tarjeta en la ficha de cliente (solo FIRM_ADMIN) con exportar + anonimizar (confirmación fuerte). El gap "sin UI" queda **cerrado**. |
| 7   | **Notificaciones — marcar leída** | 🟢     | Generé una notificación real (el letrado QA revisó un documento del owner): apareció **en tiempo real** y **"Marcar todas como leídas"** la limpió. El enum crudo del título se tradujo (#41): ahora "— Aprobado" / "— Rechazado".                                                          |
| 8   | **Onboarding**                    | 🟢     | Wizard de **5 pasos** completo (despacho → jurisdicción ES → moneda EUR → ID fiscal → cuenta admin) → "Crear despacho" sin error → **aterriza en el dashboard** del tenant nuevo.                                                                                                           |

### Nuevos hallazgos de la Parte B — estado tras el cierre

- **✅ RESUELTO (#40) — RGPD ahora tiene UI.** Tarjeta "Datos personales (RGPD)" en la ficha de cliente (solo FIRM_ADMIN): **exportar** (descarga JSON) y **anonimizar** con confirmación fuerte (escribir el nombre exacto; aviso de irreversibilidad; conserva expediente/facturas). Verificado de extremo a extremo; un LAWYER no ve la tarjeta.
- **✅ RESUELTO (#41) — i18n en notificaciones.** El enum de estado (`APPROVED`/`REJECTED`/…) se mapea a su etiqueta traducida (Aprobado/Rechazado) al pintar, en el centro de notificaciones y la campana.
- **🟡 Agenda sin creación de eventos — DIFERIDO (fuera de alcance).** El calendario de plazos procesales es read-only a propósito; una agenda general (probablemente sync con calendario externo) la decide la validación de producto. No se construye.

### Datos de prueba creados (quedan en la demo — anotados para que no sorprendan)

- **Tenant nuevo** "Despacho QA &lt;timestamp&gt;" + admin `qa.onboard.<ts>@lexora.test` (onboarding).
- **Usuario staff** "QA Lawyer" `qa.lawyer@lexora.test` (rol LAWYER) en el tenant demo.
- **Cliente anonimizado** "[Titular anonimizado]" (era "RGPD Test QA") + su expediente "Asunto RGPD QA" + 1 factura, en el tenant demo.
- **Festivo** "Navidad QA" (2026-12-25) en Ajustes del tenant demo.
- En **EXP-2026-0008**: doc `qa-upload-sample.txt` (v1+v2, v2 aprobada), entrada de tiempo "QA cronometro prueba", y factura **FAC-2026-0009** (de la 1ª pasada).
- El nombre del despacho y la serie fiscal se cambiaron y **se revirtieron** (sin residuo).

---

## Recomendaciones priorizadas

1. ✅ **HECHO (PR #38)** — `tailwind.config.ts` ESM, toggle de login `type="button"`, `DialogTitle` en command bar, índice `/portal/matters`.
2. ✅ **HECHO (PR #40)** — **RGPD en la UI** (ficha de cliente, solo FIRM_ADMIN): exportar + anonimizar con confirmación fuerte. Cierra el gap del checklist.
3. ✅ **HECHO (PR #41)** — estado de las notificaciones traducido (`APPROVED` → "Aprobado").
4. ⏳ **PENDIENTE OK (PR #42)** — `401 /api/auth/refresh` en rutas públicas: el bootstrap de `AuthProvider` no intenta refresh en login/onboarding (sin tocar el refresh autenticado). PR listo, sin fusionar.
5. **(Producto — diferido, fuera de alcance)** **Agenda sin alta de eventos.** Calendario de plazos read-only a propósito; una agenda general la decide la validación de producto.
6. **(Cobertura)** Blindar con smoke E2E de UI los flujos ya verificados a mano: descarga/comparador de documentos, cronómetro→Costes, emitir factura, onboarding, RGPD.

**Para enseñar a despachos:** ✅ adelante. **Ningún 🔴 en Parte A ni Parte B.** Todos los caminos críticos funcionan (emitir factura + QR Verifactu, subir/descargar/comparar documentos, cronómetro facturable, RGPD export/anonimizar desde la UI, aislamiento staff/cliente, onboarding). Pulido pendiente: el #4b a la espera de OK (PR #42). La Agenda como "calendario de plazos" (no agenda general) es decisión de producto diferida.

---

---

# QA v0.2 — Suscripción, login multi-despacho, header, novedades y facturación multi-moneda

- **Fecha:** 2026-06-19
- **Versión:** `main` @ v0.2.0 (tras PRs #97 suscripción · #98 login multi-despacho · #100 header · #101 versionado · #102 multi-moneda)
- **Alcance:** los cambios de esta tanda + regresión del núcleo.

## Metodología (según guías de testing consultadas)

Modelo por capas recomendado para SaaS multi-tenant ([Total Shift Left](https://totalshiftleft.ai/blog/testing-strategy-saas-platforms), [QAwerk](https://qawerk.com/blog/saas-testing-checklist/)) + exploratorio de edge cases y fuzzing de formularios ([BrowserStack](https://www.browserstack.com/guide/exploratory-testing), [testomat.io](https://testomat.io/blog/complete-web-application-testing-checklist/)):

1. **Aislamiento de tenant y auth en cada commit** → suite e2e de RLS/auth en CI.
2. **Flujos núcleo en cada PR** → e2e por feature (suscripción/muro, login multi-despacho, multi-moneda).
3. **Exploratorio + edge cases** → revisión estática dirigida + matriz de escenarios (abajo).

> **Limitación honesta:** el stack local no arranca de forma fiable en esta máquina (Docker `EnableDockerAI`, ver memoria), así que **no hubo click-through con navegador**. El "entorno" de pruebas efectivo es **CI con Postgres 16 real**, que ejecuta TODA la suite e2e en cada PR. Recomiendo, como cobertura adicional, smoke E2E de UI (Playwright) sobre los flujos nuevos cuando el entorno local esté operativo.

## Cobertura automatizada (verde en CI · Postgres 16)

| Suite e2e                | Cubre                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `subscription-wall`      | muro de fin de prueba: vigente→200, caducada→402, `/subscription` y `/auth/me` accesibles, reactivación→200; payload anual (×10) y cupo Fundador |
| `multi-tenant-login`     | alta cross-tenant del mismo email; resolución por contraseña; 401 sin match; selector 409 `chooseTenant`                                         |
| `multi-currency-invoice` | EUR/ES por defecto; USD/RD override; preview por formato (ITBIS 18%); cartera **agrupada por moneda**                                            |
| `reports` (actualizado)  | `aged-receivables` ahora devuelve `byCurrency`                                                                                                   |
| Núcleo (51 specs)        | RLS multi-tenant, ledger, retainer, dunning, pagos, KYC, firmas, etc. → regresión verde                                                          |

**Gate de seguridad:** `pnpm audit --prod` (alta/crítica), gitleaks, CodeQL → verde (corregido advisory **nodemailer** GHSA-p6gq-j5cr-w38f en PR #97).

## Matriz de escenarios exploratorios

| Escenario                                              | Resultado                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| Selector de plazas: borrar el "1" y teclear otro valor | ✅ corregido (PR #97)                                         |
| Toggle mensual/anual + Plan Fundador (carta)           | ✅ implementado; render visual **pendiente de click-through** |
| Login con email en 1 solo despacho                     | ✅ flujo normal con lockout                                   |
| Login con email en 2 despachos, contraseñas distintas  | ✅ entra al correcto                                          |
| Login con misma contraseña en 2 despachos              | ✅ selector de despacho                                       |
| Header: copiar ID de despacho                          | ✅ implementado                                               |
| Aviso "Novedades" tras login (localStorage)            | ✅ implementado                                               |
| Emitir factura EUR/USD/DOP + formato ES/RD             | ✅ backend + UI; PDF según formato                            |
| Cartera vencida con varias monedas                     | ✅ no mezcla (agrupada)                                       |

## Hallazgos para tu aprobación (anotados, NO corregidos)

> Ninguno es bloqueante de la tanda; requieren tu decisión antes de tocarlos.

1. 🔴 **[OPS — acción tuya] Rotar la clave `sk_live` expuesta** y configurar en Fly los secrets: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SEAT`, `STRIPE_PRICE_SEAT_ANNUAL`, `STRIPE_WEBHOOK_SECRET`. Sin `STRIPE_PRICE_SEAT_ANNUAL`, el checkout anual responde 400 (mensaje claro). Ejecutar `scripts/setup-stripe-billing.mjs` con clave **test** en dev.
2. 🟠 **[FISCAL] Combinaciones moneda×formato sin restringir.** Se puede emitir, p. ej., USD con formato ES/Verifactu. Es mecánicamente correcto, pero conviene validar con asesor fiscal qué combinaciones son admisibles y, si procede, restringirlas.
3. 🟠 **[DISEÑO] Retainer/anticipos mono-moneda del tenant.** Un expediente facturado en USD no puede aplicar anticipos si el retainer del despacho es EUR (guard `currencyMismatch`). Decidir si se quiere retainer multi-moneda.
4. 🟡 **[BILLING] Facturación recurrente/anticipos** emiten en moneda y formato del tenant por defecto (no exponen selección como la factura manual). Confirmar si debe poder elegirse también ahí.
5. 🟡 **[UX] Login:** el campo "ID del despacho (opcional)" sigue siempre visible; con el selector automático podría ocultarse tras un enlace "¿problemas para entrar?".
6. 🟡 **[UX] "Novedades"** se muestra también a despachos recién creados (a modo de bienvenida). Confirmar si se prefiere no mostrarlo en el primer login.
7. 🟢 **[Cobertura] Paridad de claves i18n** es-ES/es-DO: añadidas en ambos esta tanda; recomendable un test en CI que verifique paridad de claves.
8. 🟢 **[Cobertura] Smoke E2E de UI** (Playwright) para los flujos nuevos cuando el entorno local esté operativo.
9. 🟢 **[Verificar] Visualización de moneda en el portal del cliente** (listado de facturas del cliente): confirmar que muestra la moneda por factura como ya hace el listado del despacho.

**Conclusión:** la tanda v0.2 está **verde en CI** (todas las suites + seguridad) y mergeada a `main`. Los 9 puntos anteriores quedan anotados para tu revisión; al aprobarlos, los abordo en PRs separados.
