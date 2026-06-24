# Auditoría de seguridad integral — Lawzora / LegalFlow — 2026-06-24

**Fecha:** 2026-06-24 · **Auditor:** Claude (Claude Code), 10 agentes especializados en paralelo (D1–D10) + verificación directa.
**Autorización:** owner (auditoría de su propia aplicación). **Modo:** SOLO LECTURA. PoC teóricos/locales; sin payloads contra prod; sin transcripción de secretos.
**Alcance:** API NestJS (56 controladores) + Web Next.js 15 (App Router + BFF) + Postgres (RLS) + IA/RAG + fiscal (Verifactu/e-CF) + CI/CD (GitHub Actions) + infra (Fly/Docker/Neon/R2).
**Marcos:** OWASP API Top 10 2023 · OWASP Top 10 2021 · ASVS 5.0.0 (L2 base, L3 en auth/cripto/platform) · OWASP LLM Top 10 2025 · CWE Top 25 2024 · NIST 800-63B · RFC 9700 · PCI DSS 4.0.1 SAQ-A · CIS/NIST 800-190 · SLSA/SCVS · RGPD/LOPDGDD/Ley 172-13 · eIDAS · Verifactu/RRSIF + e-CF DGII · MITRE ATT&CK.
**Pasadas previas verificadas:** `OWASP-AUDIT-2026-06-20.md`, `SECURITY-AUDIT-2026-06-23.md`.

Severidad: 🔴 Crítica · 🟠 Alta · 🟡 Media · ⚪ Baja/Info · ✅ Control verificado.

---

## 1. Resumen ejecutivo

La postura **de seguridad aplicativa web sigue siendo sólida**: las dos pasadas previas resisten, no se ha encontrado **ninguna brecha crítica explotable de forma remota y anónima**, y el endurecimiento del 2026-06-23 (lockout MFA, cuota IA, allowlist de subida, anti-CSRF BFF, locks de concurrencia, SHA-pinning de Actions) **se aplicó de verdad** — solo una regresión parcial (la allowlist de subida no llegó a la ruta de adjuntos de correo entrante).

El cambio de veredicto respecto a pasadas anteriores viene de **dos dominios que las auditorías previas no examinaron**: la **integridad fiscal** (D8) y la **trazabilidad/auditoría inmutable** (D10). Ahí aparece el hallazgo más grave de esta ronda: **los registros fiscales emitidos y la propia tabla de auditoría son modificables y borrables por el rol de aplicación** (políticas RLS `FOR ALL` sin trigger append-only). La criptografía de la huella encadenada es correcta, pero **el sistema que la rodea (inmutabilidad, numeración, verificación en lectura, log de eventos) no cumple los requisitos de RRSIF/Verifactu ni de e-CF**. No es un exploit web remoto, pero **es un bloqueante regulatorio y de integridad para vender el producto fiscal**.

### Top 5 riesgos

1. **🔴 D8-001 — Sin inalterabilidad en BD de los registros fiscales** (y de `AuditLog`, D10-001): un tenant/insider puede `UPDATE`/`DELETE` facturas emitidas y recalcular la huella; no hay verificación de la cadena en lectura. Rompe la propiedad central de RRSIF/Verifactu y e-CF.
2. **🟠 D2-002 — Account takeover por login Microsoft con email no verificado** (`requireVerified:false`, `MS_TENANT=common`): un atacante con un tenant Azure propio puede iniciar sesión como una víctima cuyo email coincide.
3. **🟠 D4-001 — Falsificación cross-tenant del estado de firma (Signaturit)**: HMAC con secreto **global compartido** + `tenantId`/`status` tomados del payload → un documento de otro despacho se marca `SIGNED` sin acto del firmante. Mitigado hoy porque el provider es STUB, pero el endpoint y el modelo de confianza ya están desplegados.
4. **🟠 Plataforma super-admin: secreto con fallback + sin auditoría + sin MFA** (consolidado D1-001/D2-003/D3-001/D3-002/D3-004/D10-002): `PLATFORM_JWT_SECRET` cae a `JWT_ACCESS_SECRET` si no se fija (estado actual de prod), y **ninguna acción de la consola cross-tenant deja rastro auditable**.
5. **🟠 Auditoría no es append-only y deja sin traza las acciones más sensibles** (D10-001/002/003): `AuditLog` borrable por el rol de app; descargas internas de documentos, acciones de plataforma y ciclo e-CF no se auditan.

### Veredicto: «¿es seguro vender esto a un despacho con datos reales hoy?»

- **Como SaaS de gestión documental/CRM legal (sin emisión fiscal vinculante ni firma eIDAS real):** **sí, con condiciones** — ejecutar primero las acciones de owner pendientes (rotar **todos** los secretos de C1, fijar `PLATFORM_JWT_SECRET` y `PLATFORM_ADMIN_PASSWORD`, `HIBP_ENABLED=true`) y cerrar D7-001, D2-002 y la auditoría de plataforma (D10-002). El núcleo multi-tenant/cripto/web es robusto.
- **Como producto fiscal (Verifactu/RRSIF en ES, e-CF en RD):** **no todavía** — D8-001..D8-006 son bloqueantes de integridad/regulatorios, además de la firma con certificado cualificado y los endpoints de producción (hoy stub/preproducción).
- **Cumplimiento RGPD/Ley 172-13:** **bloqueado para datos reales** hasta cerrar la capa de privacidad (D6-P1..P4): falta DPA/registro de subencargados, salida transfronteriza de datos de categoría especial a IA en EE. UU. sin salvaguarda, `dataRegion` muerto (ES↔RD comingled), y sin derecho de acceso/portabilidad implementado.

---

## 2. Modelo de amenazas (STRIDE + LINDDUN)

**Joyas de la corona (por impacto):** (a) aislamiento entre despachos (RLS); (b) documentos/expedientes cifrados; (c) clave privada de firma fiscal DGII (`.p12`); (d) credenciales/token de la consola platform (BYPASSRLS); (e) **integridad e inalterabilidad de los registros fiscales** (Verifactu/e-CF); (f) PII/KYC.

**Perfiles de adversario:** ① **tenant legítimo malicioso** (principal); ② usuario portal-cliente (sube documentos no confiables); ③ destinatario de data-room/intake con token; ④ integración externa spoofeada (Stripe/Signaturit); ⑤ **insider** con credencial de app/DB; ⑥ atacante de cadena de suministro npm/Actions; ⑦ ladrón de credencial de plataforma.

**Peor caso por joya (secuencia mínima de fallos):**

- _Cross-tenant breach:_ requeriría perder el contexto de tenant en una ruta a Prisma → **no encontrado** (RLS fail-closed verificado en 51/56 modelos; los 5 restantes son exclusiones declaradas).
- _Factura fraudulenta / borrado de rastro fiscal:_ insider o sink SQL → `UPDATE/DELETE` directo sobre `Invoice`/`AuditLog` (RLS lo permite, sin trigger) + recálculo de huella (algoritmo abierto) → **D8-001 / D10-001 lo hacen posible y silencioso**.
- _Toma de la consola platform:_ fuga de `JWT_ACCESS_SECRET` (en `.env.production` filtrado y **aún sin rotar**, C1) + `PLATFORM_JWT_SECRET` sin fijar → forjar `{platform:true}` → BYPASSRLS 8 h **sin auditoría**.

**Superficies de confianza (todo input externo es no confiable):** body/query/header, los 4 webhooks, tokens de URL (dataroom/intake), documentos subidos, correo entrante, contenido recuperado por RAG, callbacks OAuth.

---

## 3. Tabla de hallazgos (ordenada por severidad)

| ID               | Sev | Dominio  | Hallazgo                                                                                                                                                      | Confianza                | Acción             |
| ---------------- | --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------ |
| **D8-001**       | 🔴  | Fiscal   | Sin inalterabilidad en BD de registros fiscales: `Invoice` con política RLS `FOR ALL` permite UPDATE/DELETE; huella recalculable; sin verificación en lectura | Confirmado               | código (migración) |
| **D2-002**       | 🟠  | Auth     | Login Microsoft con email no verificado (`requireVerified:false`, `MS_TENANT=common`) → ATO por coincidencia de email                                         | Probable¹                | código             |
| **D4-001**       | 🟠  | Webhooks | Falsificación cross-tenant del estado de firma Signaturit (HMAC con secreto global + `tenantId`/`status` del payload; sin integridad eIDAS)                   | Confirmado (estructural) | código             |
| **D-PLAT**       | 🟠  | Platform | `PLATFORM_JWT_SECRET` cae a `JWT_ACCESS_SECRET` (fallback no fatal) → confusión de tokens user↔platform (consolida D1-001/D2-003/D3-001)                      | Confirmado               | código + owner     |
| **D8-002**       | 🟠  | Fiscal   | Numeración por `COUNT(*)+1`: huecos/duplicados ante borrado y cambio de año/serie; serie mutable                                                              | Confirmado               | código             |
| **D8-003**       | 🟠  | Fiscal   | Semilla de cadena por `createdAt DESC` (no enlace duro) + génesis `''` vs `0000…0` de los golden → re-enraizado/bifurcación indetectable                      | Confirmado               | código             |
| **D8-004**       | 🟠  | Fiscal   | Sin registro de eventos fiscal inmutable/encadenado (RRSIF); `AuditLog` borrable                                                                              | Confirmado               | código             |
| **D10-001**      | 🟠  | Logging  | `AuditLog` modificable/borrable por el rol de app (RLS `FOR ALL`, sin trigger, `onDelete: Cascade`)                                                           | Confirmado               | código (migración) |
| **D10-002**      | 🟠  | Logging  | Acciones del super-admin de plataforma (login, mutaciones, enumeración cross-tenant) sin evento auditable persistente (consolida D3-002)                      | Confirmado               | código             |
| **D10-003**      | 🟠  | Logging  | Descarga/acceso a documentos internos no se audita (exfiltración de insider sin traza)                                                                        | Confirmado               | código             |
| **D2-001**       | 🟡  | Auth     | OAuth `state` es JWT stateless sin binding al navegador; sin PKCE (RFC 9700)                                                                                  | Confirmado               | código             |
| **D5-001**       | 🟡  | IA       | Cuota de IA cuenta **llamadas**, no tokens/coste → denial-of-wallet vía `summarizeDocument` (8 MB)                                                            | Confirmado               | código             |
| **D6-001**       | 🟡  | Cripto   | Sin rotación/re-cifrado de `DATA_ENCRYPTION_KEY` (envelope de 1 sola versión) → **bloquea la remediación de C1**                                              | Confirmado               | código             |
| **D6-002**       | 🟡  | Cripto   | DEK maestra como env var en claro, sin KMS/wrapping                                                                                                           | Confirmado               | código/infra       |
| **D7-001**       | 🟡  | Inputs   | `assertUploadSafe` no cableado en adjuntos de correo entrante (`createSystemDocument`) — hueco de cobertura de H4 (regresión parcial)                         | Confirmado               | código (quick-win) |
| **D8-005**       | 🟡  | Fiscal   | e-CF: huella sobre XML **sin firmar**; eNCF usa numeración interna, no rango autorizado DGII; XAdES incompleto                                                | Probable                 | código             |
| **D8-006**       | 🟡  | Fiscal   | Golden tests validan formato por registro, no la cadena multi-registro/inmutabilidad → cadena rota seguiría en verde                                          | Confirmado               | tests              |
| **D10-004**      | 🟡  | Logging  | Ciclo e-CF/DGII (transmisión/rechazo/cert) sin auditoría                                                                                                      | Confirmado               | código             |
| **D10-005**      | 🟡  | Logging  | Uso de IA / agotamiento de cuota sin evento de detección                                                                                                      | Confirmado               | código             |
| **D10-006**      | 🟡  | Logging  | Sin sink externo append-only/WORM; auditoría co-ubicada y con `onDelete: Cascade`                                                                             | Probable                 | infra              |
| **D2-006**       | ⚪  | Auth     | Login multi-tenant (email en varios despachos) omite contabilidad de lockout → spray sin bloqueo                                                              | Confirmado               | código             |
| **D2-004**       | ⚪  | Auth     | `mfaToken` stateless, no single-use (L14 sigue abierto; mitigado por H2)                                                                                      | Confirmado               | código             |
| **D2-005**       | ⚪  | Auth     | TOCTOU en el incremento de fallos MFA (snapshot) + ventana TOTP ±1                                                                                            | Confirmado               | código             |
| **D5-002**       | ⚪  | IA       | `@Throttle` de IA por IP, no por tenant                                                                                                                       | Confirmado               | código             |
| **D5-003**       | ⚪  | IA       | Inyección indirecta de prompt vía documento/expediente (acotada: sin tool-use, sin cross-tenant)                                                              | Probable                 | código             |
| **D7-002**       | ⚪  | Inputs   | 2 rutas data-room con `@Body()` inline (sin DTO → ValidationPipe no whiteliste)                                                                               | Confirmado               | código             |
| **D7-003**       | ⚪  | Inputs   | Token de intake en claro, permanente, no rotable                                                                                                              | Confirmado               | código             |
| **D9-001**       | ⚪  | Infra    | `actions/*`, `github/*`, `setup-python`+`pip install semgrep` sin SHA-pin                                                                                     | Confirmado               | config             |
| **D9-002**       | ⚪  | Infra    | Semgrep no bloquea merge (advisory)                                                                                                                           | Confirmado               | config             |
| **D9-003**       | ⚪  | Infra    | Imagen runtime copia todo el monorepo (no slim/standalone), sin rootfs RO                                                                                     | Confirmado               | build              |
| **D9-004**       | ⚪  | Infra    | Sin escaneo de imagen/base OS (Trivy/Grype); base por tag flotante                                                                                            | Confirmado               | config             |
| **D10-007**      | ⚪  | Logging  | Auditoría sin IP/user-agent (incl. login) y fail-soft silencioso                                                                                              | Confirmado               | código             |
| **D4-002**       | ⚪  | Webhooks | Sin dedupe por `event.id` (replay acotado por idempotencia/ventana Stripe)                                                                                    | Confirmado               | código             |
| **D4-003 / L6′** | ⚪  | Webhooks | `searchSites` interpola `site.id` sin `encodeURIComponent` (resto de L6)                                                                                      | Confirmado               | código             |
| **D1-002 / L1**  | ⚪  | RLS      | FKs escalares cross-tenant sin scoping en `closing.service` (L1 no remediado)                                                                                 | Confirmado               | código             |
| **D6-003**       | ⚪  | Cripto   | DGII XAdES solo enveloped XML-DSig (qualified properties pendientes)                                                                                          | Confirmado               | código             |
| **DEBUG**        | ⚪  | Info     | `debug.controller` bien mitigado (módulo gated por `SENTRY_DEBUG_KEY`, 404 sin clave, no toca datos). Menor: comparación de clave no constante-tiempo         | Confirmado               | —                  |
| **D9-005**       | ⚪  | Info     | `NEXT_PUBLIC_SENTRY_DSN` en `fly.web.toml` (por diseño, no es secreto)                                                                                        | Confirmado               | —                  |

¹ Depende de la config del registro de la app Microsoft en prod (restricción de tenant). Verificar.

### Gaps de privacidad/regulatorios (sección 7)

| ID    | Sev | Gap                                                                                                                 | Marco                       |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| D6-P1 | 🟠  | Sin DPA ni registro de subencargados (Anthropic, Voyage, Stripe, Brevo, Google/MS, Neon, R2, Signaturit)            | RGPD Art.28/30 · Ley 172-13 |
| D6-P2 | 🟠  | PII de expedientes (categoría especial) enviada a IA en EE. UU. sin consentimiento/DPA/salvaguarda; RAT no lo lista | RGPD Art.9/44-49/28         |
| D6-P3 | 🟡  | `Tenant.dataRegion` muerto: ES↔RD comingled en una sola región UE; RAT promete residencia configurable              | RGPD Art.44 · Ley 172-13    |
| D6-P4 | 🟡  | Sin endpoint de acceso/portabilidad del interesado (solo anonimización implementada)                                | RGPD Art.15/20              |
| D6-P5 | ⚪  | `retentionMonths` no aplicado (decisión documentada; confirmar intención)                                           | RGPD Art.5.1.e              |

---

## 4. Detalle de los hallazgos prioritarios

### 🔴 D8-001 — Sin inalterabilidad en BD de los registros fiscales

**A08 · ASVS v5.0.0-1.2/V8 · CWE-345/CWE-285 · RRSIF (RD 1007/2023) inalterabilidad · e-CF Ley 32-23**
**Ubicación:** `apps/api/prisma/migrations/20260615120000_rls_fail_closed/migration.sql:56-69` (política única `FOR ALL` sobre `Invoice`, `AuditLog`, etc.); algoritmo de huella abierto en `packages/compliance/src/providers/spain.provider.ts:100-108`; sin trigger append-only en ninguna migración.
**Descripción:** La única protección de `Invoice` es la política `tenant_isolation` `USING/WITH CHECK ("tenantId" = app_current_tenant())`, que **autoriza UPDATE y DELETE** para el contexto del propio tenant. No hay política por comando, ni trigger que bloquee la mutación de filas emitidas, ni columna inmutable. `total`, `issueDate`, `number`, `recordHash`, `previousRecordHash` son libremente editables; `Invoice` tiene `@updatedAt` (se espera que mute). No existe verificación de la cadena en lectura. `scripts/delete-invoice.mjs` ya es un primitivo de borrado funcional.
**Escenario-PoC (teórico):** Insider con la credencial del rol de app, o un sink `$queryRaw` futuro: `SET app.current_tenant='<tid>'; UPDATE "Invoice" SET total=…, "recordHash"=SHA256(...) WHERE id=…;`. La factura queda internamente consistente; la app no detecta nada. Borrar una factura deja el `previousRecordHash` de la siguiente apuntando a un registro inexistente (hueco/bifurcación silenciosa).
**Impacto:** Derrota total de la inalterabilidad fiscal: retroactividad, renumeración, alteración de importes y borrado, indetectables. Bloqueante RRSIF/Verifactu y e-CF.
**Remediación:** (1) Trigger `BEFORE UPDATE OR DELETE ON "Invoice"` que lance excepción salvo en `DRAFT` (allowlist de columnas de ciclo: `ecfStatus`/`paidAt`/`amountPaid`). (2) Políticas por comando: SELECT/INSERT del tenant; UPDATE restringido a columnas no fiscales; DELETE denegado para emitidas. (3) `recordHash` como HMAC server-side con clave que el rol de tenant no puede leer, verificado en lectura. (4) Restringir `delete-invoice.mjs` a DRAFT/demo.
**Esfuerzo:** M · quick-win: el trigger UPDATE/DELETE solo cierra lo peor.
**Detección:** Re-walk periódico de la cadena (server-side) + alerta sobre cualquier `Invoice` con `updatedAt>createdAt` y `status!=DRAFT`. Hoy: ninguna.

### 🟠 D2-002 — Account takeover por login Microsoft con email no verificado

**A07/API5 · RFC 9700 · ASVS v5.0.0-51 · CWE-287/CWE-290**
**Ubicación:** `apps/api/src/auth/social-auth.service.ts:73` (`requireVerified:false`), `:65` (`MS_TENANT` default `common`), `:138-148` (matching por `email ?? preferred_username ?? upn`).
**Descripción:** El login social autentica a un usuario existente por **igualdad de email** sin comprobar `email_verified` para Microsoft, y aceptando cualquier tenant Azure/MSA. Un atacante con tenant Azure propio crea un usuario cuyo `email`/`upn` = `victima@despacho.com` y entra como la víctima.
**Remediación:** Exigir `email_verified===true` también en MS, o restringir `MS_TENANT` a tenants org conocidos; no usar `preferred_username`/`upn` como email; ligar el linking a `sub`+email verificado. **Verificar** la restricción de tenant de la app MS en prod.

### 🟠 D4-001 — Falsificación cross-tenant del estado de firma (Signaturit)

**A08/API7 · ASVS v5.0.0-13.4 · CWE-345/CWE-940 · eIDAS (no repudio)**
**Ubicación:** `packages/compliance/src/providers/signaturit.signature.ts:71-104`; `apps/api/src/signatures/signatures.service.ts:124-141`; secreto global `SIGNATURE_WEBHOOK_SECRET`.
**Descripción:** El webhook verifica `HMAC-SHA256(rawBody, SIGNATURE_WEBHOOK_SECRET)` con un secreto **único global**, y toma `tenantId`/`externalId`/`status` del **payload**. La firma no procede de Signaturit (es un HMAC propio); `externalId` es determinista/predecible. Quien conozca el secreto (hoy convive en el `.env.production` filtrado de C1) marca como `SIGNED` la solicitud de otro despacho. No se verifica el hash del documento firmado ni nada eIDAS.
**Mitigación actual:** el provider está en STUB (`signatures.service.ts:48`), no transmite; pero el endpoint público y el modelo de confianza ya están desplegados.
**Remediación:** resolver `tenantId` desde la fila por `externalId` (no del payload) — quick-win que corta la falsificación aunque se filtre el secreto; al activar firma real, verificar firma del proveedor + hash del documento + sello de tiempo; secreto dedicado fuera de disco.

### 🟠 D-PLAT — Plataforma: fallback de secreto + sin auditoría + sin MFA (consolidado)

**A01/A07/API5 · ASVS v5.0.0-3.5.2/2.2.1(L3)/7.2.1 · CWE-863/CWE-1188/CWE-778/CWE-308**
**Ubicación:** `apps/api/src/platform/platform-secret.ts:9-13` (fallback), `apps/api/src/main.ts:40-47` (warn no fatal), `platform-auth.controller.ts:21,69-100`, `platform.service.ts:92-141` (mutaciones/enumeración sin `AuditService`), `apps/web/src/lib/platform.ts:10-23` (token en `sessionStorage`).
**Descripción (3 caras del mismo activo):**

- **Fallback de secreto:** `PLATFORM_JWT_SECRET || JWT_ACCESS_SECRET`. Si no se fija (estado actual de prod, pendiente owner), el discriminante user↔platform es solo el claim `platform:true`. Con `JWT_ACCESS_SECRET` filtrado (C1, sin rotar), se puede forjar el god-token. `validateProdEnv` solo avisa (fail-open).
- **Sin auditoría (D10-002/D3-002):** ni login, ni `extendTrial`/`setSubscription` (cambian estado de cuenta de cualquier tenant), ni `listTenants` (enumera todos los despachos) escriben en `AuditLog`. Solo pino en el login. Repudio total de la autoridad más privilegiada.
- **Token (D3-003) + sin MFA (D3-004):** token en `sessionStorage` (exfiltrable por XSS), stateless 8 h sin `jti`/denylist; login de un solo factor con contraseña estática de entorno; lockout in-memory por IP.
  **Remediación:** `PLATFORM_JWT_SECRET` **fatal en prod** (mover a la lista `missing` de `main.ts`, `getOrThrow` propio) + `aud`/`iss` dedicados; inyectar `AuditService` y registrar login + cada mutación + enumeración (tenant objetivo, actor, antes/después, IP); añadir MFA TOTP reutilizando la infra existente; bajar TTL a ~1 h y planificar BFF httpOnly + denylist. Owner: fijar `PLATFORM_JWT_SECRET` y `PLATFORM_ADMIN_PASSWORD` fuertes.

### 🟠 D8-002 / D8-003 / D8-004 — Numeración, encadenamiento y log de eventos fiscales

Ver §3 y los informes de dominio. Resumen:

- **D8-002** (`ledger.service.ts:378-384`): `COUNT(*)+1` no garantiza correlativo sin saltos por serie/año; el borrado produce duplicados (P2002/huecos), el cambio de año no resetea, `invoiceSeries` es mutable. _Fix:_ secuencia monótona por `(tenant, serie, año)` bajo el advisory lock existente.
- **D8-003** (`ledger.service.ts:385-389` + `spain.provider.ts:106`): semilla por `createdAt DESC` (no enlace duro) + génesis `''` ≠ `0000…0` de los golden. _Fix:_ `chainSeq` explícito enlazado a `chainSeq-1`, génesis constante documentada, verificación en lectura.
- **D8-004**: sin `FiscalEvent` append-only encadenado (RRSIF exige registro de eventos: alta/anulación/rectificación/incidencias). _Fix:_ tabla dedicada con trigger de denegación de UPDATE/DELETE + hash-chain de eventos.

### 🟠 D10-001 — `AuditLog` no es append-only

**A09 · ASVS v5.0.0-7.3.3/7.3.1 · CWE-778/CWE-117 · ATT&CK T1070/T1565.001**
**Ubicación:** misma migración `FOR ALL` (`AuditLog` en el bucle `tenant_isolation`), `onDelete: Cascade` desde `Tenant`. La garantía «no expone update/delete» es solo a nivel ORM. _Fix:_ políticas INSERT-only + SELECT, `REVOKE UPDATE,DELETE`, trigger; envío a sink WORM (D10-006); desacoplar del cascade.

### 🟠 D10-003 — Descarga de documentos internos sin auditar

**Ubicación:** `documents.service.ts:327` (`download` sin audit), `:343` (`compare`). Contrasta con el data-room externo, que sí registra `DOWNLOAD`+IP. Un letrado puede exfiltrar todos los expedientes sin traza. _Fix:_ `audit.log(user,'document.downloaded',…, ip)`.

_(El detalle completo de los hallazgos 🟡/⚪ y privacidad está en los informes de dominio resumidos en §3; remediaciones concretas incluidas por hallazgo.)_

---

## 5. Verificación de auditorías previas (regresión)

**jun-23 — corregido y que AGUANTA:** H1 (lock Fundador `pg_advisory_xact_lock(3,0)` + índice único) ✅ · H2 (lockout 2º factor MFA) ✅ · H3 (`@Throttle(20/min)` + cuota diaria, cobertura de **todos** los endpoints IA) ✅ (matiz: cuenta llamadas, no coste → D5-001) · H5 (3rd-party Actions a SHA: gitleaks, claude-code-action×2, pnpm/action-setup) ✅ · M1 (`updateStaff` con lock) ✅ · M2 (`isCrossOrigin` en los 6 handlers BFF) ✅ · M3 (`select` en portal) ✅ · M6 (enforcement mecánico de rutas prohibidas en triaje IA) ✅ · M8 (forgot-password fuera de banda + por cuenta) ✅ · L2/L3/L6/L7/L18/L19 ✅.

**jun-23 — parcial / regresión:**

- **H4** (allowlist de subida) — ✅ en 6/7 rutas; **regresión parcial:** falta en adjuntos de correo entrante (`createSystemDocument`, `documents.service.ts:62-88`) → **D7-001** (quick-win de 1 línea).
- **M4** (plataforma) — ✅ parcial como se documentó; el **fallback de secreto** se eleva a 🟠 por C1 sin rotar → **D-PLAT**.
- **L14** (mfaToken single-use) — **no hecho** (D2-004); mitigado por H2.
- **L15** (refresh vs `passwordChangedAt`) — parcial (cubierto en práctica por `revokeAllForUser`).
- **L16** (HIBP) — parcial: default-off y fail-open (D2-007).
- **L1** (FK escalar `closing`) — **no remediado** (D1-002).

**jun-23 — acción de OWNER (sigue abierta y es lo más importante):** rotar **todos** los secretos de **C1** (clave maestra `DATA_ENCRYPTION_KEY`, JWT, Neon×3, R2, Brevo, token Fly filtrado, `PLATFORM_ADMIN_PASSWORD`, Stripe). ⚠️ **D6-001 advierte que rotar la DEK hoy rompe el descifrado de todo lo at-rest** (no hay keyring/re-cifrado) → implementar D6-001 **antes** de rotar la clave maestra.

**jun-20:** #1 (throttle platform login) ✅ reforzado con lockout · #3/#4/#5/#6 cubiertos en pasadas posteriores. #2 (rotar/purgar secretos) = parte de C1, abierto.

**No se detectaron regresiones del núcleo verificado:** RLS fail-closed (51/56 modelos), crons `runWithTenant`, IDOR WebSocket cerrado, JWT HS256 sin fallback, AES-256-GCM con IV aleatorio, los 4 webhooks verifican firma (salvo el modelo de confianza de Signaturit, D4-001), Dockerfiles `USER node`, sin `pull_request_target`, `pnpm audit --prod --audit-level high` limpio.

---

## 6. Matriz ASVS 5.0.0 (Nivel 2 base; **L3** en auth/cripto/platform)

| Cap. ASVS                          | Req. clave                                            | Estado            | Nota                                                                          |
| ---------------------------------- | ----------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| V1 Encoding/Injection              | 1.2 raw SQL parametrizado                             | ✅                | 0 `$queryRawUnsafe`/`Prisma.raw`                                              |
| V2 Validation/Business logic       | DTO whitelist+forbidNonWhitelisted                    | ✅ (✘ 2 rutas)    | inline `@Body()` en data-room (D7-002)                                        |
| V3 Web/Session (BFF)               | cookies HttpOnly/Secure/SameSite; anti-CSRF           | ✅                | `isCrossOrigin` en handlers que mutan                                         |
| V6 Stored Cryptography **(L3)**    | 6.4 gestión/rotación de claves                        | ✘                 | sin rotación/KMS (D6-001/002)                                                 |
| V7 Error/Logging                   | 7.2 log de acciones sensibles; 7.3 protección del log | ✘                 | log mutable (D10-001), gaps (D10-002/003/004)                                 |
| V8 Data Protection/Integrity       | integridad transaccional fiscal                       | ✘                 | inalterabilidad ausente (D8-001)                                              |
| V9 Comms                           | TLS/HSTS/force_https                                  | ✅                | helmet HSTS 1 año; Fly force_https                                            |
| V11 Business Logic/anti-automation | cuota/anti-abuso                                      | ✅ (parcial)      | cuota IA por llamada, no coste (D5-001)                                       |
| V12 Files/Resources                | allowlist de subida; path traversal                   | ✅ (✘ 1 ruta)     | falta en inbound-email (D7-001)                                               |
| V13 API/Webhooks                   | 13.4 autenticidad de webhook                          | ✅ (✘ Signaturit) | D4-001                                                                        |
| Auth **(L3)**                      | MFA admin, lockout, política de password              | ✅ (parcial)      | platform sin MFA (D3-004); HIBP off (D2-007); MS email no verificado (D2-002) |
| OAuth (RFC 9700)                   | state binding + PKCE                                  | ✘                 | D2-001                                                                        |
| Platform **(L3)**                  | separación de secreto, auditoría de admin             | ✘                 | D-PLAT                                                                        |

---

## 7. Backlog priorizado

**P0 — bloquea producción (fiscal/regulatorio o exposición elevada):**

1. **OWNER (no código):** rotar todos los secretos de C1 **tras** implementar D6-001; fijar `PLATFORM_JWT_SECRET` y `PLATFORM_ADMIN_PASSWORD` fuertes; `HIBP_ENABLED=true`. Verificar restricción de tenant de la app Microsoft (D2-002).
2. **D8-001 + D10-001** — inmutabilidad en BD (trigger append-only + políticas por comando) para `Invoice` y `AuditLog`. _(bloqueante fiscal y de auditoría)_
3. **D-PLAT** — `PLATFORM_JWT_SECRET` fatal-en-prod + auditoría de toda acción de plataforma (D10-002).
4. **D2-002** — exigir email verificado / restringir tenant en login Microsoft.
5. **Privacidad (D6-P1/P2)** — DPA + registro de subencargados + gating/consentimiento de IA con salvaguarda de transferencia (bloquea venta con datos reales).

**P1 — alto:**

- D4-001 (resolver `tenantId` por `externalId`; verificación eIDAS antes de activar firma real).
- D8-002/D8-003/D8-004 (numeración por secuencia, enlace duro de cadena + génesis, log de eventos fiscal).
- D10-003 (auditar descargas internas), D10-004/005 (auditar e-CF e IA).
- D6-001 (keyring + re-cifrado — además habilita la rotación P0), D6-002 (KMS).

**P2 — medio:** D2-001 (state/PKCE), D5-001 (cuota por tokens), D7-001 (quick-win), D8-005/006, D6-P3/P4, D10-006/007.

**P3 — bajo/endurecimiento:** D1-002/L1, D2-004/005/006, D5-002/003, D7-002/003, D9-001/002/003/004, D4-002/003, D6-003.

**Quick-wins (S, alto valor):** D7-001 (1 línea), `PLATFORM_JWT_SECRET` fatal (D-PLAT), trigger UPDATE/DELETE de `Invoice`/`AuditLog` (D8-001/D10-001), D4-001 (resolver tenant por `externalId`), test de cadena multi-registro (D8-006), `encodeURIComponent(s.id)` (D4-003).

---

## 8. Gaps regulatorios (resumen — bloquean venta aunque no sean «bugs»)

- **RGPD/Ley 172-13:** D6-P1 (DPA/subencargados), D6-P2 (transferencia de categoría especial a IA EE. UU.), D6-P3 (`dataRegion` muerto, ES↔RD comingled), D6-P4 (acceso/portabilidad no implementados), D6-P5 (retención no aplicada). El RAT (`RAT.md`) **sobreafirma** cumplimiento vs. el código real.
- **Verifactu/RRSIF (ES):** inalterabilidad (D8-001), correlativo sin saltos (D8-002), encadenamiento real (D8-003), registro de eventos (D8-004), **firma con certificado cualificado** y endpoints de producción (hoy stub/preproducción).
- **e-CF DGII (RD, Ley 32-23):** eNCF de rango autorizado, huella sobre XML firmado, XAdES-BES (D8-005).
- **eIDAS:** integridad/no repudio del documento firmado no verificada (D4-001/D6-003).

---

_Generado por auditoría asistida; cada hallazgo está anclado a `archivo:línea`. Los PoC son teóricos/locales. No se transcribió ningún secreto. Las acciones de OWNER (rotación de secretos) permanecen fuera del alcance de solo-lectura de esta pasada._
