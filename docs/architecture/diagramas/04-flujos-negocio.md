# 04 · Flujos de negocio

[⬅ Volver al índice](README.md)

---

## 4.1 Autenticación, sesión y refresco de token

Modelo BFF: token de acceso **en memoria**, refresh en **cookie httpOnly**.

```mermaid
sequenceDiagram
  autonumber
  participant U as Usuario
  participant MW as middleware.ts<br/>(i18n + gate de sesión/rol)
  participant BFF as Next.js BFF<br/>/api/auth/*
  participant API as NestJS auth
  participant DB as Postgres (system role)

  U->>MW: GET /es/dashboard
  alt sin cookie lf_session
    MW-->>U: redirect /es/login
  end
  U->>BFF: POST /api/auth/login {email, password}
  BFF->>API: login
  API->>DB: valida credenciales (rol system, cross-tenant)
  alt MFA activado
    API-->>BFF: { mfaRequired, mfaToken }
    U->>BFF: POST /api/auth/mfa/login {code}
    BFF->>API: verifica TOTP
  end
  API-->>BFF: accessToken + set-cookie refresh (httpOnly)
  BFF-->>U: accessToken (memoria) + cookies lf_session/lf_scope

  Note over U,API: Petición normal
  U->>API: GET /api/... (Authorization: Bearer)
  alt 401 token caducado
    U->>BFF: POST /api/auth/refresh (cookie refresh)
    BFF->>API: rota refresh (detección de reuso)
    API-->>BFF: nuevo accessToken
    U->>API: reintento 1 vez
  end
```

- Cookies: `lf_session` (gate de middleware), `lf_scope` (`firm` | `client`) para RBAC de rutas.
- Multi-despacho: un mismo email puede pertenecer a varios tenants → selección de tenant en login.
- Social login (Google/Microsoft/OIDC) → `POST /api/auth/social/finish {ticket}`.

---

## 4.2 Gating de acceso a la app interna (RBAC en el borde)

```mermaid
flowchart TB
  classDef sec fill:#fecaca,stroke:#b91c1c,color:#450a0a;
  start(["Petición a una ruta /[locale]/..."]) --> plat{"¿es /platform?"}
  plat -- sí --> platauth["Auth super-admin aparte"]:::sec
  plat -- no --> pub{"¿ruta pública?<br/>login·legal·intake·dataroom"}
  pub -- sí --> okpub[Servir]
  pub -- no --> sess{¿cookie de sesión?}
  sess -- no --> tologin["redirect /login"]:::sec
  sess -- sí --> scope{scope del usuario}
  scope -- "client en /dashboard" --> toportal["redirect /portal"]:::sec
  scope -- "firm en /portal" --> todash["redirect /dashboard"]:::sec
  scope -- coincide --> okapp[Servir + AppShell/PortalShell]
```

---

## 4.3 Ciclo de vida de un documento + firma electrónica

```mermaid
flowchart LR
  classDef ext fill:#fde68a,stroke:#b45309,color:#3f2d00;
  classDef data fill:#bbf7d0,stroke:#15803d,color:#052e16;

  subir["Subir / generar<br/>(plantilla · IA · import nube)"] --> ver["DocumentVersion<br/>(hash + cifrado AES-256-GCM)"]
  ver --> r2[("R2")]:::data
  ver --> rev{¿revisión?}
  rev -- "DocumentReview" --> aprob["Aprobado / cambios"]
  aprob --> firma{¿firmar?}
  firma -- "SignatureRequest" --> sg["Signaturit (stub)"]:::ext
  sg -. "webhook HMAC-SHA256<br/>(externalId)" .-> upd["status: SIGNED"]
  aprob --> usos["Usos: adjuntar a chat ·<br/>data room · email · factura"]
```

- Generación por **lote** (`document-packages`), **plantillas** (`templates`) y **cláusulas** (`clauses`).
- Import desde nube: Google Drive (Picker + `drive.file`), OneDrive/SharePoint (server-side).
- Add-ins de **Word/Outlook** insertan cláusulas/snippets directamente desde Office (iframe + CSP `frame-ancestors`).

---

## 4.4 Transaccional: deal · closing · data room

```mermaid
flowchart TB
  classDef ext fill:#fde68a,stroke:#b45309,color:#3f2d00;

  matter["Matter (operación M&A / inmobiliaria / mercantil)"] --> wg["DealParty<br/>(working group: comprador/vendedor/asesores)"]
  matter --> mile["DealMilestone<br/>(signing · closing · longstop · funds flow)"]
  matter --> cl["ClosingChecklist"]
  cl --> items["ClosingChecklistItem<br/>(condition precedent · deliverable ·<br/>signature page) por fase + escrow"]
  matter --> disc["DisclosureSchedule (R&W)"]
  matter --> reg["RegistryFiling<br/>(Reg. Mercantil / Propiedad / RD)"]
  matter --> dr["DataRoom"]
  dr --> drf["Carpetas + documentos + grupos de permiso"]
  dr --> grant["DataRoomGrant<br/>(enlace mágico por email + rol)"]:::ext
  grant --> qna["Q&A + DataRoomAccessLog (auditoría)"]
```

> Distinción clave: **longstop / fechas de operación ≠ plazos procesales** (estos últimos viven en `Task.isProcedural` y `JudicialNotification`). La secretaría corporativa (actas, capital, obligaciones registrales recurrentes) cuelga del `Client`, no del `Matter`.

---

## 4.5 Mensajería en tiempo real (Socket.IO + Redis)

```mermaid
sequenceDiagram
  autonumber
  participant A as Cliente A
  participant B as Cliente B
  participant GW as RealtimeGateway<br/>(Socket.IO)
  participant RD as Redis adapter
  participant DB as Postgres

  A->>GW: connect (JWT en handshake)
  GW->>GW: join user:A, tenant:T
  A->>GW: subscribe matter:M (assertMatterChatAccess)
  A->>GW: enviar mensaje (matter M)
  GW->>DB: persistir Message
  GW->>RD: broadcast room matter:M
  RD-->>GW: fan-out a otras instancias
  GW-->>B: nuevo mensaje (matter:M)
  Note over A,GW: presencia y "typing" son efímeros<br/>read-receipts persisten (MatterReadState)
```

- **3 canales de chat**: por expediente (`messages`, staff+cliente), interno entre staff (`messaging`: DM 1:1 + canal General), y privado con la IA Zora (`AiConversation`).
- Adapter Redis activo solo si `REDIS_URL` está definido (necesario para multi-instancia en Fly); fallback en memoria.
- Notificaciones in-app y toasts viajan por los mismos sockets (`user:<id>`).
