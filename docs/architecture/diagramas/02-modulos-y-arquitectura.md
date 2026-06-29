# 02 · Módulos y arquitectura interna

[⬅ Volver al índice](README.md)

---

## 2.1 Monorepo (contenedores · C4 nivel 2)

```mermaid
flowchart TB
  classDef core fill:#bfdbfe,stroke:#1e40af,color:#0b2559;
  classDef pkg fill:#ddd6fe,stroke:#6d28d9,color:#2e1065;
  classDef data fill:#bbf7d0,stroke:#15803d,color:#052e16;

  subgraph apps
    web["apps/web<br/>Next.js 15 · App Router<br/>UI + BFF de auth"]:::core
    api["apps/api<br/>NestJS · 60 módulos<br/>REST /api + Socket.IO"]:::core
  end

  subgraph packages["packages (compartidos)"]
    domain["@legalflow/domain<br/>tipos · enums · pricing ·<br/>contracts · feature-guide"]:::pkg
    compliance["@legalflow/compliance<br/>tax-math · taxid ·<br/>proveedores ES/DO · firma · deadlines"]:::pkg
    config["@legalflow/config<br/>config compartida"]:::pkg
  end

  db[("PostgreSQL / Prisma")]:::data

  web -->|HTTP Bearer + WS| api
  web --> domain
  api --> domain
  api --> compliance
  api --> config
  compliance --> domain
  api --> db
```

---

## 2.2 Módulos del API por dominio (C4 nivel 3)

Los **60 módulos** de `apps/api/src` agrupados en 16 dominios funcionales.

```mermaid
flowchart LR
  classDef core fill:#bfdbfe,stroke:#1e40af,color:#0b2559;
  classDef cross fill:#fecaca,stroke:#b91c1c,color:#450a0a;

  subgraph IDN["🔐 Identidad y acceso"]
    auth[auth]; users[users]; legal[legal]; platform[platform]; portal[portal]; kyc[kyc]
  end
  subgraph CASE["📁 Expedientes"]
    matters[matters]; clients[clients]; engagement[engagement]; leads[leads]
  end
  subgraph FISC["💶 Fiscal y cobro"]
    ledger[ledger]; billing[billing]; payments[payments]; retainer[retainer]; dunning[dunning]; subscription[subscription]
  end
  subgraph DOC["📄 Documentos"]
    documents[documents]; folders[folders]; templates[templates]; clauses[clauses]; docpkg[document-packages]; presentations[presentations]; storage[storage]; signatures[signatures]
  end
  subgraph COMM["💬 Comunicación"]
    messages[messages]; messaging[messaging]; notifications[notifications]; inbound[inbound-email]; snippets[email-snippets]
  end
  subgraph TRX["🤝 Transaccional / deal"]
    deal[deal]; closing[closing]; dataroom[data-room]; cosec[company-secretary]
  end
  subgraph FISCREG["🌍 Cumplimiento regional"]
    dgii[dgii]; verifactu[verifactu]; judicial[judicial-notifications]; compliance[compliance]
  end
  subgraph AIA["🤖 IA y productividad"]
    ai[ai]; productivity[productivity]; search[search]
  end
  subgraph ANALYT["📊 Analítica"]
    reports[reports]; dashboard[dashboard]; savedviews[saved-views]
  end
  subgraph SCHED["📅 Agenda"]
    scheduling[scheduling]; calendar[calendar]; tasks[tasks]
  end
  subgraph INTEG["🔌 Integraciones"]
    integrations[integrations]; import[import]
  end
  subgraph PLAT["⚙️ Plataforma / transversal"]
    realtime[realtime]; webhooks[webhooks]; audit[audit]; settings[settings]; prisma[prisma]; commonm[common]; healthm[health]; debug[debug]
  end
```

> Módulos transversales **`common` / `prisma`** proveen guards, decoradores e interceptores y el cliente Prisma tenant-aware que usan todos los demás. `data-room` y `company-secretary` agrupan varios submodelos (ver [ERD](03-modelo-datos.md)).

---

## 2.3 Ciclo de vida de una petición (guards · interceptores · RLS)

Orden real de la cadena global definida en `app.module.ts` + `main.ts`.

```mermaid
sequenceDiagram
  autonumber
  participant C as Navegador
  participant CF as Cloudflare
  participant H as Helmet+CORS (main.ts)
  participant TH as ThrottlerGuard<br/>(300/min · Redis)
  participant JA as JwtAuthGuard<br/>(@Public bypass)
  participant TC as TenantContextInterceptor<br/>(AsyncLocalStorage)
  participant SUB as SubscriptionInterceptor<br/>(402 si trial caducado)
  participant LA as LegalAcceptanceInterceptor<br/>(403 si escritura sin aceptación)
  participant RB as @Roles / @RequiresFeature
  participant SVC as Controller + Service
  participant PR as PrismaService (rol app)
  participant PG as Postgres (RLS)

  C->>CF: HTTPS request
  CF->>H: forward
  H->>TH: headers seguros + CORS fail-closed
  TH->>JA: ok (rate limit)
  JA->>TC: valida JWT → req.user {tenantId, roles}
  TC->>SUB: fija tenant en ALS
  SUB->>LA: suscripción activa
  LA->>RB: aceptación legal vigente
  RB->>SVC: rol/feature permitido
  SVC->>PR: query
  PR->>PG: BEGIN → SET app.tenant_id → query → COMMIT
  PG-->>PR: solo filas del tenant (fail-closed)
  PR-->>SVC: datos
  SVC-->>C: respuesta JSON
  Note over SVC,PG: Mutaciones → AuditLog (append-only)
```

### Decoradores y gates

| Decorador                      | Efecto                                                                      |
| ------------------------------ | --------------------------------------------------------------------------- |
| `@Public`                      | Salta JWT (login, registro, refresh, health, webhooks firmados)             |
| `@Roles(...)`                  | Exige uno de los roles (FIRM_ADMIN / LAWYER / CLIENT)                       |
| `@RequiresFeature(x)`          | Exige que el plan incluya la feature (p. ej. `ai`, `data-room`)             |
| `@AllowExpired`                | Permite acceso aunque el trial haya caducado (auth/checkout/status)         |
| `@AllowWithoutLegalAcceptance` | Permite escritura sin aceptación legal vigente                              |
| `PlatformGuard`                | JWT separado de super-admin (`PLATFORM_JWT_SECRET`), cross-tenant, auditado |

---

## 2.4 Multitenancy y aislamiento (RLS de 3 roles)

```mermaid
flowchart TB
  classDef core fill:#bfdbfe,stroke:#1e40af,color:#0b2559;
  classDef data fill:#bbf7d0,stroke:#15803d,color:#052e16;
  classDef sec fill:#fecaca,stroke:#b91c1c,color:#450a0a;

  req["Petición autenticada<br/>req.user.tenantId"]:::core

  subgraph runtime["PrismaService"]
    appc["App client<br/>rol legalflow_app<br/>(sin BYPASSRLS,<br/>sin UPDATE en columnas fiscales)"]:::core
    sysc["System client<br/>rol legalflow_system<br/>(BYPASSRLS)"]:::sec
  end

  req --> appc
  login["Rutas cross-tenant<br/>login · registro · carga de tokens"] --> sysc

  appc -->|"SET app.tenant_id por transacción"| pg
  sysc -->|"sin filtro de tenant"| pg
  pg[("Postgres · políticas RLS<br/>current_setting('app.tenant_id')")]:::data

  pg -. "tablas append-only:<br/>FiscalEvent · LedgerEntry ·<br/>AuditLog · LegalAcceptance" .-> guard["Inmutabilidad fiscal/legal<br/>(privilegios de columna + triggers)"]:::sec
```

- **Fail-closed:** sin contexto de tenant, las consultas devuelven **0 filas**.
- **Mínimo privilegio:** al arrancar se verifica que el rol de runtime no es superusuario, no tiene BYPASSRLS y no puede actualizar columnas de `Invoice` (fatal en prod si falla).
- **Tablas globales** (no tenant-scoped): `Permission`, `LegalDocument`, `ProcessedStripeEvent`.
