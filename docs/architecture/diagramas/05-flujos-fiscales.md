# 05 · Flujos fiscales y de cobro

[⬅ Volver al índice](README.md)

El núcleo de facturación es **agnóstico**; el comportamiento por país entra por **adaptadores** seleccionados según `tenant.jurisdiction`.

---

## 5.1 Patrón proveedor de cumplimiento (ES / DO)

```mermaid
flowchart TB
  classDef pkg fill:#ddd6fe,stroke:#6d28d9,color:#2e1065;
  classDef ext fill:#fde68a,stroke:#b45309,color:#3f2d00;

  juris["tenant.jurisdiction"] --> fac["ComplianceProviderFactory<br/>packages/compliance"]:::pkg

  fac -->|ES| es["SpainComplianceProvider"]:::pkg
  fac -->|DO| do["DominicanComplianceProvider"]:::pkg

  subgraph interfaces["Interfaces (stateless)"]
    cp["ComplianceProvider<br/>(tax-math · validación · estructura factura)"]:::pkg
    sp["TaxSubmissionProvider<br/>(transmisión a autoridad)"]:::pkg
    sig["SignatureProvider<br/>(firma e-)"]:::pkg
  end

  es --> cp & sp
  do --> cp & sp

  tm["tax-math.ts<br/>computeInvoiceTotals()<br/>(base · IVA/ITBIS · retención · total, R2)"]:::pkg
  tid["taxid.ts<br/>NIF/CIF/NIE (ES) · RNC/Cédula (DO)"]:::pkg
  cp --> tm & tid

  sp -->|ES| aeat["AEAT · Verifactu"]:::ext
  sp -->|DO| dgii["DGII · e-CF"]:::ext
```

- **Misma `tax-math`** en la previsualización (UI read-only) y en la emisión → fuente única de la verdad.
- Tipos: ES IVA 21/10 % + IRPF 15/7 % (retención); DO ITBIS 18 % (sin retención en el MVP).
- Transmisión a la autoridad es **stubeable**: sin certificado/`DGII_ENV`, devuelve estado `STUBBED` determinista. La integridad fiscal se mantiene siempre (encadenado de hash en `FiscalEvent`).

---

## 5.2 Emisión + transmisión e-CF a la DGII (República Dominicana)

```mermaid
sequenceDiagram
  autonumber
  participant L as LedgerService (emitir factura DO)
  participant P as DominicanComplianceProvider
  participant SEQ as EcfSequence (rango eNCF autorizado)
  participant SUB as DgiiSubmissionService
  participant C as DgiiClient
  participant DGII as DGII (autoridad)
  participant DB as Invoice

  L->>P: buildInvoiceRecord(líneas, tipos)
  P->>SEQ: siguiente eNCF del rango
  P-->>L: XML e-CF + recordHash (encadenado)
  L->>DB: Invoice {ecfStatus: PENDING}
  L->>SUB: submit(xml, cert .p12 cifrado)
  SUB->>C: GET semilla
  C->>DGII: semilla
  DGII-->>C: seed
  SUB->>C: firma seed → validarSemilla
  C->>DGII: validar
  DGII-->>C: token Bearer
  SUB->>C: firma XML (XML-DSig) → recepción
  C->>DGII: POST e-CF
  DGII-->>C: TrackId
  SUB->>DB: ecfTrackId, ecfStatus: PENDING
  Note over SUB,DGII: async: consulta estado → ACCEPTED / REJECTED
```

- Custodia del certificado `.p12` **cifrado por despacho**; activación con `DGII_ENV=cert|prod`.
- Numeración por **rangos eNCF autorizados** (`EcfSequence`) — re-registrar un rango no reinicia el contador (lección de seguridad fiscal).

---

## 5.3 Verifactu (España)

```mermaid
flowchart LR
  classDef ext fill:#fde68a,stroke:#b45309,color:#3f2d00;
  emit["Emitir factura ES"] --> calc["tax-math: base + IVA + IRPF"]
  calc --> rec["buildInvoiceRecord<br/>(tipo: factura/rectificativa)"]
  rec --> chain["Encadenado SHA-256<br/>(registro previo)"]
  chain --> xml["XML Verifactu + QR (sellado)"]
  xml --> cert{¿cert subido?}
  cert -- no --> stub["STUBBED (determinista)"]
  cert -- sí --> aeat["Firma + remisión a AEAT"]:::ext
```

- Subida de certificado autoservicio por `FIRM_ADMIN`: `GET /verifactu/status` · `POST /verifactu/certificate` (.p12 + password).
- Rectificativas referencian la factura original (`Invoice.rectifiesInvoiceId`).

---

## 5.4 Suscripción SaaS, facturación recurrente, cobro y dunning

```mermaid
flowchart TB
  classDef ext fill:#fde68a,stroke:#b45309,color:#3f2d00;
  classDef sec fill:#fecaca,stroke:#b91c1c,color:#450a0a;

  subgraph saas["Suscripción de la plataforma (Stripe)"]
    plan["Plan + ciclo (3 tiers × 3 ciclos + Fundador)"] --> stripe["Stripe Checkout / Billing"]:::ext
    stripe -. webhook .-> proc["ProcessedStripeEvent (idempotencia)"]
    proc --> tstate["Tenant.subscriptionStatus / currentPeriodEnd"]
    tstate --> gate["SubscriptionInterceptor<br/>(402 si trial caducado)"]:::sec
  end

  subgraph facturacion["Facturación al cliente del despacho"]
    sched["BillingSchedule<br/>(RECURRING | INSTALLMENTS)"] --> inst["BillingInstallment (cuotas)"]
    cron["@Cron emisión"] --> inst
    inst --> inv["Invoice (e-CF/Verifactu)"]
    inv --> pay["Payment<br/>(MANUAL | Stripe Connect)"]:::ext
    inv --> retainer["RetainerAccount<br/>(ANTICIPO/SUPLIDO/GENERICO)"]
  end

  subgraph dunn["Dunning (impagos)"]
    rule["DunningRule<br/>(offsetDays · severidad · canal)"] --> cron2["@Cron runner"]
    cron2 --> rem["DunningReminder<br/>(SCHEDULED→SENT)"]
    rem --> ch["In-app · Email (Brevo) · SMS"]:::ext
  end

  inv -. vencida .-> rule
```

- Cobro por jurisdicción: **Stripe Connect** en ES; en RD el cobro online queda en stub (Stripe no opera allí) — pagos manuales registrados.
- Idempotencia de webhooks Stripe vía `ProcessedStripeEvent` (tabla global).
- `RetainerEntry` distingue **anticipos** (con factura) de **suplidos/genéricos** (no fiscales).
