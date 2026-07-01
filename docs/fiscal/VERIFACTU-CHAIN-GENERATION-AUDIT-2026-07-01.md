# Auditoría fiscal — Generación de la cadena Verifactu (LAW-82 / gap F-1)

**Autor:** Vera (análisis transaccional/fiscal) · **Fecha:** 2026-07-01 · **Rama:** `agents/sandbox` · **HEAD:** `77c6897`
**Alcance:** SOLO auditoría. No se toca código de firma/producción (regla LAW-82). Los fixes se derivan a tickets hijo acotados.

---

## TL;DR — la premisa del gap F-1 está INVERTIDA

LAW-74 registró F-1 como: *"nada genera el registro Verifactu encadenado (solo el firmante)"*. **La revisión del código lo desmiente:**

- **El encadenamiento (huella + `huellaAnterior`) SÍ se genera en la EMISIÓN de cada factura**, en el núcleo único `LedgerService.emitInvoiceInTx` (`apps/api/src/ledger/ledger.service.ts:345`), y **TODAS** las vías de emisión pasan por él. No existe ninguna vía que emita factura saltándose la cadena.
- Lo que **está desconectado no es la cadena, es el FIRMANTE**: `VerifactuSignerService.signRecord` (`apps/api/src/verifactu/verifactu-signer.service.ts:42`) está construido, exportado y con test unitario, pero **nunca se invoca desde el flujo de emisión** — es un *seam* huérfano. La remisión a la AEAT (`SpainTaxSubmissionProvider`) está STUBBEADA.

Reformulación correcta de F-1: *"el registro encadenado se genera bien en cada emisión; lo que falta es que ese registro se **firme** (XAdES) y se **remita** a la AEAT — hoy el firmante existe pero nadie le pasa el registro, y nada lo transmite."*

**Prioridad global: IMPORTANTE-NO-URGENTE (preparatorio).** Verifactu está gateado (sin cert → sin firma; remisión stub) y aplazado normativamente. No se recomienda trabajo urgente de código. El único riesgo **vivo hoy** es de **precisión de claims web** (§4), acotado y menor.

---

## 1. Puntos del ciclo de vida: dónde se genera/actualiza el registro encadenado

`emitInvoiceInTx` es el **único** punto donde se crea un `Invoice` (`ledger.service.ts:454` es el único `invoice.create` del backend). Bajo `pg_advisory_xact_lock` por tenant, lee la huella anterior (`ledger.service.ts:427`), llama a `provider.buildInvoiceRecord` (que calcula `recordHash = SHA-256(emisor|nº|fecha|total|huellaAnterior)` — `spain.provider.ts:114-122`), persiste `recordHash` + `previousRecordHash` en la factura y añade un `FiscalEvent` inmutable y encadenado (`appendFiscalEvent`, `ledger.service.ts:576`).

| Evento del ciclo de vida | ¿Genera cadena encadenada? | ¿Produce registro FIRMADO (XAdES) / remitido? |
|---|---|---|
| Emisión normal (alta) — `createInvoice` | ✅ vía `emitInvoiceInTx` | ❌ firmante huérfano · remisión stub |
| Anticipo / deducción / reembolso (retainer, 3 vías) | ✅ reutiliza `emitInvoiceInTx` (`retainer.service.ts:146/511/640`) | ❌ |
| Facturación recurrente / plan de pago (billing) | ✅ reutiliza `emitInvoiceInTx` (`billing.service.ts:346/447`) | ❌ |
| **Rectificativa** (R1, sustitución/diferencias) | ✅ registro NUEVO encadenado con bloque `rectificativa` (`spain.provider.ts:97-112`, param `rectification` en `emitInvoiceInTx`) | ❌ |
| **Anulación** (`RegistroAnulacion`) | ⚠️ **No existe flujo de anulación** — se corrige vía rectificativa; no se emite `RegistroAnulacion` para "factura emitida por error" | ❌ |

**Conclusión Q1:** el encadenamiento se dispara en **todos** los puntos de emisión (incluida rectificación). Los dos huecos son: (a) **ningún** punto produce el registro **firmado/remitido**; (b) no hay `RegistroAnulacion` (menor — Verifactu prioriza la rectificativa, pero el RRSIF sí contempla la anulación de facturas emitidas por error).

## 2. Riesgo si se emite/rectifica sin pasar por el firmante

Hay que separar dos riesgos que la premisa F-1 confunde:

- **Riesgo de integridad de la cadena hash: NULO.** La huella encadenada se computa en la emisión, de forma **independiente del firmante**, bajo advisory lock (evita bifurcación por concurrencia, `ledger.service.ts:397-400`) y se persiste de forma inmutable (privilegios de columna en `Invoice` + `FiscalEvent` append-only, migración `20260624120000_fiscal_audit_immutability`). El borrado de facturas emitidas está vetado en BD, así que la cadena no puede re-enraizarse. **No existe el escenario que teme el ticket** (una factura que "se escapa" de la cadena por no pasar por el firmante): el firmante no participa en el encadenamiento.

- **Riesgo de conformidad normativa: REAL pero GATEADO.** RD 1007/2023 + Orden HAC/1177/2024 exigen que el registro de facturación, además de huella encadenada + QR, esté **firmado electrónicamente** (modalidad SIF *no* VERI\*FACTU) **o** sea **remitido a la AEAT** (modalidad VERI\*FACTU — la remisión inmediata sustituye a la firma). Hoy **ninguna** de las dos está cableada en la emisión: el registro que se persiste es el `payload` JSON + huella, no un `RegistroAlta` XAdES ni un envío. Por tanto, un despacho que usara Lawzora **hoy** como su SIF para una obligación Verifactu viva **no sería conforme**. Mitigado porque: el certificado no está cargado (firma devuelve `null`, gateada) y el producto no auto-activa la remisión.

## 3. ¿Problema real hoy o preparatorio?

**Preparatorio.** Verifactu está aplazado (memoria `legal-fiscal-grounding-jun28`; RD 254/2025 desplazó las fechas de obligación de sociedades/autónomos). El código lo trata como *seam* gateado (cert-gated + remisión stub) y la web dice explícitamente que la transmisión "se activa en el onboarding fiscal". El trabajo que falta (firma del registro + remisión SOAP a la AEAT) **ya está trazado** en `docs/fiscal/FINISHING-CHECKLIST.md` y depende de material del owner: **certificado real + banco de pruebas/sandbox de la AEAT**. 

**No se recomienda trabajo urgente de código.** La base (cadena) está bien construida; lo que resta es fase de certificación, owner-gated. → **NECESITA-OWNER** (sandbox AEAT + cert real) para cerrar la conformidad plena; sin ello no es implementable ni verificable.

## 4. Claims de marketing/web en riesgo

Revisadas las cadenas Verifactu en `apps/web`. **La mayoría están correctamente matizadas** y son defendibles:

- ✅ `es.json:44`, `landing.tsx:1635/1680`, y la FAQ de precios `pricing-standalone.tsx:193-194` ("¿Verifactu ya transmite a la AEAT?" → *"La generación y el encadenamiento de la huella ya son conformes. La transmisión a la AEAT se activa en el onboarding fiscal…"*) — **precisas**: no afirman transmisión activa. Coincide con la guía de memoria.

- ⚠️ **A vigilar (importante-no-urgente):** afirmaciones **sin matizar** de conformidad plena:
  - `landing.tsx:489` — hero *"Verifactu y e-CF **conformes**"* (sin cualificar).
  - Badges repetidos *"ya conformes"* / *"conforme"* (`landing.tsx:1548`, `es.json:418`).
  
  Matiz técnico: estrictamente **solo el encadenamiento** es conforme hoy; el **registro completo** (con firma XAdES o remisión) no lo es aún (firmante huérfano + remisión stub). *"Registro fiscal encadenado conforme"* es defendible; un badge escueto *"Verifactu conforme"* puede leerse como "SIF Verifactu plenamente conforme", que no es el estado. **Recomendación:** ceñir los usos aislados de "conforme" a *"registro encadenado conforme; transmisión en el onboarding fiscal"*. Cambio de copy aditivo y seguro.

---

## Recomendación priorizada

| # | Hallazgo | Prioridad | Acción |
|---|---|---|---|
| R1 | Firma XAdES del registro + remisión a AEAT no cableadas en emisión (firmante huérfano) | Importante-no-urgente · **NECESITA-OWNER** | Fase de certificación (sandbox AEAT + cert real). Ya trazado en `FINISHING-CHECKLIST.md`. Ticket hijo **bloqueado** en owner. |
| R2 | Claims web escuetos "Verifactu conforme" sin matizar firma/remisión | Importante-no-urgente | Ticket hijo acotado (carril web): ceñir "conforme" a "registro encadenado conforme". |
| R3 | Sin flujo `RegistroAnulacion` (solo rectificativa) | Cosmético/menor | Documentado. Reevaluar en la fase de certificación (R1); Verifactu prioriza rectificativas. |
| — | **Integridad de la cadena en emisión** | ✅ Sin acción | La cadena se genera bien en todas las vías; premisa F-1 corregida. |

**Corrección para el backlog:** cerrar/re-etiquetar F-1. La cadena encadenada **no** es un gap; el gap real es firma+remisión (R1, ya trazado) y la precisión de claims (R2).
