# 00 · Mapa completo del sistema

> **Visión de extremo a extremo** de Lexora (interno **LegalFlow**), derivada del código en `main`.
> Recuentos verificables: **35 modelos · 21 enums · 34 módulos NestJS · 40 controladores · ~185
> endpoints · 30 tablas con RLS · 40 páginas Next.js · 7 rutas BFF**. Diagramas en Mermaid (renderizan
> en GitHub). Lo **diferido / no cableado** se marca explícitamente.
>
> Este documento es el índice visual; cada flujo enlaza al doc temático con el detalle.

---

## 1 · Mapa de dominios y módulos

Los **34 módulos NestJS** agrupados por dominio funcional. El color indica la capa.

```mermaid
flowchart TB
    subgraph CORE["⚙️ Plataforma transversal"]
        direction LR
        m_prisma["prisma · RLS"]
        m_storage["storage · cifrado"]
        m_realtime["realtime · Socket.IO"]
        m_compliance["compliance · fiscal"]
        m_app["app · guards/cron"]
    end

    subgraph IDENT["🔐 Identidad y acceso"]
        direction LR
        m_auth["auth · MFA/social"]
        m_users["users · staff/plazas"]
        m_platform["platform · super-admin"]
    end

    subgraph CRM["👥 Clientes y captación"]
        direction LR
        m_clients["clients · RGPD"]
        m_kyc["kyc · AML"]
        m_leads["leads · intake"]
    end

    subgraph CASE["📁 Expedientes"]
        direction LR
        m_matters["matters · timeline"]
        m_tasks["tasks · plazos"]
        m_messages["messages · chat"]
    end

    subgraph DOCS["📄 Documentos"]
        direction LR
        m_documents["documents · versiones"]
        m_templates["templates"]
        m_signatures["signatures · Signaturit"]
    end

    subgraph MONEY["💶 Económico y facturación"]
        direction LR
        m_ledger["ledger · costes/tiempo"]
        m_billing["billing · planes"]
        m_payments["payments · Stripe"]
        m_dunning["dunning · impagos"]
        m_retainer["retainer · provisión"]
        m_subscription["subscription · SaaS"]
    end

    subgraph PROD["🤖 Productividad e IA"]
        direction LR
        m_ai["ai · asistente/RAG"]
        m_search["search · global"]
        m_dashboard["dashboard"]
        m_reports["reports · fiscal"]
        m_calendar["calendar · iCal"]
        m_integrations["integrations · Google/MS"]
    end

    subgraph OPS["🛡️ Cumplimiento y operación"]
        direction LR
        m_audit["audit · append-only"]
        m_notifications["notifications"]
        m_settings["settings · certificado"]
        m_import["import · CSV"]
        m_health["health"]
    end

    classDef core fill:#e2e8f0,stroke:#475569,color:#1e293b
    classDef ident fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    classDef crm fill:#dcfce7,stroke:#22c55e,color:#14532d
    classDef case fill:#fef9c3,stroke:#eab308,color:#713f12
    classDef docs fill:#ffedd5,stroke:#f97316,color:#7c2d12
    classDef money fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    classDef prod fill:#fae8ff,stroke:#d946ef,color:#701a75
    classDef ops fill:#f1f5f9,stroke:#94a3b8,color:#334155

    class m_prisma,m_storage,m_realtime,m_compliance,m_app core
    class m_auth,m_users,m_platform ident
    class m_clients,m_kyc,m_leads crm
    class m_matters,m_tasks,m_messages case
    class m_documents,m_templates,m_signatures docs
    class m_ledger,m_billing,m_payments,m_dunning,m_retainer,m_subscription money
    class m_ai,m_search,m_dashboard,m_reports,m_calendar,m_integrations prod
    class m_audit,m_notifications,m_settings,m_import,m_health ops
```

---

## 2 · Mapa de navegación (40 páginas Next.js)

Tres **scopes** mutuamente excluyentes (firm / client / platform) más las páginas públicas. El
`middleware.ts` redirige según sesión y scope.

```mermaid
flowchart TD
    LANDING["/ landing"] --> LOGIN["/login"]
    LANDING --> ONB["/onboarding<br/>(alta de despacho)"]
    LANDING --> INTAKE["/intake/:token<br/>(captación pública)"]
    LOGIN -->|"MFA / social opc."| MW{{"middleware.ts<br/>gating por scope"}}
    ONB --> MW
    MW -->|"scope = firm"| DASH
    MW -->|"scope = client"| PORTAL
    PLOGIN["/platform login"] --> PLAT["/platform<br/>consola super-admin"]

    subgraph FIRM["🏢 App del despacho — scope firm (26 páginas)"]
        direction LR
        DASH["dashboard"]
        MATTERS["matters › [id] › documents › [docId]"]
        CLIENTS["clients › [id]"]
        INVOICES["invoices › [id]"]
        ECON["billing · subscription · approvals"]
        WORK["tasks · time · calendar · templates · leads"]
        COMMS["messages · notifications · documents"]
        ADMIN["settings · account · import · audit · aml · reports"]
    end

    subgraph CLIENTPORTAL["👤 Portal del cliente — scope client (4 páginas)"]
        direction LR
        PORTAL["portal"]
        PMATTERS["portal/matters › [id]"]
        PACC["portal/account"]
    end

    classDef pub fill:#f1f5f9,stroke:#94a3b8,color:#334155
    classDef firm fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    classDef client fill:#dcfce7,stroke:#22c55e,color:#14532d
    classDef plat fill:#fae8ff,stroke:#d946ef,color:#701a75
    class LANDING,LOGIN,ONB,INTAKE,MW pub
    class DASH,MATTERS,CLIENTS,INVOICES,ECON,WORK,COMMS,ADMIN firm
    class PORTAL,PMATTERS,PACC client
    class PLOGIN,PLAT plat
```

Detalle de rutas, layouts, BFF e i18n en [08-frontend-architecture.md](08-frontend-architecture.md).

---

## 3 · Diagrama de despliegue (producción)

```mermaid
flowchart LR
    user(["👤 Usuario / cliente"])

    subgraph fly["Fly.io · región fra"]
        web["lawzora-web<br/>Next.js 15 · auto-stop"]
        api["lawzora-api<br/>NestJS 10 · ≥1 fija (cron)"]
    end

    subgraph data["Datos"]
        neon[("Neon Postgres<br/>3 roles: direct/app/system<br/>RLS fail-closed")]
        r2[("Cloudflare R2 / S3<br/>blobs AES-256-GCM")]
    end

    subgraph ext["Servicios externos"]
        stripe["Stripe Connect<br/>+ Billing"]
        brevo["Brevo · email"]
        google["Google · Calendar/Gmail"]
        ms["Microsoft · Graph"]
        signaturit["Signaturit · firma"]
        anthropic["Anthropic · Claude"]
        voyage["Voyage · embeddings"]
    end

    subgraph fiscal["Fiscal — DIFERIDO"]
        aeat["AEAT · Verifactu"]
        dgii["DGII · e-CF"]
    end

    user -->|HTTPS| web
    user -->|"Bearer + WebSocket"| api
    web -->|BFF proxy| api
    api --> neon
    api --> r2
    api <-->|webhooks| stripe
    api --> brevo
    api <-->|OAuth| google
    api <-->|OAuth| ms
    api <-->|webhook HMAC| signaturit
    api --> anthropic
    api --> voyage
    api -. "registro construido, NO transmitido" .-> aeat
    api -. "registro construido, NO transmitido" .-> dgii

    classDef host fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    classDef store fill:#fef3c7,stroke:#f59e0b,color:#78350f
    classDef extern fill:#dcfce7,stroke:#22c55e,color:#14532d
    classDef def fill:#fafafa,stroke:#d1d5db,color:#9ca3af,stroke-dasharray:5 5
    class web,api host
    class neon,r2 store
    class stripe,brevo,google,ms,signaturit,anthropic,voyage extern
    class aeat,dgii def
```

Pipeline CI/CD (9 jobs) e infraestructura en [09-infrastructure-cicd.md](09-infrastructure-cicd.md).

---

## 4 · Asistente IA y búsqueda semántica (RAG)

Provider **Anthropic** (`AI_MODEL`, por defecto `claude-opus-4-6`). Embeddings con **Voyage**.
Ambos **gateados**: sin `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` el motor responde `isEnabled()=false`
→ `503` y la UI oculta la feature (`GET /ai/status`). RAG sin pgvector: vectores `Float[]` en la tabla
`AiEmbedding` y **similitud coseno en la app**.

```mermaid
sequenceDiagram
    autonumber
    participant U as Abogado
    participant API as ai.controller
    participant SVC as AiService
    participant DB as Postgres (RLS)
    participant EMB as Voyage (embeddings)
    participant LLM as Anthropic (Claude)

    rect rgb(245,240,255)
    Note over U,DB: Indexar — POST /ai/index/matters/:id
    U->>API: reindexar expediente
    API->>SVC: carga matter + tareas + documentos
    SVC->>EMB: embed(chunks)
    EMB-->>SVC: vectores Float[]
    SVC->>DB: borra + inserta AiEmbedding (atómico)
    end

    rect rgb(240,248,255)
    Note over U,LLM: Preguntar — POST /ai/matters/:id/ask
    U->>API: pregunta sobre el expediente
    API->>SVC: askMatter(user, id, q)
    SVC->>DB: carga fuentes citables (cabecera/tareas/docs)
    SVC->>LLM: draft(system + fuentes + q)<br/>adjunta PDF/imagen si <8MB
    LLM-->>SVC: respuesta con citas [[id]]
    SVC->>SVC: extrae citas + calcula confianza
    SVC-->>U: { output, citations, confidence, model }
    end

    rect rgb(245,255,245)
    Note over U,EMB: Buscar — POST /ai/search
    U->>API: consulta semántica
    API->>SVC: search(q, limit)
    SVC->>EMB: embed([q])
    SVC->>DB: AiEmbedding.findMany (tenant-scoped)
    SVC->>SVC: coseno(qvec, cada vec) → top-N
    SVC-->>U: mejores fragmentos por referencia
    end
```

Features cableadas: **asistente anclado al expediente** (citado), **resumen de expediente**,
**resumen/extracción de documento**, **borrador desde plantilla**, **borrador de correo**, **búsqueda
semántica**. Contratos en `packages/domain/src/contracts/ai-assistant.ts`; implementación en
`apps/api/src/ai/`.

---

## 5 · Facturación: ledger → factura → cobro

El motor fiscal vive en `LedgerService.emitInvoiceInTx()`: bloqueo transaccional (`pg_advisory_xact_lock`)
sobre la serie, numeración sin huecos, encadenamiento `previousRecordHash` (Verifactu) y registro
fiscal vía `ComplianceProvider` por jurisdicción.

```mermaid
flowchart LR
    subgraph entradas["Entradas económicas"]
        time["TimeEntry<br/>partes de horas"]
        cost["LedgerEntry<br/>costes propuestos"]
        prov["RetainerEntry<br/>provisión/anticipo"]
        plan["BillingSchedule<br/>planes recurrentes/cuotas"]
    end

    approve{"¿coste<br/>aprobado?"}
    cost --> approve
    approve -->|sí| emit
    approve -->|no| hold["queda PROPOSED"]

    time --> emit
    prov --> emit
    plan -->|"cron 06:00 / manual"| emit

    emit["emitInvoiceInTx()<br/>lock serie · nº sin huecos<br/>+ ComplianceProvider"]
    emit --> inv["Invoice ISSUED<br/>+ InvoiceLine + recordHash"]
    inv --> ledgerI["LedgerEntry INVOICE"]

    inv --> pay{"cobro"}
    pay -->|manual| pm["Payment MANUAL"]
    pay -->|online| stripe["Stripe Checkout<br/>→ webhook"]
    pay -->|provisión| ret["RetainerEntry APPLICATION"]
    pm --> recon
    stripe --> recon
    ret --> recon
    recon["reconcile()<br/>amountPaid += · idempotente"]
    recon --> status["Invoice PARTIAL / PAID<br/>+ LedgerEntry PAYMENT"]
    inv -.->|si vence| dun["DunningReminder"]

    classDef in fill:#fef9c3,stroke:#eab308,color:#713f12
    classDef proc fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    classDef out fill:#dcfce7,stroke:#22c55e,color:#14532d
    classDef warn fill:#fee2e2,stroke:#ef4444,color:#7f1d1d
    class time,cost,prov,plan in
    class emit,recon proc
    class inv,ledgerI,pm,ret,status out
    class stripe,dun,hold warn
```

---

## 6 · Cobro online con Stripe (Connect)

```mermaid
sequenceDiagram
    autonumber
    participant C as Cliente (portal)
    participant API as payments.controller
    participant SVC as PaymentsService
    participant ST as Stripe Connect
    participant WH as payments/webhook (público)
    participant DB as Postgres

    C->>API: POST /invoices/:id/checkout
    API->>SVC: createCheckout(invoice, urls)
    SVC->>ST: crea sesión (cargo directo en cuenta conectada)
    ST-->>C: redirección a Stripe (paga)
    Note over SVC: NO crea Payment todavía
    ST->>WH: checkout.session.completed (firmado)
    WH->>WH: verifica firma HMAC
    WH->>SVC: runWithTenant(tenantId) → reconcile()
    SVC->>DB: Payment SUCCEEDED (idempotente por providerRef)
    SVC->>DB: Invoice.amountPaid += · status PARTIAL/PAID
    SVC->>DB: LedgerEntry PAYMENT
```

Onboarding Stripe Connect (`POST /payments/connect/onboard`) es solo **FIRM_ADMIN**. RD usa un **stub**
(Stripe no opera en RD). Detalle en [05-compliance-providers.md](05-compliance-providers.md).

---

## 7 · Dunning (recordatorios de impago)

Reglas escalonadas por jurisdicción (+1 `REMINDER`, +7 `WARNING`, +15 `FINAL`). Cron diario 06:00 +
ejecución manual. Canal **IN_APP** cableado; **EMAIL/SMS** = fase 2 (se marcan `SKIPPED`). Idempotente
por `@@unique (tenantId, invoiceId, offsetDays)`.

```mermaid
flowchart TD
    cron(["⏰ Cron 06:00 / POST /dunning/run"]) --> ev["evaluateTenant()"]
    ev --> q["Invoices vencidas<br/>(status ∉ PAID/CANCELLED · dueDate < hoy)"]
    q --> loop{"por cada factura<br/>× cada regla"}
    loop -->|"dueDate + offset ≤ hoy"| ens["ensureReminder()"]
    ens --> dispatch{"canal"}
    dispatch -->|IN_APP| notif["Notification → SENT"]
    dispatch -->|"EMAIL/SMS"| skip["SKIPPED (fase 2)"]
    ens -->|"ya existe (P2002)"| exists["idempotente"]
    notif --> audit["AuditLog"]

    classDef trig fill:#fae8ff,stroke:#d946ef,color:#701a75
    classDef proc fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    classDef ok fill:#dcfce7,stroke:#22c55e,color:#14532d
    classDef warn fill:#fef3c7,stroke:#f59e0b,color:#78350f
    class cron trig
    class ev,q,loop,ens,dispatch proc
    class notif,audit ok
    class skip,exists warn
```

---

## 8 · Provisión de fondos (retainer)

Un `RetainerAccount` por expediente (saldo cacheado, transaccional con `SELECT … FOR UPDATE`).
Movimientos auditados en `RetainerEntry`.

```mermaid
stateDiagram-v2
    [*] --> Saldo
    Saldo --> Saldo: DEPOSIT (+) — SUPLIDO/GENERICO
    Saldo --> Saldo: ANTICIPO (+) — emite factura + IVA al cobro
    Saldo --> Saldo: APPLICATION (−) — aplica a factura
    Saldo --> Saldo: REFUND (−) — devolución (rectificativa)
    Saldo --> Saldo: ADJUSTMENT (±)
    note right of Saldo
        Invariante: balance == Σ(entries)
        ANTICIPO se realiza por DEDUCCIÓN
        en la factura final, no por APPLICATION
    end note
```

Flujos: `deposit`, `anticipo`, `apply`, `final-invoice` (deduce anticipos), `refund`. Ver
[05-compliance-providers.md](05-compliance-providers.md) y `retainer.controller`.

---

## 9 · Integraciones: OAuth + correo del expediente

Google y Microsoft. Tokens **cifrados en reposo** (AES-256-GCM) en `OAuthConnection`. `state` firmado
HMAC (CSRF). El callback corre con rol **system** (sin sesión). Correo proveedor-neutral vía
`MailService` → `MatterEmail` (idempotente por `gmailId`).

```mermaid
sequenceDiagram
    autonumber
    participant U as Abogado
    participant API as integrations.controller
    participant PROV as Google / Microsoft
    participant CB as .../callback (público)
    participant DB as Postgres

    rect rgb(240,248,255)
    Note over U,DB: Conectar
    U->>API: GET /integrations/google/connect
    API-->>U: URL de consentimiento (state firmado)
    U->>PROV: autoriza
    PROV->>CB: code + state
    CB->>CB: verifica state · canjea tokens
    CB->>DB: upsert OAuthConnection (tokens cifrados)
    end

    rect rgb(245,255,245)
    Note over U,DB: Calendar push · POST /calendar/sync
    U->>API: sync
    API->>PROV: upsert eventos (id determinista por tarea)
    PROV-->>API: pushed / errors
    end

    rect rgb(255,250,240)
    Note over U,DB: Correo · GET /mail/recent · POST /mail/attach|send
    U->>API: lista bandeja / adjunta / envía
    API->>PROV: Gmail / Graph
    API->>DB: MatterEmail (IN/OUT · dedup por gmailId)
    end
```

Detalle y setup en [GOOGLE_OAUTH_SETUP.md](../setup/GOOGLE_OAUTH_SETUP.md) /
[MICROSOFT_OAUTH_SETUP.md](../setup/MICROSOFT_OAUTH_SETUP.md).

---

## 10 · Suscripción SaaS del despacho

Cobro **por plaza** (FIRM*ADMIN + LAWYER activos), ciclo `MONTHLY`/`ANNUAL` (2 meses gratis), trial 14
días, cupo \_founder*. El acceso se gatea por interceptor; los endpoints de suscripción llevan
`@AllowExpired()` para poder reactivar.

```mermaid
stateDiagram-v2
    [*] --> TRIAL: alta de despacho
    TRIAL --> ACTIVE: checkout Stripe OK
    TRIAL --> EXPIRED: fin de trial sin pago
    ACTIVE --> PAST_DUE: pago fallido
    PAST_DUE --> ACTIVE: reintento OK
    ACTIVE --> CANCEL_SCHEDULED: cancel (cancelAtPeriodEnd)
    CANCEL_SCHEDULED --> ACTIVE: resume
    CANCEL_SCHEDULED --> CANCELED: fin de periodo
    EXPIRED --> ACTIVE: checkout
    CANCELED --> ACTIVE: checkout
    note right of ACTIVE
        Webhooks Stripe (subscription.*)
        actualizan: subscriptionStatus, seats,
        billingCycle, currentPeriodEnd
    end note
```

---

## 11 · Firma electrónica (Signaturit)

```mermaid
sequenceDiagram
    autonumber
    participant U as Abogado
    participant API as signatures.controller
    participant SIG as Signaturit
    participant WH as signatures/webhook (público)
    participant DB as Postgres

    U->>API: POST /signatures (versión + firmante)
    API->>SIG: crea solicitud
    SIG-->>API: externalId + signUrl
    API->>DB: SignatureRequest PENDING
    SIG->>WH: evento (firmado/rechazado/expirado)
    WH->>WH: verifica HMAC
    WH->>DB: actualiza status (SIGNED/DECLINED/…) + completedAt
```

---

## 12 · Captación: lead → cliente

Formulario público de intake (`/api/public/intake/:token`, throttle 5/min/IP) o alta manual. La
conversión enlaza `Client` + `Matter`.

```mermaid
flowchart LR
    form["intake público<br/>:token"] --> lead
    manual["alta manual"] --> lead
    lead["Lead NEW"] --> contact["CONTACTED → QUALIFIED"]
    contact --> conv{"POST /leads/:id/convert"}
    conv --> client["Client"]
    conv --> matter["Matter"]
    contact -.-> lost["LOST"]

    classDef pub fill:#f1f5f9,stroke:#94a3b8,color:#334155
    classDef proc fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    classDef ok fill:#dcfce7,stroke:#22c55e,color:#14532d
    class form,manual pub
    class lead,contact,conv proc
    class client,matter ok
    class lost pub
```

---

## 13 · Mapa de endpoints por dominio (~185)

| Dominio                          | Controladores                                                                                             | Endpoints |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| Auth e identidad                 | `auth`, `platform-auth`, `users`                                                                          | ~25       |
| Portal del cliente               | `portal`                                                                                                  | 12        |
| Clientes y KYC                   | `clients`, `kyc`                                                                                          | 13        |
| Expedientes                      | `matters`                                                                                                 | 8         |
| Documentos / plantillas / firmas | `documents`, `templates`, `signatures`, `signatures-webhook`                                              | 19        |
| Tareas y tiempo                  | `tasks`                                                                                                   | 8         |
| Económico                        | `ledger`, `payments`, `payments-webhook`, `dunning`, `retainer`, `billing`                                | 38        |
| Suscripción SaaS                 | `subscription`, `subscription-webhook`                                                                    | 10        |
| Notificaciones y mensajes        | `notifications`, `messages`                                                                               | 6         |
| Integraciones / calendar / mail  | `integrations`, `google-callback`, `microsoft`, `microsoft-callback`, `mail`, `calendar`, `calendar-feed` | 14        |
| IA y búsqueda                    | `ai`, `search`                                                                                            | 10        |
| Leads e intake                   | `leads`, `intake`                                                                                         | 10        |
| Plataforma / admin               | `platform`                                                                                                | 5         |
| Reports / dashboard / audit      | `reports`, `dashboard`, `audit`                                                                           | 5         |
| Ajustes e importación            | `settings`, `import`                                                                                      | 6         |
| Salud                            | `health`                                                                                                  | 1         |

Tabla exhaustiva (método · ruta · roles) en [07-api-reference.md](07-api-reference.md).

---

Enlazado desde [README de arquitectura](README.md). Para los cimientos transversales (auth, RLS,
cifrado, realtime) ver docs [02](02-auth-and-sessions.md)–[04](04-encryption-and-secrets.md).
