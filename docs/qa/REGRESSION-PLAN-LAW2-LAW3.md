# Plan de regresión / aceptación — LAW-2 (fiscal) y LAW-3 (seguridad)

Elaborado por: Carla (QA, LAW-6)  
Fecha: 2026-06-30  
Estado: **PLAN LISTO — pendiente de ejecución post-aterrizaje de LAW-2 y LAW-3**

> La ejecución se realiza en `agents/sandbox` una vez que los commits de Tomás (LAW-2) y Diego (LAW-3) aterricen. Este documento no implementa los fixes; solo define el plan de prueba.

---

## 1. Matriz de casos

### 1.1 LAW-3 — Seguridad (fixes de Diego: PR #188, PR #189)

| ID | Caso | Precondición | Resultado esperado | Criterio aceptación LAW-3 | Suite existente | Estado |
|----|------|-------------|-------------------|--------------------------|----------------|--------|
| **S1** | Rechazo de `id_token` RS256 con firma manipulada | JWKS mockeado con clave pública real; `id_token` con bit de firma adulterado (`sig[0] ^= 0xff`) | `verifyIdToken()` lanza excepción | H-1: "rechaza token no firmado por JWKS esperado" | `apps/api/src/auth/oidc-verify.spec.ts` → `"rechaza una firma manipulada"` | ✅ EXISTS |
| **S2** | Rechazo de `alg:none` (token sin firma) | `id_token` con header `alg: none` y payload `aud`/`exp` válidos | `verifyIdToken()` lanza con `/alg/` | H-1: "rechaza alg:none" | `apps/api/src/auth/oidc-verify.spec.ts` → `"rechaza alg:none (sin firma)"` | ✅ EXISTS |
| **S3** | Rechazo de firma de clave ajena (`kid` sin match en JWKS) | JWKS con clave conocida; token firmado con clave distinta | `verifyIdToken()` lanza | H-1: "rechaza clave ajena / kid desconocido" | `apps/api/src/auth/oidc-verify.spec.ts` → `"rechaza una firma de una clave distinta"` | ✅ EXISTS |
| **S4** | Re-registro de rango eNCF NO reinicia el contador | `EcfSequence` con `next=50`, `rangeEnd=100`; re-registro del mismo rango `1..100` | `next` conservado en 50 (no retrocede a 1) | H-2: "re-registro no reinicia el contador" | `apps/api/src/dgii/ecf-sequence.service.spec.ts` → `"CONSERVA el contador si el re-registro solapa"` | ✅ EXISTS |
| **S5** | Rechazo de rango cuyo fin queda por debajo del contador actual | `next=100`; re-registro con `rangeEnd=50` | `BadRequestException` | H-2: "rango agotado se rechaza, no silencia" | `apps/api/src/dgii/ecf-sequence.service.spec.ts` → `"rechaza un rango cuyo fin queda por debajo"` | ✅ EXISTS |
| **S6** | 8 emisiones e-CF en paralelo producen eNCF únicos y consecutivos | Despacho RD con `EcfSequence` tipo 31 `rangeStart=1`; 8 llamadas `POST /api/ledger/invoices` concurrentes vía `Promise.all` | 8 × HTTP 201; eNCF `E310000000001..E310000000008` distintos, sin huecos; `EcfSequence.next = 9` | H-2: "concurrencia eNCF no reusa número" | `apps/api/test/ecf-concurrency.e2e-spec.ts` (`api-integration` — Postgres real con advisory lock) | ✅ EXISTS (branch `fix/law-3-encf-concurrency-test`, merge pendiente) |

**Notas LAW-3:**
- S1–S5 corren en el job `unit` (Jest puro, sin BD). Sin dependencias externas.
- S6 corre en el job `api-integration` (Postgres 16-alpine real, RLS activa). La DGII de transmisión e-CF es STUBBED; el test solo valida el advisory lock y el contador.
- Ningún caso de LAW-3 requiere certificado real.

---

### 1.2 LAW-2 — Fiscal (fixes de Tomás)

| ID | Caso | Precondición | Resultado esperado | Criterio aceptación LAW-2 | Suite a usar | Estado |
|----|------|-------------|-------------------|--------------------------|-------------|--------|
| **F1** | XAdES-BES: `SigningTime` presente en `<QualifyingProperties>` | `.p12` autofirmado (self-signed, sin cert real); invocar `signEnvelopedXml()` tras el fix de Tomás | XML firmado contiene `<xades:SigningTime>` en formato ISO 8601 | LAW-2 AC 1: "SigningTime presente" | `apps/api/src/dgii/dgii-signer.spec.ts` → **CASO NUEVO** | ❌ NUEVO — agregar tras LAW-2 |
| **F2** | XAdES-BES: `SigningCertificate` con digest SHA-256 del certificado presente | Mismo self-signed .p12; invocar `signEnvelopedXml()` | XML contiene `<xades:SigningCertificate>` con `<xades:CertDigest><ds:DigestValue>` no vacío | LAW-2 AC 1: "SigningCertificate presente" | `apps/api/src/dgii/dgii-signer.spec.ts` → **CASO NUEVO** | ❌ NUEVO — agregar tras LAW-2 |
| **F3** | XAdES-BES: `<Reference URI="#SignedProperties">` válida en `<SignedInfo>` | Mismo self-signed .p12 | XML contiene `<ds:Reference URI="#SignedProperties">` y su `<ds:DigestValue>` corresponde al contenido canonicalizado de `<xades:SignedProperties>` | LAW-2 AC 1: "Reference a SignedProperties válido" | `apps/api/src/dgii/dgii-signer.spec.ts` → **CASO NUEVO** | ❌ NUEVO — agregar tras LAW-2 |
| **F4** | `recordHash` calculado sobre el XML **ya firmado** | `DominicanComplianceProvider.buildInvoiceRecord()`; fixture `rd-ecf.input.json` | `record.recordHash` = SHA-256 del XML post-firma (distinto al SHA-256 del XML pre-firma) | LAW-2 AC 2: "recordHash sobre XML firmado" | `packages/compliance/test/fiscal-conformance/conformance.spec.ts` → actualizar golden `rd-ecf.golden.json` + **CASO NUEVO de invariante** | ❌ NUEVO + golden update tras LAW-2 |
| **F5** | `VerifactuSignerService` scaffold — carga cert y firma un registro | `VerifactuCredentialService.loadCert(tenantId)` mockeado para devolver material PEM de self-signed .p12 | `VerifactuSignerService.signRecord(record, tenantId)` devuelve string no vacío sin lanzar; resultado contiene `<ds:Signature>` o `<Signature>` según el formato AEAT | LAW-2 AC 3: "scaffold VerifactuSignerService" | `apps/api/src/verifactu/verifactu-signer.service.spec.ts` → **ARCHIVO NUEVO** | ❌ NUEVO — crear tras LAW-2 |
| **F6** | Inmutabilidad fiscal: una factura emitida no puede reescribirse | Factura en estado `ISSUED` (con `FiscalEvent` registrado); llamada a cualquier endpoint que intente mutar `amount`, `lines`, `number`, o el `recordHash` | HTTP 403 / 422; `FiscalEvent` append-only no alterado | LAW-2 AC 4 (seguridad-audit PR #164): "no se puede reescribir una factura emitida" | `apps/api/test/ledger.e2e-spec.ts` — **VERIFICAR cobertura existente**; añadir caso si falta | ⚠️ VERIFICAR (ver §3) |

**Notas LAW-2:**
- F1–F3: un self-signed `.p12` (generado con `node-forge` en el test, como ya hace `dgii-signer.spec.ts`) es suficiente para el test unitario de la estructura XAdES-BES. **No requieren cert real.**
- F4: el golden `rd-ecf.golden.json` deberá regenerarse con `UPDATE_GOLDENS=1` tras el fix. La invariante adicional (hash pre ≠ hash post) es nueva.
- F5: sin cert real. El seam `VerifactuCredentialService.loadCert()` ya entrega el PEM; el test mockea ese servicio.
- F6: ver §3.
- **Casos que sí requieren cert real (bloqueo externo, no bloquean el plan):** certificación formal XAdES contra el banco de pruebas CerteCF de la DGII (F1–F3 pasan en CI con self-signed; la conformidad EXACTA se cierra con cert real) y el QR de producción AEAT (F5 de forma análoga). Marcados en §4.

---

## 2. Suites existentes y gap analysis

| Suite | Job CI | Cobertura actual | Gap tras LAW-2/LAW-3 |
|-------|--------|------------------|-----------------------|
| `apps/api/src/auth/oidc-verify.spec.ts` | `unit` | S1–S3 + nonce/aud/iss/exp | Ninguno — completa para LAW-3 H-1 |
| `apps/api/src/dgii/ecf-sequence.service.spec.ts` | `unit` | S4–S5 + init + renovación por encima | Ninguno — completa para LAW-3 H-2 lógica |
| `apps/api/test/ecf-concurrency.e2e-spec.ts` | `api-integration` | S6 | Ninguno — está en branch LAW-3, merge necesario |
| `apps/api/src/dgii/dgii-signer.spec.ts` | `unit` | XML-DSig base (firma + verificación criptográfica + password errónea) | F1, F2, F3 — añadir los 3 casos XAdES-BES |
| `packages/compliance/test/fiscal-conformance/conformance.spec.ts` | `Fiscal Conformance` (gate requerido) | recordHash Verifactu + encadenamiento + tamper detection | F4 — actualizar golden `rd-ecf` + caso invariante pre≠post-firma |
| `apps/api/src/verifactu/verifactu-signer.service.spec.ts` | `unit` | No existe | F5 — crear archivo nuevo |
| `apps/api/test/ledger.e2e-spec.ts` | `api-integration` | Emisión, retainer, multi-divisa | F6 — verificar si hay caso de mutación de factura emitida |

---

## 3. Verificación de F6 (inmutabilidad fiscal)

Antes de crear un caso nuevo, verificar en `apps/api/test/ledger.e2e-spec.ts` si existe alguna prueba que:
- Emite una factura (`POST /api/ledger/invoices` → 201 + `complianceFormat = ECF|VERIFACTU`).
- Intenta `PATCH /api/ledger/invoices/:id` o `PUT` con campos fiscales mutados.
- Espera 403 o 422.

Si no existe, añadir un caso mínimo en `ledger.e2e-spec.ts` dentro de un `describe('inmutabilidad fiscal')` block. El caso NO necesita cert real.

---

## 4. Casos que requieren certificado real (dependencia externa — no bloquean CI)

| Caso | Dependencia | Dueño |
|------|-------------|-------|
| Certificación XAdES-BES contra banco de pruebas CerteCF (DGII) | `.p12` CA acreditada INDOTEL + acceso CerteCF | Owner (RD) |
| Certificación remisión e-CF `DGII_ENV=cert` → `prod` | Mismo `.p12` + rangos eNCF autorizados en Oficina Virtual | Owner (RD) |
| Firma Verifactu con cert FNMT/representante real | Cert FNMT o QTSP | Owner (ES) |
| QR AEAT apuntando a host de producción | Solo cambio de parámetro en `spain.provider.ts` (sin cert adicional) | Tomás (LAW-2) |

Estos casos se marcan como **"certificación pendiente externa"** en el ticket; no bloquean el merge de LAW-2.

---

## 5. Resumen de acciones por fase

### Ahora (este heartbeat) — Plan listo ✅
- [x] Matriz de casos redactada (§1).
- [x] Suites existentes identificadas y gap analysis completo (§2).
- [x] Casos que requieren cert real marcados explícitamente (§4).

### Cuando aterrice LAW-3 (branch `fix/law-3-encf-concurrency-test`)
1. Verificar que `ecf-concurrency.e2e-spec.ts` pasa verde en CI (`api-integration`).
2. Verificar que `oidc-verify.spec.ts` y `ecf-sequence.service.spec.ts` siguen verdes en `unit`.
3. Marcar S1–S6 como ejecutados y conformes.

### Cuando aterrice LAW-2 (branch de Tomás con fix XAdES-BES / recordHash / VerifactuSigner)
1. **F1–F3:** Añadir 3 casos en `dgii-signer.spec.ts` (XAdES-BES properties). Verificar verde en `unit`.
2. **F4:** Regenerar golden `rd-ecf.golden.json` con `UPDATE_GOLDENS=1`; revisar diff; añadir caso invariante pre≠post hash. Verificar verde en `Fiscal Conformance`.
3. **F5:** Crear `apps/api/src/verifactu/verifactu-signer.service.spec.ts` con scaffold mínimo. Verificar verde en `unit`.
4. **F6:** Verificar en `ledger.e2e-spec.ts`; crear caso si falta. Verificar verde en `api-integration`.
5. Marcar F1–F6 como ejecutados y conformes.

---

## 6. Referencias

| Recurso | Ruta |
|---------|------|
| Checklist fiscal (seams pendientes) | `docs/fiscal/FINISHING-CHECKLIST.md` |
| Triage pentest H-1/H-2 | `docs/security/PENTEST-TRIAGE-2026-06-26.md` |
| Informe pentest white-box | `docs/security/PENTEST-2026-06-26.md` |
| Signer actual (DGII) | `apps/api/src/dgii/dgii-signer.ts` |
| Provider dominicano (recordHash) | `packages/compliance/src/providers/dominican.provider.ts` |
| Credential service Verifactu | `apps/api/src/verifactu/verifactu-credential.service.ts` |
| Golden-file conformance | `packages/compliance/test/fiscal-conformance/` |
