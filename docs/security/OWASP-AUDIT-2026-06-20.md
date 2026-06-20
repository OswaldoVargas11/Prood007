# Auditoría de seguridad OWASP — Lawzora

**Fecha:** 2026-06-20 · **Auditor:** Claude (Claude Code) · **Autorización:** owner (auditoría de su propia app).
**Alcance:** API (NestJS) + Web (Next.js) + Postgres (RLS). Pruebas **dinámicas** contra la API levantada en
local (`http://localhost:4000/api`) + **revisión de código**. Marco: OWASP Top 10 (2021) + WSTG.
**Este documento solo DOCUMENTA; no corrige nada.**

Severidad: 🔴 Alta · 🟠 Media · 🟡 Baja/Informativa · ✅ Control verificado sin hallazgo.

---

## Resumen ejecutivo

La postura de seguridad es **buena**. Los controles críticos para un SaaS multi‑tenant están
**correctamente implementados y verificados dinámicamente**: aislamiento por tenant (RLS), control de
acceso por rol, protección IDOR, validación/expiración de JWT, hashing argon2, HIBP + bloqueo de cuenta,
rate‑limiting, cabeceras helmet completas, verificación de firma del webhook de Stripe y ausencia de
inyección SQL/SSRF.

**No se encontró ninguna brecha crítica explotable de forma remota y anónima.** Sí hay **6 hallazgos** a
corregir, el más relevante el endurecimiento del super‑admin de plataforma y la gestión de secretos
(ambos ya conocidos), más un vector de **XSS almacenado** vía subida de archivos que conviene cerrar.

| #   | Sev | Categoría | Hallazgo                                                                              |
| --- | --- | --------- | ------------------------------------------------------------------------------------- |
| 1   | 🔴  | A07/A04   | Super‑admin de plataforma: contraseña de prueba + sin throttle propio ni lockout      |
| 2   | 🔴  | A02       | Secretos expuestos (chat + historial git): rotar y purgar                             |
| 3   | 🟠  | A05/A03   | XSS almacenado: descargas sin `attachment` + sin allowlist de tipo en subidas         |
| 4   | 🟠  | A06       | Dependencias de producción con CVEs moderate (next-intl, @nestjs/core, file-type, qs) |
| 5   | 🟡  | A03       | Plantilla de email confía en que el caller escape (fragilidad)                        |
| 6   | 🟡  | A05       | Límite de tamaño de body JSON no explícito (default Express 100kb)                    |

---

## A01 · Broken Access Control — ✅ (sin hallazgos)

Pruebas dinámicas (2 despachos A/B + letrado + cliente de portal):

- **Aislamiento por tenant**: A leyendo expediente/timeline de B → **404**; ledger de B → **400**. ✅
- **Rol (vertical)**: LETRADO contra `/users`, `/settings`, `/audit`, `/reports/tax-summary`,
  `/ledger/approvals` → **403** en todos. ✅
- **Authn**: sin token → **401**; token basura → **401**; **JWT con firma alterada → 401**. ✅
- **Búsqueda global**: A buscando datos de B → **0 resultados** (sin fuga cross‑tenant). ✅
- **Portal (horizontal)**: cliente contra endpoints de staff → **403**; subir doc a expediente ajeno → **404**;
  listar SUS expedientes → 200. ✅
- **IDOR de justificantes**: B descargando el justificante de un suplido de A → **404**; A el suyo → 200. ✅
- **Escalada/mass-assignment**: PATCH con campos extra (`tenantId`, `isPlatformAdmin`) → **400**
  (`forbidNonWhitelisted`). ✅

> Base sólida: RLS fail‑closed + guards de rol + DTOs con whitelist. No se logró ningún acceso indebido.

## A02 · Cryptographic Failures — 🔴 (hallazgo #2, externo al código)

- Contraseñas con **argon2** ✅; verificación con `argon2.verify`. Secreto MFA cifrado AES‑256‑GCM (código).
- Respuestas **no filtran** `passwordHash`/`mfaSecret`/`mfaBackupCodes` (`/auth/me`, `/users`). ✅
- JWT: access **15 min**, refresh **7 días** (ventana deslizante), email‑verify 24 h, reto MFA 5 min. ✅
- **🔴 #2 — Secretos expuestos:** durante el desarrollo se pegaron secretos en chat (`rk_live` de Stripe,
  etc.) y quedó una **contraseña de prueba en el historial de git** (commit `ab0f16e`). **Acción:** rotar
  TODOS los secretos (Stripe rk*live/whsec, Fly, Neon, R2, Brevo, Google/Microsoft) y purgar el historial.
  *(Ya documentado en memoria: `secret-in-git-history`, `stripe-live-go-live`.)\_

## A03 · Injection — ✅ / 🟡 (hallazgo #5)

- **SQL**: 0 usos de `$queryRaw`/`$executeRaw`; todo vía Prisma parametrizado (incluida la búsqueda con
  `contains`). ✅
- **XSS web**: 0 usos de `dangerouslySetInnerHTML`; React escapa por defecto. ✅
- **PDF**: generados con pdfkit (texto, sin HTML) → sin vector de inyección. ✅
- **🟡 #5 — Plantilla de email:** `renderEmail` inserta `paragraphs`/`heading`/`label` como HTML y
  **confía en que el caller escape** (hoy lo hacen con `escapeHtml`). Si un caller futuro olvida escapar,
  hay XSS en el correo. **Acción:** escapar de forma centralizada o usar un tipo `SafeHtml`.

## A04 · Insecure Design — ✅ (ver #1 en A07)

- Flujo de aprobación de costes (letrado propone → admin aprueba) correcto; propuesto no mueve saldo. ✅
- Cobro por plaza con prorrateo inmediato validado en pruebas previas. ✅
- Endurecimiento del super‑admin: ver hallazgo #1.

## A05 · Security Misconfiguration — 🟠 (hallazgo #3) + ✅

- **Cabeceras (helmet)**: CSP, **HSTS** (1 año, includeSubDomains), X‑Frame‑Options SAMEORIGIN,
  X‑Content‑Type‑Options **nosniff**, COOP, CORP, Referrer‑Policy no‑referrer, sin `X-Powered-By`. ✅
- **CORS en producción**: `CORS_ORIGINS` **sí está fijado en fly secrets** (no usa el reflejo `origin:true`
  de desarrollo). ✅
- **Errores**: no filtran stack trace ni rutas internas. ✅ **/health**: mínimo (status/service/time). ✅
- **🟠 #3 — XSS almacenado vía subida de archivos:**
  - La descarga de documentos (`documents.controller`) responde con `Content-Type: <mimeType subido>` y
    **sin `Content-Disposition`** → un archivo **HTML subido** se serviría _inline_ en el origen
    `api.lawzora.com`. Mi endpoint de justificante usa `disposition: inline` (mismo riesgo).
  - **No hay allowlist de mimetype/extensión** en las subidas (documentos, justificantes, portal); solo
    límite de tamaño.
  - Riesgo: stored‑XSS en el origen de la API (que sí tiene la cookie httpOnly de refresh) → un script
    podría renovar sesión y llamar a la API. **Mitigado parcialmente** por la CSP de helmet
    (`script-src 'self'` bloquea inline) y `nosniff`, pero **no se debe confiar solo en eso**.
  - **Acción:** (a) forzar `Content-Disposition: attachment` en todas las descargas de ficheros subidos
    (justificante incluido), (b) allowlist de mimetype en la subida, (c) opcional: servir adjuntos desde
    un dominio aislado (sandbox).

## A06 · Vulnerable & Outdated Components — 🟠 (hallazgo #4)

`pnpm audit --prod` (solo runtime) reporta CVEs **moderate**:

- **next-intl** — open redirect + prototype pollution (dep de la web, runtime).
- **@nestjs/core** — "Improperly Neutralizes Special Elements".
- **file-type** (vía `@nestjs/common`) — DoS (bucle infinito en parser ASF / bomba de descompresión ZIP);
  relevante porque aceptamos subidas (mitigado por límites de tamaño).
- **qs** — DoS por `stringify`.
- (El resto de avisos son de **dev‑deps**: vitest, vite, esbuild, glob, tmp, picomatch — sin impacto en
  producción.)
- **Acción:** actualizar dependencias (next-intl y `@nestjs/*` primero); reejecutar `pnpm audit --prod`.
  Ninguna es crítica.

## A07 · Identification & Authentication Failures — 🔴 (hallazgo #1) + ✅

- **Política de contraseñas + HIBP**: registro con `Password123!` (comprometida) → **400**; con `short` →
  **400**. ✅
- **Bloqueo de cuenta (lockout)**: tras 8 fallos, **la contraseña correcta también devuelve 401** (cuenta
  bloqueada). ✅
- **Rate‑limit en login**: ráfaga de intentos → **429** (ThrottlerGuard global + `@Throttle` en auth). ✅
- **Verificación de email** anti‑bots implementada. ✅
- **🔴 #1 — Super‑admin de plataforma (`POST /platform/auth/login`):**
  - Compara `PLATFORM_ADMIN_EMAIL`/`PLATFORM_ADMIN_PASSWORD` con `timingSafeEqual` (constante) ✅, pero:
  - El password es un **valor de prueba conocido** (pendiente de rotar, ya anotado) y se compara en claro
    desde env (sin argon2 — aceptable para un secreto compartido, pero su fortaleza es todo).
  - **No tiene `@Throttle` propio ni lockout** (el lockout es solo para cuentas de usuario en BD); depende
    del límite global (300/min), insuficiente para una credencial que **concede control de plataforma**.
  - **Acción:** (a) fijar un `PLATFORM_ADMIN_PASSWORD` fuerte y único, (b) `@Throttle` estricto en el login
    de plataforma (p. ej. 5/min), (c) considerar lockout/alerta y, a futuro, MFA para el super‑admin.

## A08 · Software & Data Integrity Failures — ✅

- **Webhook de Stripe**: `webhooks.constructEvent(rawBody, signature, secret)` → **firma verificada**;
  rechaza (400) si falta `rawBody` o `stripe-signature`. `rawBody:true` preservado en `main.ts`. ✅
- Cadena de huellas fiscal (Verifactu) encadenada (`previousRecordHash`). ✅

## A09 · Security Logging & Monitoring Failures — ✅ / 🟡

- `AuditService` registra acciones sensibles (creación/edición/aprobación, etc.). ✅
- El **token/enlace de reset NO se registra** en el provider SMTP de producción (solo el Noop de dev, a
  nivel debug). ✅
- 🟡 Recomendación: añadir alerta/observabilidad sobre eventos de seguridad (lockouts, login de plataforma,
  cambios de rol) — hoy quedan en auditoría pero sin alertado activo.

## A10 · Server-Side Request Forgery (SSRF) — ✅

- Todas las llamadas `fetch` salientes usan **URLs fijas** (HIBP k‑anon, endpoints de token OAuth de los
  providers, Google Calendar/Gmail). **Ninguna toma una URL controlada por el usuario.** ✅

---

## Anexo: pruebas ejecutadas

Entorno: API en `node dist/main.js` (puerto 4000) contra Postgres local; fixtures creados vía
`POST /auth/register-tenant` (despachos A/B), `POST /users` (letrado), `POST /clients/:id/portal-user`
(cliente de portal). Sondas con `curl` comprobando códigos de estado y forma de respuesta.

Resumen de resultados dinámicos: aislamiento tenant (404/400), rol (403×5), authn (401×3 incl. JWT
manipulado), búsqueda sin fuga (0), portal (403/404/200), IDOR justificante (404 vs 200),
mass‑assignment (400), HIBP (400×2), lockout (401 tras correcta), throttle login (429), cabeceras helmet
(8 presentes), sin stack trace, sin secretos en respuestas, webhook con verificación de firma.

**Pendiente de re‑test tras corregir:** #3 (forzar attachment + allowlist), #1 (throttle plataforma),
#4 (`pnpm audit --prod` limpio).
