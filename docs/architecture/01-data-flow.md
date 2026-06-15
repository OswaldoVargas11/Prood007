# 01 · Flujo de datos de extremo a extremo

> Cómo viaja una petición desde el navegador hasta Postgres y vuelta, con el contexto de tenant
> fijado. Incluye los caminos de **documentos** (subida/descarga cifrada) y **tiempo real**.
> ADRs relacionados: D-013/D-020 (RLS), D-019 (BFF), D-021 (cifrado).

## Petición autenticada típica (lectura de datos de negocio)

```mermaid
sequenceDiagram
    participant B as Navegador (React + TanStack Query)
    participant API as NestJS API (:4000/api)
    participant TG as ThrottlerGuard
    participant JG as JwtAuthGuard
    participant RG as RolesGuard
    participant IC as TenantContextInterceptor
    participant P as PrismaService (rol app)
    participant PG as PostgreSQL (RLS)

    B->>API: GET /api/matters  (Authorization: Bearer <access>)
    API->>TG: cadena de guards global
    TG->>JG: rate-limit OK
    JG->>JG: valida JWT (firma + exp). Si @Public → exime
    JG->>RG: req.user = { userId, tenantId, roles, scope }
    RG->>RG: ¿@Roles satisfecho? (FIRM_ADMIN/LAWYER/CLIENT)
    RG->>IC: autorizado
    IC->>IC: fija el contexto de tenant (AsyncLocalStorage)
    IC->>P: controller → service → prisma.matter.findMany()
    P->>PG: BEGIN; SELECT set_config('app.tenant_id', <tenantId>, true)
    P->>PG: SELECT ... FROM "Matter"  (RLS filtra por app.tenant_id)
    PG-->>P: solo filas del tenant (sin contexto → 0 filas)
    P-->>API: COMMIT; resultados
    API-->>B: 200 JSON
```

**Claves del camino:**

1. **Prefijo global** `api` (`app.setGlobalPrefix('api')` en `main.ts`) + `helmet()` + CORS por
   `CORS_ORIGINS`.
2. **Cadena de guards global** (registrada como `APP_GUARD`): `ThrottlerGuard` (app.module) →
   `JwtAuthGuard` → `RolesGuard` (auth.module). `@Public()` exime del JWT; `@Roles(...)` restringe.
3. **Contexto de tenant**: el `TenantContextInterceptor` (`APP_INTERCEPTOR`) toma `tenantId` del JWT y
   lo deja disponible; `PrismaService` envuelve cada operación de modelo en una transacción que
   ejecuta `set_config('app.tenant_id', <tenantId>, true)` (GUC **transaction-local**). Ver
   [03-multitenancy-and-rls.md](03-multitenancy-and-rls.md).
4. **Fail-closed**: sin `app.tenant_id` fijado, las políticas RLS devuelven **0 filas** (no error).

## El BFF y los dos caminos del cliente

El web expone un **BFF** propio (`apps/web/src/app/api/auth/*`) que es el **único** que toca la cookie
de sesión httpOnly. El resto de datos los pide el navegador **directamente** a la API con el access
token en memoria.

```mermaid
flowchart LR
    subgraph nav["Navegador"]
        mem["access token<br/>(en memoria JS)"]
        rq["TanStack Query / fetch"]
    end
    subgraph webc["Web (Next.js)"]
        mw["middleware.ts<br/>(gating servidor)"]
        bff["BFF /api/auth/*<br/>(cookie httpOnly)"]
    end
    apic["API NestJS"]

    rq -->|"1· navegación SSR"| mw
    rq -->|"2· login/refresh/logout"| bff
    bff -->|"proxya a Nest"| apic
    bff -->|"Set-Cookie refresh httpOnly"| mem
    rq -->|"3· datos de negocio (Bearer)"| apic
    mem -.->|"adjunta access"| rq
```

- **Camino 1 (navegación):** el `middleware.ts` lee la cookie de sesión en el servidor y redirige
  según haya sesión y scope (firm → `/dashboard`, client → `/portal`).
- **Camino 2 (auth):** `login`/`refresh`/`logout`/`register-tenant` van al **BFF**, que proxya a Nest y
  gestiona la cookie `lf_session` (refresh, httpOnly). El **access** vuelve al cliente y vive en memoria.
- **Camino 3 (negocio):** todo lo demás (matters, clients, ledger…) lo llama el cliente directo a la
  API con `Authorization: Bearer`. Ver [02-auth-and-sessions.md](02-auth-and-sessions.md).

## Subida y descarga de documentos (cifrado en reposo)

```mermaid
sequenceDiagram
    participant B as Navegador
    participant API as documents.controller
    participant SVC as documents.service
    participant ENC as EncryptedStorageProvider
    participant OBJ as Local/S3 (MinIO)
    participant PG as Postgres (metadatos)

    Note over B,PG: SUBIDA — POST /api/documents (multipart) o /:id/versions
    B->>API: multipart (file)
    API->>SVC: crea Document/DocumentVersion (metadatos)
    SVC->>ENC: put(bytes)
    ENC->>ENC: AES-256-GCM · envelope LFENC1 + IV + tag + ciphertext
    ENC->>OBJ: guarda blob cifrado
    SVC->>PG: persiste metadatos (tenant-scoped, RLS)
    API-->>B: 201 metadatos de la versión

    Note over B,PG: DESCARGA — GET /api/documents/versions/:versionId/download
    B->>API: GET (Bearer)
    API->>SVC: resuelve versión (RLS comprueba tenant)
    SVC->>ENC: get(key)
    ENC->>OBJ: lee blob cifrado
    ENC->>ENC: valida MAGIC + descifra (GCM verifica integridad)
    ENC-->>API: bytes en claro
    API-->>B: stream del archivo
```

- El **contenido** del documento se cifra a nivel de aplicación con `EncryptedStorageProvider`
  (AES-256-GCM) **antes** de tocar el backend de objetos; los **metadatos** (nombre, versión, estado de
  revisión) viven en Postgres y están protegidos por RLS. Ver [04-encryption-and-secrets.md](04-encryption-and-secrets.md).
- Si no hay `DATA_ENCRYPTION_KEY`, el cifrado se **desactiva** (modo desarrollo); en producción es
  **obligatorio** (arranque falla sin clave).

## Tiempo real (Socket.IO)

```mermaid
sequenceDiagram
    participant B as Navegador (socket.io-client)
    participant GW as realtime.gateway
    participant SVC as Services (documents/ledger/tasks/messages)

    B->>GW: connect (handshake con token)
    GW->>GW: valida JWT → join "user:<sub>" y "tenant:<tid>"
    B->>GW: emit "matter:subscribe" { matterId }
    GW->>GW: join "matter:<matterId>"
    Note over SVC,GW: un evento de dominio (p. ej. revisión de documento)
    SVC->>GW: emitToUser(userId, "notification:new", payload)
    GW-->>B: "notification:new" (sala user:<id>)
    SVC->>GW: emitToMatter(matterId, "message:new", payload)
    GW-->>B: "message:new" (sala matter:<id>)
```

- El gateway (`@WebSocketGateway`, CORS con credenciales) une cada socket a las salas `user:<sub>` y
  `tenant:<tid>` derivadas del JWT, y a `matter:<id>` bajo demanda (`matter:subscribe`).
- Eventos emitidos por el dominio: **`notification:new`** (centro de notificaciones y campana) y
  **`message:new`** (chat por expediente). El frontend invalida las queries de TanStack al recibirlos.
