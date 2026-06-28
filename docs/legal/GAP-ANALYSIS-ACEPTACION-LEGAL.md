# Gap analysis — Capa contractual / legal de aceptación (despachos)

**Fecha:** 2026-06-28 · **Tipo:** auditoría de solo lectura (sin cambios en código) · **Alcance:** monorepo Lawzora (apps/api, apps/web, packages/compliance)

**Objetivo:** determinar si existe una capa auditable de aceptación de ToS / Política de Privacidad / DPA (art. 28 RGPD · Ley 172-13 RD) + lista de subencargados, con mecanismo clickwrap, versionado y re-aceptación.

> Nota de método: esto es un informe. No se ha modificado migración, RLS, default fiscal, secuencia de numeración ni secreto alguno.

> **Decisión tomada (2026-06-28, ajustada):** la aceptación NO usará proveedor de firma (Signaturit). Se implementa **clickwrap reforzado** (registro probatorio con hash, IP, User-Agent, versión, append-only). **Solo se hace lo legalmente obligatorio**: se descarta el certificado PDF + acuse por email (no obligatorio; la prueba es el registro). El **email se usa únicamente para los avisos de subprocesadores** (obligación del art. 28.2 RGPD). Fundamento y comparativa en §7.

---

## 1. Veredicto en una línea

Existe **contenido legal** (ToS y Privacidad como páginas Next, reales y razonables). **No existe** ninguna **capa de aceptación auditable**: ni modelo de datos, ni clickwrap en alta, ni bloqueo por versión vigente, ni re-aceptación, ni DPA formal, ni registro de subencargados con notificación/objeción. El cierre se hará **in-house sin proveedor de firma** (clickwrap reforzado + certificado PDF; §2-bis). La **identidad fiscal del tenant SÍ dirige el comportamiento fiscal** (correcto), con una salvedad menor.

---

## 2. Tabla de gap analysis

| #      | Componente                                               | Estado                                     | Ubicación(es) en el repo                                                                                                                                                                                                      | Notas                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a     | **Términos del Servicio (ToS)**                          | ✅ Implementado (contenido)                | `apps/web/src/app/[locale]/terms/page.tsx` + `…/terms/legal-page.tsx`                                                                                                                                                         | 14 secciones reales. Declara a Lawzora como **encargado**. Versionado = literal `"20 de junio de 2026"` en el componente (no es versión semántica ni en BD). Solo `es`. Placeholder `[razón social del titular]` sin rellenar.                                                                                                                                                                 |
| 1b     | **Política de Privacidad**                               | ✅ Implementado (contenido)                | `apps/web/src/app/[locale]/privacy/page.tsx`                                                                                                                                                                                  | 12 secciones, cita RGPD/LOPDGDD/Ley 172-13. Rol de encargado art. 28. Incluye lista de subencargados (§6). Versionado = literal en componente. Solo `es`.                                                                                                                                                                                                                                      |
| 1c     | **DPA (encargado del tratamiento)**                      | ❌ Ausente                                 | —                                                                                                                                                                                                                             | No hay documento DPA formal (ni archivo, ni página, ni BD). `RAT.md` lo reconoce: _"contrato de encargo / DPA pendiente de formalizar antes de datos reales"_. Marcado como **alto (D6-P1)** en `docs/security/SECURITY-AUDIT-2026-06-24.md`.                                                                                                                                                  |
| 1d     | **Lista de subencargados**                               | 🟡 Parcial                                 | `apps/web/src/app/[locale]/privacy/page.tsx` §6                                                                                                                                                                               | Lista **hardcodeada** en la página (Fly.io, Neon, Cloudflare R2, Brevo, Stripe, Google, Microsoft). No versionada, sin registro estructurado, sin mecanismo de notificación/objeción.                                                                                                                                                                                                          |
| 2      | **Modelo de datos de aceptación**                        | ❌ Ausente                                 | `apps/api/prisma/schema.prisma` (87 modelos, ninguno aplica)                                                                                                                                                                  | No existe `LegalDocument` / `DocumentVersion` legal / `LegalAcceptance`. (`DocumentVersion` en línea 772 es **versión de fichero de expediente**, no documento legal.) Ningún campo `tenantId/userId/documentType/version/acceptedAt/ipAddress/userAgent/method` para aceptación.                                                                                                              |
| 2-RLS  | **RLS sobre tablas de aceptación**                       | ❌ N/A (no hay tabla)                      | —                                                                                                                                                                                                                             | El patrón base existe y es sólido (fail-closed: `ENABLE`+`FORCE RLS` + `CREATE POLICY tenant_isolation USING (tenantId = app_current_tenant())`). Una futura tabla **debería** seguirlo.                                                                                                                                                                                                       |
| 3      | **Flujo clickwrap en alta/onboarding**                   | ❌ Ausente                                 | `apps/web/src/app/[locale]/onboarding/page.tsx`; DTO `apps/api/src/auth/dto/register-tenant.dto.ts`; `apps/api/src/auth/auth.service.ts`                                                                                      | Wizard de 5 pasos (nombre→jurisdicción→divisa→tax ID→admin). **Sin checkbox** de aceptación. El DTO no captura aceptación. Tras `register-tenant` → auto-login → `/dashboard` sin barrera.                                                                                                                                                                                                     |
| 3-gate | **Bloqueo de acceso si no se aceptó la versión vigente** | ❌ Ausente                                 | `apps/web/src/middleware.ts`; guards API (`jwt-auth`, `roles`, `entitlements`)                                                                                                                                                | Ningún guard/middleware tipo `requireAcceptance`. ToS §12 solo declara **aceptación implícita por uso continuado** (débil para RGPD art. 7).                                                                                                                                                                                                                                                   |
| 4      | **Versionado + re-aceptación al cambiar versión**        | ❌ Ausente                                 | —                                                                                                                                                                                                                             | No hay versión en BD, ni comparación "aceptado vs vigente", ni forzado de re-aceptación. La "versión" actual es una fecha literal en el JSX.                                                                                                                                                                                                                                                   |
| 5a     | **Captura de identidad fiscal del tenant**               | ✅ Implementado                            | `schema.prisma` modelo `Tenant` (`name`, `taxId`, `jurisdiction`, `currency`, `invoiceSeries`); DTO `register-tenant.dto.ts`; `onboarding/page.tsx`                                                                           | Captura razón social (`name`), identificador fiscal (`taxId` = NIF/CIF ES · RNC RD) y jurisdicción (`es`/`do`). `taxId` opcional en alta pero requerido para facturar. **Falta capturar `domicilio fiscal`** estructurado.                                                                                                                                                                     |
| 5b     | **La identidad fiscal DIRIGE el comportamiento fiscal**  | ✅ Correcto (con salvedad)                 | `packages/compliance/src/factory.ts`; `…/providers/{spain,dominican}.provider.ts`; `apps/api/src/compliance/compliance.service.ts`; `apps/api/src/ledger/ledger.service.ts`                                                   | El IVA/ITBIS se decide por `jurisdiction` vía `ComplianceProviderFactory` (ES→IVA 21%/IRPF; DO→ITBIS 18%). **No** se infiere de geolocalización/divisa. ✅ Salvedad: `apps/api/src/retainer/retainer.service.ts:140` y `:466` usan `user.jurisdiction` (claim del JWT, TTL 15 min) en vez de `tenant.jurisdiction` fresco → ventana de inconsistencia si cambia la jurisdicción tras el login. |
| 6      | **Subencargados: registro + notificación/objeción**      | ❌ Ausente                                 | —                                                                                                                                                                                                                             | Solo la lista estática de la §6. Sin tabla `Subprocessor`, sin versión, sin notificación previa ni mecanismo de objeción (RGPD art. 28.2/28.4).                                                                                                                                                                                                                                                |
| 7      | **Mecanismo de aceptación del DPA (sin proveedor)**      | ❌ Ausente (decisión: clickwrap reforzado) | piezas in-house verificadas: `AuditLog` append-only (`schema.prisma:1893` + migración `20260624120000_fiscal_audit_immutability`), `pdf-lib`+`pdfkit` (`apps/api/src/.../*-pdf.ts`), `node:crypto`, `mail.service.ts` (Brevo) | **Decisión: NO se usa Signaturit ni ningún proveedor.** Para un DPA art. 28 RGPD basta forma escrita electrónica (art. 28.9) → **clickwrap reforzado** es suficiente y estándar B2B. El adaptador Signaturit existente (en stub) queda **sin usar** para esto. Detalle y base jurídica en §2-bis.                                                                                              |

Leyenda: ✅ implementado · 🟡 parcial · ❌ ausente

---

## 2-bis. Por qué clickwrap reforzado y NO un proveedor de firma

Un **DPA art. 28 RGPD no requiere firma** (ni manuscrita ni cualificada): el art. 28.9 solo exige que conste **"por escrito, inclusive en formato electrónico"**. El clickwrap cumple. Además: **eIDAS (UE 910/2014) art. 25** impide negar efecto/admisibilidad a una firma electrónica simple (clic, nombre tecleado); en **España** Cód. Civil 1254-1258 + Ley 6/2020; en **RD** Ley 172-13 + Ley 126-02. El valor probatorio lo aporta la **calidad del registro**, no el proveedor.

Opciones in-house (todas sin terceros, piezas ya presentes en el repo):

| Opción                                  | Qué es                                                                             | Solidez                                 | Esfuerzo   |
| --------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| 1. Clickwrap básico                     | checkbox + fila `LegalAcceptance`                                                  | suficiente B2B                          | bajo       |
| **2. Clickwrap reforzado ⭐ (elegida)** | + SHA-256 del texto exacto, IP, UA, timestamp servidor, versión, append-only       | alta (prueba _qué_ se aceptó)           | bajo-medio |
| 3. + Certificado/acuse (descartada)     | PDF "certificado de aceptación" + email al despacho                                | alta + auto-evidencia                   | medio      |
| 4. Type-to-sign                         | nombre+cargo tecleados / firma en canvas                                           | igual en derecho                        | medio      |
| 5. Escotilla cualificada (opt-in)       | el despacho sube su DPA firmado con su propio AutoFirma/cert; tú solo lo almacenas | cualificada, sin proveedor por tu parte | bajo       |

**Elegido: solo la 2** (lo legalmente obligatorio). La 3 (certificado PDF + email) se **descarta** por no ser obligatoria: la prueba ya es el registro append-only. La 5 queda como vía de escape para el despacho que insista en firma cualificada (no requiere integrar nada, solo almacenar el fichero subido).

---

## 3. Resumen de huecos priorizados

**P0 — Bloqueantes para vender/operar con datos reales (RGPD/Ley 172-13):**

1. **Sin DPA formal** (1c) ni **registro de subencargados con notificación/objeción** (6). Ya marcado alto (D6-P1) en la auditoría de seguridad de jun-24.
2. **Sin mecanismo de aceptación auditable** (2 + 3 + 3-gate): no se puede _probar_ que un despacho aceptó ToS/Privacidad/DPA, con quién, cuándo, desde qué IP/UA y qué versión. La "aceptación implícita por uso" (ToS §12) es jurídicamente débil en la UE.

**P1 — Robustez legal:** 3. **Sin versionado real ni re-aceptación** (4): un cambio material de términos no fuerza re-consentimiento. La "versión" es una fecha en el JSX. 4. **Domicilio fiscal no estructurado** (5a): falta para encabezar facturas y para el DPA (identificación de las partes).

**P2 — Mejoras / deuda menor:** 5. **Bug de jurisdicción en retainer** (5b): usar `tenant.jurisdiction` fresco en `retainer.service.ts:140,466`. No es de la capa legal pero afecta corrección fiscal. 6. **Subencargados hardcodeados** (1d) → convertir en fuente única versionada (idealmente la misma que alimente el DPA y la página pública). 7. **Placeholder legal sin rellenar** (`[razón social del titular]` en ToS) y **solo `es`** (sin EN si hubiera clientes no hispanohablantes — probablemente no aplica).

---

## 3-bis. Dimensión de consumo (B2C) — añadida 2026-06-28

Lawzora también admite **suscriptores individuales**, de **ambos perfiles**: abogados autónomos/profesionales y consumidores particulares. El determinante NO es "empresa vs individuo" sino **profesional vs consumidor**, y abre obligaciones que el B2B no tiene.

| Perfil                                        | Capa legal                                                                              | DPA                                                              | Fiscal (facturación propia de Lawzora ES)                                                                          |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Despacho / abogado autónomo (profesional)** | ToS B2B + Privacidad                                                                    | **Sí** (es responsable del tratamiento de datos de sus clientes) | B2B: ES 21% IVA · RD no sujeto (+vigilar ITBIS RD)                                                                 |
| **Consumidor particular**                     | **ToS de consumidor** + Privacidad + **consentimiento de desistimiento** (TRLGDCU/LSSI) | **No** (es interesado, no responsable)                           | B2C: ES 21% · consumidor UE → **OSS** (país del consumidor, umbral 10.000 €) · consumidor RD → ITBIS Decreto 30-25 |

Implicaciones nuevas (solo perfil consumidor):

- **Protección al consumidor** (RD Leg. 1/2007 TRLGDCU + LSSI Ley 34/2002): información precontractual, **derecho de desistimiento de 14 días**, control de cláusulas abusivas → no se pueden reutilizar tal cual los ToS B2B.
- **Excepción SaaS al desistimiento** (conecta con el clickwrap): se puede excluir si el consumidor **(a)** consiente expresamente el inicio inmediato del servicio dentro de los 14 días **y (b)** reconoce que pierde el desistimiento. Hay que **capturar ese doble reconocimiento** en el alta como aceptación propia.
- **Tipo de cuenta**: se necesita un atributo que **dirija** el conjunto de documentos a aceptar, el trato fiscal y si aplica DPA — dirigido por ese dato, no por IP/divisa.

---

## 4. Plan de cierre — PRs independientes

> Marcado de rutas prohibidas: 🚧 = toca **nueva migración / RLS** → debe tramitarse **PR-y-espera con aprobación manual** del owner (no se genera aquí). El resto son seguros de implementar sin tocar rutas prohibidas.

### PR-A 🚧 — Modelo de datos de aceptación + RLS _(PR-y-espera)_

- **Toca rutas prohibidas:** nueva migración Prisma + políticas RLS.
- **Contenido:** modelos `LegalDocument` (tipo, jurisdicción, versión, hash/contenido, vigencia) y `LegalAcceptance` (`tenantId`, `userId`, `documentType`, `version`, `documentHash`, `acceptedAt`, `ipAddress`, `userAgent`, `method` CLICKWRAP|TYPED|UPLOADED, `signerName?`, `evidenceDocId?`), append-only (`REVOKE UPDATE,DELETE`, patrón `fiscal_audit_immutability`). Índices `(tenantId, documentType, version)` y `(tenantId, userId)`.
- **Tipo de cuenta (B2C):** añadir a `Tenant` un `accountType` (FIRM | PROFESSIONAL | CONSUMER) que **dirija** el conjunto de documentos, el trato fiscal y si aplica DPA.
- **`LegalDocType`** incluye: `TERMS`, `TERMS_CONSUMER`, `PRIVACY`, `DPA`, `SUBPROCESSORS`, `WITHDRAWAL_WAIVER` (consentimiento de desistimiento).
- **RLS:** seguir patrón fail-closed existente (`ENABLE`+`FORCE` + `tenant_isolation` con `app_current_tenant()`). `LegalDocument` puede ser global (lectura) si los textos son del proveedor, no del tenant — decisión del owner.
- **Por qué separado:** aísla el único cambio de esquema/RLS para revisión manual.

### PR-B — Contenido DPA + ToS de consumidor + registro de subencargados como fuente única

- **No toca rutas prohibidas** (contenido/archivos/página).
- **Contenido:** (1) redactar DPA art. 28 RGPD / Ley 172-13 (obligaciones del encargado, subencargados, asistencia a derechos, brechas, auditoría, devolución/borrado); (2) **ToS de consumidor** conforme a TRLGDCU/LSSI (información precontractual + cláusula de desistimiento de 14 días y su excepción para contenido digital), distinto de los ToS B2B; (3) convertir la lista §6 en fuente única (JSON/markdown versionado) que alimente la página de privacidad y una página `/subprocessors`. Todo como documento versionado (md/mdx o seed de `LegalDocument`).
- **Dependencia:** la persistencia en BD depende de PR-A; el documento en sí no. La redacción jurídica final es acción de owner/letrado.

### PR-C — Clickwrap en onboarding + endpoint de registro de aceptación

- **No toca rutas prohibidas** (UI + endpoint que escribe vía PR-A).
- **Contenido:** checkbox afirmativo (no premarcado) en el alta, **condicional por `accountType`**: profesional/despacho → ToS + Privacidad + DPA; consumidor → ToS de consumidor + Privacidad + **doble reconocimiento de desistimiento** (consiente inicio inmediato + reconoce que pierde el derecho). Capturar aceptación en el DTO de `register-tenant`; endpoint `POST /legal/accept` que persista `LegalAcceptance` con IP/UA por cada `documentType`.
- **Dependencia:** PR-A (modelo).

### PR-D — Gate de versión vigente + re-aceptación

- **No toca rutas prohibidas** (guard API + middleware/layout web + lógica de comparación).
- **Contenido:** al iniciar sesión / cargar la app, comparar versión aceptada vs vigente; si falta o quedó obsoleta, interceptar con pantalla de re-aceptación (sin dejar usar el resto). Guard NestJS `RequireLegalAcceptanceGuard` + barrera en `apps/web`.
- **Dependencia:** PR-A + PR-C.

### PR-E — Domicilio fiscal estructurado del tenant 🚧 (parcial)

- **Toca rutas prohibidas SI** se persiste como columnas nuevas en `Tenant` → migración → **PR-y-espera**. (Alternativa sin migración: reutilizar JSON existente si lo hubiera — a confirmar; por defecto asumir migración.)
- **Contenido:** capturar domicilio fiscal en onboarding/ajustes; usarlo en encabezado de factura y en el DPA.

### ~~PR-H — Certificado de aceptación PDF + acuse por email~~ — DESCARTADO (2026-06-28)

- **No es obligatorio.** La prueba de aceptación ya es el registro append-only `LegalAcceptance` (hash + IP + UA + versión). Generar un PDF y mandarlo por email es comodidad, no requisito legal → se elimina del alcance.
- El **email solo se usa donde es obligatorio**: avisos de subprocesadores (PR-S, art. 28.2 RGPD).
- Vía de escape para el despacho que exija firma cualificada: que suba su DPA firmado con su propio AutoFirma/certificado (`method = 'uploaded'`, reutiliza la subida de documentos), sin integración por nuestra parte.

### PR-S — Subprocesadores: página pública + aviso/objeción _(antes P2; el único email obligatorio)_

- 🚧 **parcial:** tabla `Subprocessor` versionada con hash + tabla de suscriptores → migración → **PR-y-espera**.
- **Contenido:** página pública en Next (nombre, función, país, fecha de alta + changelog); suscripción opt-in por email (Brevo); **preaviso de 30 días** + ventana de objeción de 30 días; cláusula "quien no se suscribe renuncia al aviso previo" (patrón Vanta). Cumple el art. 28.2 RGPD (notificar cambios + permitir oposición).
- **Dependencia:** PR-A (la lista se incorpora por referencia al DPA).

### PR-G — Fix menor: jurisdicción fresca en retainer

- **No toca rutas prohibidas** (cambio de lógica).
- **Contenido:** en `apps/api/src/retainer/retainer.service.ts:140,466` usar `tenant.jurisdiction` (de BD) en lugar de `user.jurisdiction` (claim JWT). No es capa legal; se incluye por ser hallazgo de la pasada.

### PR-I — Trato fiscal B2C de la suscripción propia (OSS + ITBIS RD)

- **No toca rutas prohibidas** (lógica de impuestos en el cobro/Stripe + config).
- **Contenido:** decidir el impuesto de la **suscripción de Lawzora** por `accountType` + país + (si profesional) NIF: profesional ES 21% · profesional RD no sujeto · consumidor ES 21% · consumidor UE no-ES → **OSS** (IVA del país, modelos 035/369, umbral 10.000 €) · consumidor RD → vigilar ITBIS Decreto 30-25 (registro DGII como proveedor digital extranjero). Determinado por el dato del cliente, **no por IP/divisa**.
- **Dependencia:** `accountType` de PR-A. Validación profesional (NIF/VIES) y alta OSS = acción de owner/fiscalista.

---

## 5. Secuencia recomendada

```
PR-A 🚧 (modelo+RLS+accountType, PR-y-espera)  ← HECHO (rama feat/legal-acceptance-layer)
   ├─> PR-C (clickwrap condicional por perfil) ──> PR-D (gate+re-aceptación, solo cambios obligatorios)
   ├─> PR-S 🚧 (subprocesadores: página + aviso/objeción por email — único email obligatorio)
   └─> PR-I (fiscal B2C: OSS + ITBIS RD)
PR-B (DPA + ToS consumidor + subencargados)  [contenido en paralelo; persistencia tras PR-A]
PR-E 🚧 (domicilio fiscal, PR-y-espera)   [independiente]
PR-G (fix retainer)                        [independiente, trivial]

DESCARTADO: PR-H (certificado PDF + acuse email) — no obligatorio.
```

**Acciones de owner (fuera de código):** redacción/validación jurídica del DPA y de la política de subencargados; decisión sobre si `LegalDocument` es global o por-tenant; aprobación de las migraciones de PR-A y PR-E. (Ya **no** se requieren credenciales de Signaturit: la aceptación es 100% in-house, sin proveedor ni coste por firma.)

---

## 6. Referencias de archivos clave

- Contenido legal: `apps/web/src/app/[locale]/terms/page.tsx`, `…/privacy/page.tsx`, `…/terms/legal-page.tsx`
- Esquema/BD: `apps/api/prisma/schema.prisma` (sin modelos de aceptación; patrón RLS fail-closed en migraciones `apps/api/prisma/migrations/**`)
- Alta/onboarding: `apps/web/src/app/[locale]/onboarding/page.tsx`, `apps/api/src/auth/{auth.service.ts,dto/register-tenant.dto.ts}`, `apps/web/src/middleware.ts`
- Fiscal: `packages/compliance/src/factory.ts`, `…/providers/{spain,dominican}.provider.ts`, `apps/api/src/compliance/compliance.service.ts`, `apps/api/src/ledger/ledger.service.ts`, `apps/api/src/retainer/retainer.service.ts`
- Firma: `packages/compliance/src/providers/signaturit.signature.ts`, `apps/api/src/signatures/*`, modelo `SignatureRequest`
- Antecedentes: `RAT.md`, `docs/security/SECURITY-AUDIT-2026-06-24.md` (D6-P1..P5)

---

## 7. Anexo — fundamento jurídico-fiscal (fuentes verificadas 2026-06-28)

> Investigación documental sobre fuentes oficiales. No sustituye dictamen de letrado/fiscalista colegiado, especialmente en RD (marco delgado, reforma pendiente).

### Legal — España (RGPD/AEPD)

- **Contrato de encargo obligatorio y escrito** (art. 28.3 RGPD); AEPD: _"Las relaciones entre el responsable y el encargado deben formalizarse en un contrato o en un acto jurídico que vincule al encargado"_ — [AEPD FAQ](https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/8-responsable-y-encargado-del-tratamiento); modelos en la [guía AEPD](https://www.aepd.es/guias/guia-directrices-contratos.pdf).
- **Clickwrap válido — art. 28.9 RGPD (literal):** _"El contrato u otro acto jurídico… constará por escrito, **inclusive en formato electrónico**."_ — [art. 28 RGPD](https://www.privacy-regulation.eu/es/28.htm). No exige firma. **Confirma la decisión de no usar proveedor.**
- **Subencargados — art. 28.2 (obligación, no opción):** _"…informará al responsable de cualquier cambio… dando así al responsable la oportunidad de oponerse"_; art. 28.4: mismas obligaciones al subencargado. → eleva el gap #6 (PR-B) a obligación exigible para clientes ES.
- Sanción por falta de contrato: hasta 10 M€ o 2% facturación global (art. 83.4 RGPD).

### Legal — República Dominicana (Ley 172-13)

- [Ley 172-13](https://www.one.gob.do/media/u5ohmfyp/ley-172-13.pdf) **solo define** "encargado del tratamiento"; **no regula el contrato de encargo** y está enfocada a información crediticia ([Pellerano & Herrera](https://phlaw.com/es/post/ley-172-13-sobre-proteccion-de-datos-personales/)).
- Reforma sustitutoria redactada con el Consejo de Europa (feb-2020), **pendiente en el Congreso** ([Tribunal Constitucional](https://www.tribunalconstitucional.gob.do/sala-de-prensa/noticias/expertas-exhortan-crear-en-rd-nueva-norma-de-protecci%C3%B3n-de-datos-ante-auge-de-inteligencia-artificial/)).
- **Lectura:** RD no impone hoy un DPA art. 28; alinear igualmente a RGPD (datos UE + reforma futura + estándar único).

### Fiscal — facturas que la app genera para los despachos (Q2)

- **Despacho ES:** servicios B2B se localizan en sede del destinatario (art. 69.Uno LIVA, [Cuatrecasas](https://www.cuatrecasas.com/es/spain/fiscalidad/art/regla-localizacion-prestaciones-servicios-iva)) → 21% IVA + Verifactu.
- **Verifactu aplazado a 2027** (RD-ley 15/2025): 1-ene-2027 sociedades IS, 1-jul-2027 resto/autónomos ([ICAM](https://web.icam.es/se-retrasa-al-2027-la-entrada-en-vigor-de-verifactu-la-nueva-normativa-de-facturacion-electronica/), [AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html)).
- **Despacho RD:** 18% ITBIS + **e-CF obligatorio** (Ley 32-23, 16-may-2023): Grandes Nacionales may-2024; Grandes Locales/Medianos 15-nov-2025; Pequeños/Micro/No clasificados 15-may-2026 ([The Factory HKA](https://thefactoryhka.com.do/ley-32-23-y-la-obligatoriedad-de-factura-electronica-fechas-clave-y-todo-lo-que-debes-saber/)).
- **El determinante es la jurisdicción/establecimiento del tenant, no geo/divisa** → arquitectura correcta; persiste el fix PR-G (`retainer.service.ts:140,466`).

### Fiscal — facturación propia del SaaS de Lawzora (Q1, Lawzora = sociedad española)

- **A profesionales ES (B2B):** 21% IVA repercutido.
- **A profesionales RD (B2B, fuera UE):** no sujeto a IVA español (art. 69.Uno.1º LIVA); factura sin IVA con mención de no sujeción.
- **A consumidores (B2C):** ES → 21% IVA; consumidor en otro Estado UE → IVA del país del consumidor vía **OSS/ventanilla única** (modelos 035/369, umbral 10.000 €/año) ([Your Europe](https://europa.eu/youreurope/business/taxation/vat/one-stop-shop/index_es.htm), [AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/iva-comercio-electronico/cuestiones-generales.html)); consumidor RD → no sujeto ES + ITBIS RD.
- **Protección al consumidor (B2C):** TRLGDCU (RD Leg. 1/2007) + LSSI → información precontractual + **desistimiento 14 días**, con la **excepción para SaaS** si el consumidor consiente el inicio inmediato y reconoce que pierde el desistimiento ([consumoresponde](https://www.consumoresponde.es/art%C3%ADculos/derecho_de_desistimiento_en_contratos_distancia_y_contratos_fuera_de_establecimiento), [TRLGDCU/BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555)).
- **Exposición RD a vigilar:** Decreto 30-25 (Gaceta Oficial 11186, 25-ene-2025; en vigor jul-2025) grava ITBIS 18% a proveedores digitales extranjeros con registro DGII (RNC) y declaración mensual ([Acento](https://acento.com.do/economia/decreto-30-25-gobierno-aplicara-itbis-a-servicios-digitales-extranjeros-en-rd-9464638.html)); mecanismo aún en implementación a may-2026 ([Diario Libre](https://www.diariolibre.com/economia/finanzas/2026/05/19/dgii-prepara-normas-para-cobrar-impuestos-a-las-plataformas-digitales/3539523)) → **consultar fiscalista RD**. Configurar impuesto en Stripe por `accountType`/país/ID fiscal del cliente, no por IP/divisa.

### Diseño técnico derivado

- **PR-A 🚧** modelos `LegalDocument` (catálogo versionado global; `type`, `jurisdiction?`, `locale`, `version`, `bodyHash`, `effectiveFrom`) + `LegalAcceptance` (append-only, RLS tenant_isolation; `tenantId`, `userId`, `documentType`, `version`, `documentHash`, `method` CLICKWRAP|TYPED|UPLOADED, `acceptedAt`, `ipAddress`, `userAgent`, `signerName?`, `evidenceDocId?`). Inmutabilidad vía `REVOKE UPDATE,DELETE` (patrón `fiscal_audit_immutability`).
- **PR-B** subencargados como fuente única versionada + página `/settings/subprocessors` + notificación previa (Brevo+in-app a FIRM_ADMIN) con ventana y registro de objeción (art. 28.2).
