# Auditoría de la superficie FISCAL/LEGAL — Lawzora

- **Ticket:** LAW-46
- **Rama:** `agents/sandbox`
- **Fecha:** 2026-07-01
- **Autor:** Vera (Análisis Transaccional)
- **Método:** análisis estático del repo + 3 auditorías paralelas (transmisión, inmutabilidad/conformidad, claims) + scripts de verificación i18n. Sin push ni deploy.

Objetivo: encontrar los gaps fiscales/legales que hoy nadie posee, empezando por el patrón que ya rompió prod (claves i18n fiscales faltantes en el funds-flow). Cada hallazgo accionable quedó como **child ticket de LAW-46** para que Aurora priorice.

---

## Resumen ejecutivo

| Área | Estado | Hallazgo / ticket |
|---|---|---|
| 1. i18n fiscal/legal | **Núcleo limpio** (fix `2ff17e9` cerró funds-flow) | LAW-48 (3 claves no-fiscales faltan), LAW-49 (lint CI), LAW-50 (terminología RD) |
| 2. Transmisión fiscal | e-CF completo+gated; **Verifactu sin remisión** | Ya cubierto por **LAW-2** (blocked, owner cert) |
| 3. Inmutabilidad/conformidad | **Intacto** | LAW-51 (cobertura golden del seam de firma, baja) |
| 4. Claims web | **2 claims sobreafirman transmisión** | LAW-47 (high) |

---

## Área 1 — i18n fiscal/legal

**Cómo:** scripts scope-aware (`tools/i18n-check.mjs`) que extraen las 1977 llamadas `t(...)`/`.rich`/`.markup` del web, mapean cada una a su namespace `useTranslations('ns')` (declaración previa más cercana del mismo nombre de variable; maneja el redeclarado de `t` por componente) y resuelven `ns.key` contra `es.json`. Recordatorio clave (`apps/web/src/i18n/request.ts`): **`es.json` es siempre la base**; `do.json` solo se fusiona si `lf_jur=do`. Ausente en `es.json` = crash; ausente solo en `do.json` = fallback silencioso al texto ES.

**Resultado:**
- ✅ Namespaces `deal`, `deal.fundsFlow.*`, `billing`, `billing.ecf`, `billing.invoiceStatus`, etc. **completos** en `es.json`. El fix del funds-flow (`2ff17e9`) está presente y verificado.
- ✅ Claves dinámicas por enum (`escrowStatus.${}`, `statuses.${}`, `milestoneKind.${}`, …): los 12 mapeos enum→i18n cubren todos los valores de los enums Prisma.
- ❌ **3 claves literales NO fiscales faltan en `es.json`** → `MISSING_MESSAGE` (mismo patrón): `documents.dragHint` (`matters/[id]/documents/page.tsx:197`), `dataRoom.save` (`data-room-tab.tsx:576`), `messaging.retry` (`messaging-dock.tsx:253`). → **LAW-48**.
- ⚠️ **`do.json` solo override `clients/retainer/billingPlans/signatures`** — no `billing`/`deal`. Tenants RD ven terminología ES (IVA/IRPF en `es.json:1443,1452,1461,1464`) en vez de ITBIS/ISR. No es crash, pero impreciso. → **LAW-50** (NECESITA-OWNER: glosario RD).
- 🛡️ Sin red de seguridad automática: el patrón reincide. → **LAW-49** (lint i18n en CI; prototipo entregado en `tools/i18n-check.mjs`).

## Área 2 — Estado de la transmisión fiscal

- **e-CF (DGII, RD): END-TO-END implementado y gated por `DGII_ENV`.** Firma XAdES-BES (`dgii-signer.ts`) + cliente (semilla→token→`/fe/recepcion`→TrackId→consulta estado, `dgii.client.ts`) + orquestador best-effort (`ecf-transmission.service.ts`). Sin `DGII_ENV` o sin `.p12` → factura queda `STUBBED` (no se envía). Pendiente owner: cert real + `DGII_ENV=cert` (CerteCF) → `prod`.
- **Verifactu (AEAT, ES): firma + encadenado listos, REMISIÓN NO implementada.** No existe `VerifactuSubmissionService` (la remisión SOAP VERI*FACTU está documentada como "ticket aparte cuando haya banco de pruebas", `verifactu-credential.service.ts:14-27`). Gating actual = presencia de certificado (`signRecord()` devuelve `null` sin cert).
- **Conclusión:** los seams codeables de transmisión ya están cubiertos por **LAW-2** (blocked, depende de certs reales del owner). **No se duplica.** Checklist owner: `docs/fiscal/FINISHING-CHECKLIST.md`, `DGII_SETUP.md`.

## Área 3 — Inmutabilidad fiscal y conformidad

**Todo intacto** (verificado con file:line):
- AuditLog append-only: doble capa — `REVOKE UPDATE,DELETE` (`20260624120000_fiscal_audit_immutability/migration.sql:75`) + trigger `audit_log_block_mutation()` (`20260630120000_auditlog_append_only_trigger/migration.sql:46-49`). Test `audit/audit-immutability.spec.ts`.
- Invoice: columnas fiscales inmutables (REVOKE UPDATE + GRANT selectivo de columnas de ciclo de vida), DELETE revocado para `legalflow_app`.
- Secuencias: `InvoiceSequence` monótona; `EcfSequence` con fix anti-retroceso (`next = max(current, rangeStart)`), test `ecf-sequence.service.spec.ts` (5 casos).
- Golden-file `packages/compliance/test/fiscal-conformance/conformance.spec.ts`: 5 casos (ES simple, anticipo D-026, final con deducción, rectificativa sustitución, RD e-CF crédito fiscal) + cadena multi-registro (D8-006). Jest puro.
- **T-1/T-2/T-3 NO tocan fiscal** (funds-flow/escrow, gating CP/readiness, alertas de plazo = solo deal/notificación). No requieren cobertura golden.
- **Gap único (bajo):** el seam de firma (commit `2994465`: XAdES e-CF + QR Verifactu) está cubierto por unit tests pero **no por golden-file** de regresión. → **LAW-51**.

## Área 4 — Claims y textos de la web

- ❌ **Hero/diff sobreafirma transmisión:** `es.json:44` ("…su QR/eNCF de cotejo, **listo para AEAT y DGII**") y `landing.tsx:1633-1635` ("…**lista para {AEAT|DGII}**. Sin un segundo programa.") implican transmisión inmediata. **Verifactu no transmite**; e-CF solo con `DGII_ENV`+cert. El propio bloque se contradice unas líneas abajo (`landing.tsx:1680-1681`: "la transmisión se activa en el onboarding fiscal") y en la FAQ (`pricing-standalone.tsx:193-194`). → **LAW-47** (high).
- ✅ Claims correctos (no tocar): "Generación y encadenamiento ya conformes; la transmisión se activa en el onboarding fiscal"; "Huella encadenada e inmutable".
- ⚠️ Secundario (en LAW-47): el QR "validar la factura directamente en la sede de {org}" presupone, para Verifactu, registro transmitido — hoy no aplica.

---

## Tickets creados (children de LAW-46)

| Ticket | Prioridad | Resumen |
|---|---|---|
| LAW-47 | high | [FISCAL-WEB] Claims sobreafirman transmisión ("listo para AEAT y DGII") |
| LAW-48 | medium | [I18N] 3 claves faltan en es.json → MISSING_MESSAGE |
| LAW-49 | high | [I18N-CI] Lint anti-MISSING_MESSAGE en CI (prototipo: `tools/i18n-check.mjs`) |
| LAW-50 | medium | [I18N-RD][NECESITA-OWNER] do.json no localiza billing/deal (IVA/IRPF vs ITBIS/ISR) |
| LAW-51 | low | [FISCAL-GOLDEN] cobertura golden del seam de firma |

Transmisión Verifactu/e-CF: **LAW-2** (preexistente, blocked en certs del owner).

## Herramienta entregada

`tools/i18n-check.mjs` — lint que falla (exit 1) si alguna clave i18n usada falta en `es.json`, incluida cobertura de claves dinámicas por enum. Ejecutable hoy (`node tools/i18n-check.mjs`); su integración en CI es LAW-49.
