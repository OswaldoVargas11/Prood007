# Auditoría de seguridad integral — Lawzora / LegalFlow

**Fecha:** 2026-06-23 · **Auditor:** Claude (Claude Code), 10 revisores especializados en paralelo + análisis estático.
**Autorización:** owner (auditoría de su propia aplicación).
**Alcance:** API (NestJS, 57 controladores) + Web (Next.js 15) + Postgres (RLS) + CI/CD (GitHub Actions) + infra (Fly/Docker/R2).
**Marcos aplicados:** OWASP Top 10 (2021), OWASP API Security Top 10 (2023), OWASP ASVS, CWE Top 25.
**Método:** revisión de código + análisis estático (`pnpm audit`, gitleaks, grep dirigido). Foco extra en los módulos nuevos
posteriores a la auditoría previa (`docs/security/OWASP-AUDIT-2026-06-20.md`): closing, data-room, company-secretary,
document-packages, engagement, retainer, kyc, subscription/entitlements (#155), inbound-email, signatures, landing "Sello".

> **Este documento DOCUMENTA los hallazgos.** El estado de remediación de la pasada del 2026-06-23 está al final.

Severidad: 🔴 Crítica · 🟠 Alta · 🟡 Media · ⚪ Baja/Info · ✅ Control verificado sin hallazgo.

---

## Resumen ejecutivo

La postura de seguridad sigue siendo **sólida**. La arquitectura base reconfirma todos los controles fuertes de las
auditorías previas: aislamiento multi-tenant fail-closed (RLS + scoping explícito), guards globales de auth/rol/entitlements,
JWT con algoritmo fijado, argon2id, cifrado AES-256-GCM correcto, verificación de firma en **todos** los webhooks de entrada,
y cero inyección SQL/SSRF/XSS explotable. Los 4 hallazgos ALTOS de la auditoría anterior (IDOR WebSocket, path traversal,
self-approval, carrera de plazas en `createStaff`) **siguen corregidos y aguantan**.

**No hay ninguna brecha crítica explotable de forma remota y anónima.** El único hallazgo **CRÍTICO** es operativo, no de
código: hay un fichero con **todos los secretos de producción en claro en el disco de trabajo** (incl. la clave maestra de
cifrado y el token de despliegue de Fly que el propio owner ya marcó como filtrado). Lo demás son hallazgos de **endurecimiento**
en código nuevo que no cubrían las pasadas anteriores: dos carreras de concurrencia en lógica de facturación, falta de freno de
fuerza bruta en el **segundo factor** MFA, abuso de coste en los endpoints de IA, y una allowlist de subida que solo se cableó
en una de cinco rutas.

| #   | Sev | Marco          | Hallazgo                                                                                           | Acción        |
| --- | --- | -------------- | -------------------------------------------------------------------------------------------------- | ------------- |
| C1  | 🔴  | A02 / CWE-312  | Secretos de PROD en claro en disco (`.env.production` + `.env.bak.*`): clave maestra, Fly, Stripe… | owner+código  |
| H1  | 🟠  | A04 / CWE-362  | Carrera en el webhook que concede el plan Fundador → supera el cupo de 18                          | código        |
| H2  | 🟠  | A07 / CWE-307  | El **segundo factor** (TOTP) no tiene lockout ni tope de intentos por cuenta                       | código        |
| H3  | 🟠  | API4 / CWE-770 | Endpoints de IA sin cuota/throttle por tenant → abuso de coste del `ANTHROPIC_API_KEY`             | código        |
| H4  | 🟠  | A05 / CWE-434  | Allowlist de tipo de archivo solo en justificantes; portal/data-room/docs aceptan cualquier byte   | código        |
| H5  | 🟠  | CI / CWE-829   | Acciones de terceros en GitHub Actions ancladas a tags mutables, no a SHA                          | config        |
| M1  | 🟡  | A04 / CWE-362  | Bypass de licencia de plazas vía `updateStaff` (reactivar/promover) sin lock                       | código        |
| M2  | 🟡  | A01 / CWE-352  | Falta el check de `Origin` (anti-CSRF) en login/register/mfa/social/change-password del BFF        | código        |
| M3  | 🟡  | API3 / CWE-213 | El portal del cliente expone el `Matter` completo (incl. `budgetAmount`, `opposingCounsel`)        | código        |
| M4  | 🟡  | A07 / CWE-522  | Super-admin de plataforma: token en `sessionStorage`, mismo secreto JWT, sin MFA ni lockout        | código(parc.) |
| M5  | 🟡  | A05 / CWE-1021 | CSP del web solo `frame-ancestors` (sin `script-src`)                                              | diferido      |
| M6  | 🟡  | CI / CWE-94    | El workflow de triaje IA aplica la frontera de rutas prohibidas solo por prompt, no mecánicamente  | config        |
| M7  | 🟡  | A06 / CWE-1104 | Majors diferidos: next-intl 3→4 (open-redirect/proto-pollution) y NestJS 10→11 (moderate)          | migración     |
| M8  | 🟡  | A07 / CWE-203  | Enumeración de usuarios por timing en `forgot-password` + no-op silencioso multi-tenant            | código        |
| L1+ | ⚪  | varios         | 18 hallazgos Baja/Info de endurecimiento (ver detalle)                                             | código        |

`pnpm audit --prod --audit-level high` → **limpio** (0 high/critical). 8 advisories restantes: 2 low + 6 moderate (dev-deps + los
majors diferidos de M7). El gate de CI sigue verde por diseño.

---

## 🔴 CRÍTICO

### C1 — Secretos de producción en claro en el disco de trabajo

**A02 · CWE-312 (Cleartext Storage) / CWE-798**

- **Ficheros:** `apps/api/.env.production` y `apps/api/.env.bak.1781873883`.
- **Verificado:** ambos existen en el working tree, están **gitignored** y **NO** están en el historial de git (✅ no hay fuga por
  el repo). Pero contienen, en claro, el set completo de credenciales **live**:
  - `DATA_ENCRYPTION_KEY` — la clave maestra AES-256 que protege **todo** lo cifrado en reposo (contraseña del `.p12` DGII,
    secretos MFA, tokens OAuth de Google/MS, documentos cifrados). Su compromiso anula todo el cifrado at-rest.
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — forja total de sesiones.
  - 3 contraseñas de Postgres (Neon) incl. el rol owner; `STORAGE_SECRET_KEY` (R2); `SMTP_PASS` (Brevo).
  - `FLY_API_TOKEN` (`FlyV1 fm2_…`) — control del despliegue de producción. **El propio comentario del fichero dice "PENDIENTE:
    token NUEVO (revoca el filtrado)"** → ya se sabe que un token de Fly se filtró y no se ha rotado.
  - `PLATFORM_ADMIN_PASSWORD` — la del super-admin (valor conocido/adivinable, ya señalado en la auditoría previa).
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SIGNATURE_WEBHOOK_SECRET`.
- **Riesgo:** cualquier proceso, paso de build o agente con acceso de lectura al disco obtiene compromiso total: BD, storage,
  pipeline de despliegue, todos los datos cifrados, todas las sesiones y el super-admin.
- **Remediación:**
  1. **Borrar** `apps/api/.env.production` y `.env.bak.*` del working tree (los secretos de prod viven SOLO en Fly secrets).
  2. **Rotar TODO** lo que contiene: `DATA_ENCRYPTION_KEY` (requiere re-cifrar lo at-rest → migración planificada), ambos
     secretos JWT, las 3 contraseñas Neon, claves R2, SMTP Brevo, el token de Fly (vencido), `PLATFORM_ADMIN_PASSWORD`,
     y las claves/secretos de Stripe.
  3. Añadir `*.bak.*` al `.gitignore` y confirmar que no quedan backups.

> Esto es la continuación directa del hallazgo #2 de la auditoría previa ("rotar secretos"), que sigue **genuinamente abierto** y
> es la acción individual más importante. La ingeniería criptográfica del código es correcta; el riesgo real está en la operación.

---

## 🟠 ALTAS

### H1 — Carrera en la concesión del plan Fundador → supera el cupo de 18

**A04 · CWE-362 (TOCTOU)** · `apps/api/src/subscription/stripe-billing.service.ts:369-383` (`applySubscription`)
El webhook que **concede** el beneficio Fundador hace `count(isFounder=true)` y, si `taken < FOUNDER_CAP`, escribe
`isFounder=true, founderNumber=taken+1` **sin lock ni transacción**. Dos checkouts Fundador cuyos webhooks lleguen concurrentes
leen ambos `taken=17` y ambos confirman como #18 → cupo superado y `founderNumber` duplicado. El check de `createCheckout:179`
es solo informativo (los Checkout de Stripe se completan en paralelo / se reintentan).
**Fix:** envolver el read-modify-write en transacción con `pg_advisory_xact_lock` sobre un namespace global de fundador,
re-contar dentro del lock, y añadir índice único en `founderNumber` como red de seguridad.

### H2 — El segundo factor (TOTP) no tiene lockout ni tope por cuenta

**A07 · CWE-307** · `auth.service.ts:211-222` (`mfaLogin`) → `mfa.service.ts:108-155` (`verifyForLogin`)
Tras una contraseña correcta, el atacante tiene un `mfaToken` válido (TTL 5 min) y postea a `/auth/mfa/login`. La verificación
TOTP **no toca** `failedLoginAttempts`/`lockedUntil` (el lockout vive solo en el paso de contraseña). El único freno es
`@Throttle(10/min)` por IP. Con ventana TOTP de ±1 periodo (~90 s, 3 códigos válidos) y un pool pequeño de IPs durante la vida del
reto, un atacante con la contraseña filtrada tiene intentos significativos contra un código de 6 dígitos **sin freno por cuenta y
sin alerta**. (Los backup codes son de 40 bits → seguros; el riesgo es el adivinado de TOTP en vivo.)
**Fix:** contar fallos de MFA en la fila del usuario y bloquear/cortocircuitar tras N (p. ej. 5); invalidar el `mfaToken` tras el
primer fallo o limitar intentos-por-reto a 1-3; emitir alerta de auditoría en lockout de MFA.

### H3 — Endpoints de IA sin cuota/throttle por tenant → abuso de coste

**API4 · CWE-770** · `apps/api/src/ai/ai.controller.ts:31-82`, `ai.service.ts:71-112`
Todos los `/ai/*` (`ask`, `summary`, `summarize`, `draft`, `email/draft`, `search`, `index`) están protegidos solo por rol +
el throttle global (300/min). **No hay `@Throttle` propio ni presupuesto de tokens/coste por tenant.** Un usuario staff (o una
cuenta comprometida) puede lanzar hasta 300 completions/min contra el `ANTHROPIC_API_KEY` compartido. El input está acotado
(prompts `@MaxLength(2000)`) y el output a 8192 tokens, pero el coste se multiplica por volumen sin techo. El peor caso es
`summarizeDocument`, que envía adjuntos de hasta **8 MB** (~11 MB base64) por llamada.
**Fix:** `@Throttle` estricto en las rutas de IA (p. ej. 10-20/min) **y** un presupuesto diario de tokens/coste por tenant
persistido y aplicado en `AiService` antes de llamar al motor.

### H4 — La allowlist de tipo de archivo solo está en justificantes; el resto acepta cualquier byte

**A05/A04 · CWE-434 (Unrestricted Upload)** · `common/safe-download.ts:40` (`sniffSafeUploadType`)
El validador de magic-bytes existe pero se invoca en **un solo** sitio: `ledger.service.ts:555` (justificantes). El pipeline
general `DocumentsService.persistVersion` (`documents.service.ts:101`) **no valida tipo** y lo reutilizan:

- `portal.service.ts:81` — **subidas del cliente del portal** (externo, no confiable): puede subir `evil.html`/`.svg`.
- `data-room.service.ts:258` (`uploadDocument`) — sin check.
- `settings.controller.ts:55` (logo/certificado del despacho) — sin check.
  La contención hoy depende por completo de `safeContentDisposition` en la descarga (que fuerza `attachment`) + la CSP de helmet.
  Es defensa en una sola capa, contraria a la propia recomendación "(b) allowlist de mimetype en la subida" de la auditoría previa.
  **Fix:** aplicar `sniffSafeUploadType` (o una allowlist más amplia documentada: pdf/docx/xlsx/imágenes) en `persistVersion` y en
  `data-room uploadDocument`, rechazando si el magic-byte no casa con el mimetype declarado.

### H5 — Acciones de terceros en GitHub Actions ancladas a tags mutables, no a SHA

**Supply-chain · CWE-829** · todos los workflows
`gitleaks/gitleaks-action@v3` (`ci.yml:204`), `anthropics/claude-code-action@v1` (`fiscal-conformance-triage.yml:52`,
`improvement-scout.yml:35`), `pnpm/action-setup@v4`, `actions/setup-node@v4` (`.github/actions/setup/action.yml`),
`actions/setup-python@v5` (`semgrep.yml:30`). Los refs `@vN` son mutables: un compromiso o re-apuntado del tag ejecuta código
del atacante **dentro del job `triage`, que tiene `contents: write` + `pull-requests: write` + `CLAUDE_CODE_OAUTH_TOKEN`**. Repo
público → el vector importa.
**Fix:** anclar todas las acciones de terceros (no `actions/*`) a SHA de commit completo con comentario de versión; dejar que
Dependabot (ya configurado para `github-actions`) suba los SHA. Prioridad: gitleaks, claude-code-action, pnpm/action-setup.

---

## 🟡 MEDIAS

### M1 — Bypass de licencia de plazas vía `updateStaff` (sin lock)

**A04 · CWE-362** · `apps/api/src/users/users.service.ts:188-203`
El fix previo añadió `pg_advisory_xact_lock(1, tenant)` solo a **`createStaff`**. Pero `updateStaff` también consume plaza al
**reactivar** un usuario desactivado o **promover** LAWYER→FIRM_ADMIN, y hace el check `countActive >= max` como check-then-act
sin lock, en una transacción que nunca toma el espacio de lock 1. Reactivaciones concurrentes (o un `createStaff` + un
`updateStaff` a la vez) superan las plazas pagadas.
**Fix:** mover el check de disponibilidad **dentro** de la `tenantTransaction` y tomar `pg_advisory_xact_lock(1, hashtext(tenantId))`
arriba, igual que `createStaff`.

### M2 — Falta el check de `Origin` (anti-CSRF) en varias rutas BFF que mutan sesión

**A01 · CWE-352** · `apps/web/src/app/api/auth/{login,register-tenant,mfa/login,social/finish,change-password}/route.ts`
`refresh/route.ts:19` y `logout/route.ts:8` sí llaman `isCrossOrigin(req)`, pero los demás handlers que ponen cookies de sesión
no. Vector concreto: **login-CSRF / fijación de sesión** — una página maliciosa autoenvía credenciales del atacante a
`/api/auth/login` y planta su `lf_session` en el navegador de la víctima. Mitigado en parte por `Content-Type: application/json`
(fuerza preflight CORS) y cookies `SameSite=Lax`.
**Fix:** aplicar el guard `isCrossOrigin(req)` de forma uniforme a todos los handlers BFF que cambian estado.

### M3 — El portal del cliente expone el objeto `Matter` completo

**API3 · CWE-213 (Excessive Data Exposure)** · `apps/api/src/portal/portal.service.ts:43-54` (`listMatters`/`getMatter`)
Ambos hacen `findMany/findFirst` **sin `select:`**, devolviendo todas las columnas de `Matter` al cliente del portal — incluido
`budgetAmount` (el presupuesto de honorarios interno del despacho) y `opposingCounsel`. Datos internos no destinados al cliente.
**Fix:** `select:` explícito en ambas lecturas del portal, exponiendo solo campos apropiados (referencia, título, tipo, estado,
fechas, nombre del letrado).

### M4 — Super-admin de plataforma: token en `sessionStorage`, mismo secreto JWT, sin MFA ni lockout

**A07 · CWE-522/1004** · `apps/web/src/lib/platform.ts:10-23`, `apps/api/src/platform/platform-auth.controller.ts:55-61`
El token de plataforma (BYPASSRLS cross-tenant) se guarda en `sessionStorage` (exfiltrable por XSS, no httpOnly), se firma con el
**mismo `JWT_ACCESS_SECRET`** que los usuarios (distinto solo por el claim `platform:true`), es **stateless** (sin jti/denylist →
no revocable antes de las 8 h), y no tiene MFA ni lockout (el throttle 5/min sí está). Cualquier stored-XSS en el origen web
levanta el token → control total de tenants hasta 8 h.
**Fix (parcial ya hacible):** firmar el token de plataforma con un secreto dedicado (`PLATFORM_JWT_SECRET`) y exigirlo en el guard;
añadir lockout + alerta en el login de plataforma. **Diferido:** mover a BFF con cookie httpOnly + refresh propio; MFA; jti/denylist.

### M5 — CSP del web solo `frame-ancestors` (sin `script-src`)

**A05 · CWE-1021** · `apps/web/next.config.mjs:13`
Clickjacking cerrado, pero sin política `script-src`/`default-src` el web no tiene defensa-en-profundidad ante XSS (no se halló
ningún sink de XSS, así que es defensa adicional). Item ya diferido: requiere cableado de nonces + pruebas en navegador/staging.
**Fix:** añadir `script-src` con nonce, validado en staging.

### M6 — El workflow de triaje IA aplica la frontera de rutas prohibidas solo por prompt

**CI · CWE-94/77** · `.github/workflows/fiscal-conformance-triage.yml:29-94`
Bien: el `if` (líneas 29-31) restringe el job a ramas del mismo repo (los fork-PR no lo disparan) y `--allowedTools` está acotado.
Residual: el modelo ingiere contenido de `*.actual.json` derivado del código del PR; una rama interna maliciosa podría inyectar
texto para guiar al agente dentro de sus tools `git`+`gh` (incluye `git push` y `gh pr create`). La allowlist de rutas es a nivel
de prompt, no aplicada mecánicamente.
**Fix:** (a) verificar mecánicamente post-run (`git diff --name-only`) que no cambió ninguna ruta protegida y fallar el job si sí;
(b) tratar `.actual.json` como dato no confiable; (c) considerar quitar `contents: write` y que el agente solo abra issues.

### M7 — Majors diferidos con CVEs moderate: next-intl 3→4, NestJS 10→11

**A06 · CWE-1104/1395** · `apps/web/package.json` (next-intl ^3.26 → 3.26.5), `apps/api/package.json` (@nestjs ^10.4)
next-intl v3 arrastra open-redirect + prototype-pollution; `@nestjs/core` v10, "improper neutralization". Son **moderate** y el
gate de CI es `--audit-level high`, así que pasan por diseño, pero siguen sin remediar. La web no tiene hoy un sink reachable del
open-redirect de next-intl (verificado por el revisor web), pero la deuda persiste.
**Fix:** planificar las migraciones dedicadas (breaking) y reejecutar `pnpm audit --prod --audit-level moderate` después.

### M8 — Enumeración por timing en `forgot-password` + no-op silencioso multi-tenant

**A07 · CWE-203** · `apps/api/src/auth/password-reset.service.ts:119-136`
La respuesta es siempre 200 genérico ✅, pero cuando hay exactamente un usuario, hace `createToken` + `await sendPasswordReset`
síncronos antes de responder; la rama sin match retorna de inmediato → diferencia de tiempo medible que filtra existencia.
Además, un email registrado en varios despachos (`users.length !== 1`) **nunca** puede auto-resetear (no-op silencioso).
**Fix:** enviar el correo fuera de banda (fire-and-forget/cola) para tiempo constante; cuando haya múltiples matches, enviar un
enlace por cuenta (cada token ligado a su userId).

---

## ⚪ BAJAS / INFORMATIVAS (endurecimiento)

- **L1** ⚪ A01/CWE-639 — `closing.service.ts:222-249`: `assigneeId`/`documentId` son escalares sin scoping; un staff puede guardar
  un id de otro tenant (puntero colgante, no exfiltrable porque la lectura re-scopea). _Fix:_ validar con `findFirst({id, tenantId})`.
- **L2** ⚪ A01/CWE-639 — `kyc.service.ts:30-51`: lectura/escritura de KYC keyed solo por `clientId` (seguro hoy por el assert
  previo; latente si se reordena). _Fix:_ `findFirst({clientId, tenantId})`.
- **L3** ⚪ BOPLA/CWE-915 — `leads.service.ts:71`: `data: { ...dto }` (mitigado por `forbidNonWhitelisted`; frágil). _Fix:_ destructurar.
- **L4** ⚪ A01/CWE-863 — `ledger.service.ts:646`: `rejectCost` no bloquea al auto-proponente (asimetría de SoD; sin valor financiero).
- **L5** ⚪ A04/CWE-362 — `ledger.service.ts:637-656` (`resolveApproval`): el `updateMany` no re-asserta `approvalStatus: PROPOSED`
  → doble-resolve teórico (impacto bajo). _Fix:_ condicionar el `where` al estado y tratar 0-filas como "ya resuelto".
- **L6** ⚪ CWE-918-adj/A03 — `microsoft.service.ts:347,450,495,507`: interpola `driveId`/`itemId`/`externalId` crudos en URLs de
  Graph (host fijo, token del propio usuario → no explotable; inconsistente con Google que sí codifica). _Fix:_ `encodeURIComponent`.
- **L7** ⚪ A03 — `import-cloud-document.dto.ts`: ids cloud validados solo por longitud. _Fix:_ `@Matches(/^[\w!.\-]+$/)`.
- **L8** ⚪ CWE-400 — multer por defecto usa `memoryStorage`: cada subida (hasta 25 MB) se bufferiza entera en RAM + copias de
  hash/AES; subidas grandes concurrentes en una sola instancia Fly pueden agotar memoria. El cap de cloud-import (`documents.service.ts:155`)
  se comprueba **después** de descargar el buffer entero. _Fix:_ cap de bytes en vuelo por tenant; pre-check de `Content-Length`.
- **L9** ⚪ CWE-434 — **sin antivirus/escaneo de malware** en ninguna ruta; clientes del portal suben ficheros que el staff descarga.
  _Fix:_ sidecar ClamAV o cola de escaneo (recomendado para un SaaS legal).
- **L10** ⚪ CWE-770 — sin cuota total de almacenamiento por tenant. _Fix:_ cuota por `tenantId`.
- **L11** ⚪ CWE-409 — `data-room/watermark.ts:11`: parsea PDFs no confiables con pdf-lib en cada descarga (superficie de DoS de
  parser; mitigado por cap 25 MB + try/catch). _Watch item._
- **L12** ⚪ API4/CWE-770 — listas sin `take` (portal matters/docs/tasks/invoices; leads; documents; data-room; clauses; snippets;
  templates; saved-views; payments). Todas tenant/RLS-scoped (no fuga cross-tenant), pero sets sin cota. _Fix:_ helper de paginación
  con MAX pageSize.
- **L13** ⚪ API4 — `import.service.ts:233-250`: `commitClients` hace `create` secuencial por fila en la request (sin `createMany`
  ni cota de filas; admin-only). _Fix:_ cota de filas + `createMany`/lotes; alinear el `@MaxLength(2_000_000)` del DTO con el body de 512 kb.
- **L14** ⚪ A07/CWE-294 — `tokens.service.ts:57-76`: el `mfaToken` es stateless, no single-use ni invalidado tras éxito (oráculo
  replayable durante 5 min, agrava H2). _Fix:_ jti single-use, consumir al primer intento.
- **L15** ⚪ A07/CWE-613 — `tokens.service.ts:142-191` (`rotate`): la rotación de refresh no compara contra `passwordChangedAt`
  (cubierto en la práctica por `revokeAllForUser` en cambio de contraseña; borde de carrera). _Fix:_ rechazar familias previas a `passwordChangedAt`.
- **L16** ⚪ A07/CWE-521 — política de contraseñas solo `MinLength(10)`; la fuerza real depende de HIBP, que está **off por defecto**
  (`HIBP_ENABLED !== 'true'`) y es **fail-open** ante error HTTP. _Fix:_ confirmar `HIBP_ENABLED=true` en prod; añadir zxcvbn como fallback offline.
- **L17** ⚪ A04/CWE-602 — KYC es 100% auto-atestiguado y **nada en billing/engagement/retainer consulta el estado KYC**: un cliente
  RECHAZADO o de alto riesgo se puede facturar igual. _Fix (si AML debe bloquear):_ gate de aceptación/primera factura por `kyc.status===APPROVED`.
- **L18** ⚪ CI/CWE-829 — CODEOWNERS no cubre `package.json`/`pnpm-lock.yaml`/`.npmrc`: un PR que afloje un override o añada un
  `ignoreGhsas` puede mergear en verde sin revisión del owner. _Fix:_ añadir esas rutas a CODEOWNERS.
- **L19** ⚪ A05 — comentario obsoleto en `package.json:54` (referencia un override de `next` que no existe; `next` ya es dep directa
  parcheada). _Fix:_ corregir el comentario.
- **L20** ⚪ A05 — `seed-demo-firms.mjs` apunta a PROD por defecto (CLI, no endpoint; ya conocido, PR #157 propone `--production`).

---

## ✅ Controles verificados sólidos (sin hallazgo)

**Acceso / multi-tenant:** guards globales `JwtAuthGuard`+`RolesGuard`+`EntitlementsGuard` (`auth.module.ts:51-53`); RLS fail-closed
por `AsyncLocalStorage` + `set_config('app.tenant_id')` en cada op (`prisma.service.ts`); crons enumeran tenants vía cliente system y
corren cada uno en `runWithTenant`; portal con `assertMatterAccess` (CLIENT exige `matter.client.userId === user.userId`); IDOR de
WebSocket cerrado (`realtime.gateway.ts:61-79`); mass-assignment bloqueado por `ValidationPipe({whitelist, forbidNonWhitelisted})`;
`@RequiresFeature` a nivel de clase en todos los módulos gated (entitlements server-side reales, no solo UI).

**Auth/cripto:** JWT con `algorithms:['HS256']` en cada verify; sin fallback `dev-secret` (getOrThrow); access 15 min / refresh 7 d
deslizante + 30 d absoluto, rotación single-use con detección de reuso que revoca la familia; lockout de contraseña (5 fallos→15 min);
decoy argon2 anti-timing en login; MFA AES-256-GCM + anti-replay TOTP (`lastTotpCounter`) + backup codes argon2; tokens de reset
256-bit, sha256-stored, single-use; login social valida `aud`/`exp`; cookie de sesión httpOnly+SameSite+Secure; refresh nunca llega al cliente.

**Cripto en reposo:** AES-256-GCM autenticado, **IV aleatorio de 12 bytes por cifrado** (sin reuso), `authTagLength` explícito,
versión MAGIC, clave de 32 bytes validada, sin ECB, sin `Math.random()` en rutas de seguridad; `.p12` DGII + password, secretos MFA,
tokens OAuth Google/MS todos cifrados; respuestas nunca serializan `passwordHash`/`mfaSecret`/`mfaBackupCodes`.

**Config/integridad:** helmet (CSP `script-src 'self'`, HSTS 1 año, nosniff, XFO, COOP/CORP, sin X-Powered-By); CORS fail-closed en
prod; body 512 kb explícito; **todos los webhooks de entrada verifican firma/secreto/token y fallan cerrado** (Stripe×2 `constructEvent`,
Signaturit HMAC `timingSafeEqual`, inbound-email doble gate secreto+HMAC, intake/data-room token inadivinable, OAuth callbacks con
`state` HMAC); **no existe ningún webhook de entrada sin autenticar**; DGII y LexNET son pull saliente, no callbacks; Dockerfiles
corren `USER node` (no root), `.dockerignore` excluye `.env*`; debug endpoint 404 salvo `SENTRY_DEBUG_KEY`; health mínimo; sin stack
traces en respuestas; cadena de huellas Verifactu encadenada de verdad (`SHA256(...|previousRecordHash)`).

**Inyección/SSRF/XSS:** 0 `$queryRawUnsafe`/`Prisma.raw`; todo raw query parametrizado; **ningún host de salida es controlado por el
usuario** (cloud-import codifica/encapsula los ids; redirect 302 de Graph descarta `Authorization` cross-origin); 0
`dangerouslySetInnerHTML`/`eval`/`new Function` en web; descargas con `Content-Disposition: attachment`+`nosniff` (svg excluido del
inline); templates por sustitución de mapa cerrado (sin engine/SSTI); Gmail strip CRLF anti header-injection; sin open redirect (todos
los `res.redirect` desde base de config + ruta fija).

**Supply-chain/CI:** `permissions` least-privilege en cada workflow; **sin `pull_request_target`**; fork-PR bloqueado del triaje IA;
`--frozen-lockfile`; workspaces `@legalflow/*` privados (sin dependency-confusion); `ignoreGhsas: []` (nada enmascarado); los 5
overrides verificados efectivos en el lockfile; husky/commitlint solo tooling propio; gate `pnpm audit --prod --audit-level high` limpio.

**API abuse:** throttling en todos los flujos auth sensibles (login 10/min, change-password 5/min, reset 5/min, intake 5/min,
platform 5/min); search hard-cap `take:8`; semantic search cap 5000 vectores; paginación con MAX 100 en clients/matters/audit;
sin ReDoS (regexes lineales); sin endpoint de mass-email/bulk-invite expuesto.

---

## Plan de remediación priorizado

**Acción del owner (no es código):**

- **C1** — Borrar `apps/api/.env.production` + `.env.bak.*` del disco y **rotar todos los secretos** (clave maestra de cifrado, JWT,
  Neon ×3, R2, Brevo, **token de Fly ya filtrado**, `PLATFORM_ADMIN_PASSWORD`, Stripe). La rotación de `DATA_ENCRYPTION_KEY` necesita
  un plan de re-cifrado at-rest.
- Confirmar `HIBP_ENABLED=true` en Fly secrets (**L16**).

**Corregibles en código ahora (orden sugerido):**

1. 🟠 H1, M1 — locks de concurrencia en Fundador y `updateStaff` (revenue/integridad).
2. 🟠 H2 (+L14) — lockout del segundo factor MFA.
3. 🟠 H3 — `@Throttle` + cuota por tenant en `/ai/*`.
4. 🟠 H4 — generalizar la allowlist de subida (portal + data-room + documents).
5. 🟡 M2 — `isCrossOrigin` en todos los handlers BFF que mutan sesión.
6. 🟡 M3 — `select:` en las lecturas del portal.
7. 🟡 M4 (parcial) — `PLATFORM_JWT_SECRET` dedicado + lockout/alerta en login de plataforma.
8. 🟡 M8 — correo de reset fuera de banda + reset multi-tenant.
9. ⚪ L1-L7, L12, L18, L19 — endurecimientos rápidos (scoping explícito, `encodeURIComponent`, paginación, CODEOWNERS).

**Config/CI:**

- 🟠 H5 — anclar acciones de terceros a SHA.
- 🟡 M6 — enforcement mecánico de rutas prohibidas en el triaje IA.

**Migraciones dedicadas (fuera de una pasada de hardening):**

- 🟡 M7 — next-intl 3→4, NestJS 10→11.
- 🟡 M5 — CSP completa con nonces (requiere navegador/staging).
- 🟡 M4 (resto) — BFF de plataforma con cookie httpOnly + MFA del super-admin.
- ⚪ L9 — antivirus para subidas del portal.

---

## Estado de remediación — pasada 2026-06-23 (rama `security/hardening-2026-06-23`)

Corregido y verificado (typecheck API+web ✅, lint 0 errores, fiscal-conformance 5/5, unit API 19/19; e2e/RLS en CI):

| #   | Sev | Estado            | Fix aplicado                                                                                                                                                                                                                                 |
| --- | --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | 🔴  | ✅ (parte código) | Borrados `apps/api/.env.production` y `.env.bak.*` del disco; `*.bak`/`*.bak.*` añadidos al `.gitignore`. **Pendiente OWNER: ROTAR todos los secretos** (clave maestra, JWT, Neon, R2, Brevo, token Fly, `PLATFORM_ADMIN_PASSWORD`, Stripe). |
| H1  | 🟠  | ✅                | Concesión Fundador en transacción con `pg_advisory_xact_lock(3,0)` global + índice único en `founderNumber` (migración).                                                                                                                     |
| H2  | 🟠  | ✅                | Lockout del 2º factor MFA: comparte contador/bloqueo con la contraseña; audita `mfa_locked_now`.                                                                                                                                             |
| H3  | 🟠  | ✅                | `@Throttle(20/min)` en `/ai/*` + cuota diaria por tenant (tabla `AiUsage` RLS, `AI_DAILY_CALL_LIMIT`=200).                                                                                                                                   |
| H4  | 🟠  | ✅                | `assertUploadSafe` (veta HTML/SVG/JS por mime+ext+sniff) en el pipeline de subida: documentos, versiones, cloud-import, **portal**, data-room y certificado de despacho.                                                                     |
| H5  | 🟠  | ✅                | Acciones de terceros ancladas a SHA: gitleaks, claude-code-action (×2), pnpm/action-setup.                                                                                                                                                   |
| M1  | 🟡  | ✅                | `updateStaff`: check de plazas movido DENTRO de la tx con `pg_advisory_xact_lock(1, tenant)`.                                                                                                                                                |
| M2  | 🟡  | ✅                | `isCrossOrigin` (anti-CSRF) en login, register-tenant, mfa/login, social/finish, change-password del BFF.                                                                                                                                    |
| M3  | 🟡  | ✅                | `select` explícito en las lecturas del portal (oculta `budgetAmount`/`opposingCounsel`/internos).                                                                                                                                            |
| M4  | 🟡  | ✅ parcial        | Secreto dedicado `PLATFORM_JWT_SECRET` (fallback a JWT_ACCESS_SECRET) + lockout in-memory + logging de seguridad del login de plataforma. **Diferido:** BFF httpOnly + MFA + jti/denylist.                                                   |
| M6  | 🟡  | ✅                | Enforcement MECÁNICO de rutas prohibidas en el triaje IA (cierra el PR y falla el job si toca migraciones/RLS/providers/golden).                                                                                                             |
| M8  | 🟡  | ✅                | `forgot-password`: envío fuera de banda (tiempo constante, anti-timing) + enlace por cada cuenta activa (multi-despacho).                                                                                                                    |
| L2  | ⚪  | ✅                | KYC `getForClient` con scoping explícito `tenantId`.                                                                                                                                                                                         |
| L3  | ⚪  | ✅                | `leads.update` con campos explícitos (sin `...dto`).                                                                                                                                                                                         |
| L6  | ⚪  | ✅                | `encodeURIComponent` en los ids de MS Graph (message/drive/item).                                                                                                                                                                            |
| L7  | ⚪  | ✅                | `@Matches(CLOUD_ID)` en `fileId`/`driveId`/`itemId` del DTO de import.                                                                                                                                                                       |
| L18 | ⚪  | ✅                | CODEOWNERS cubre `package.json`/`pnpm-lock.yaml`/`.npmrc`.                                                                                                                                                                                   |
| L19 | ⚪  | ✅                | Comentario obsoleto del override `next` corregido.                                                                                                                                                                                           |

**Acción del OWNER (no código):** rotar todos los secretos de C1; fijar `PLATFORM_JWT_SECRET` y un `PLATFORM_ADMIN_PASSWORD`
fuerte; confirmar `HIBP_ENABLED=true` (L16). **Diferidos** (migración/infra, fuera de esta pasada): M5 (CSP completa), M7
(next-intl 3→4 / NestJS 10→11), M4 resto (BFF plataforma + MFA), L9 (antivirus), y las bajas restantes (L1, L4, L5, L8, L10–L17, L20).
