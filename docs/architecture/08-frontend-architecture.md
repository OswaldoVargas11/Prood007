# 08 · Arquitectura del frontend (`apps/web`)

> Next.js 15 (App Router) · React 18 (fijado) · estado de servidor con TanStack Query · realtime con
> Socket.IO · i18n con next-intl (**un solo locale `es`** + overrides por jurisdicción vía cookie
> `lf_jur`) · sistema de diseño propio estilo shadcn sobre Radix.
> **40 páginas · 7 rutas BFF · 3 layouts · 1 middleware.**

## Mapa de rutas

```mermaid
flowchart TB
    mw["middleware.ts<br/>gating de sesión + scope (locale-prefijado /es)"]

    subgraph pub["Públicas — /[locale]"]
        login["/login"]
        fp["/forgot-password · /reset-password"]
        ve["/verify-email"]
        onb["/onboarding (wizard alta de despacho)"]
        intake["/intake/:token (captación)"]
        root["/ (landing)"]
        legal["/privacy · /terms"]
    end

    subgraph app["Firm app — /[locale]/(app) · AppShell + SubscriptionGate"]
        dash["/dashboard"]
        mat["/matters · /matters/:id · /:id/documents · /:id/documents/:docId"]
        cli["/clients · /clients/:id"]
        doc["/documents · /templates"]
        work["/tasks · /time · /calendar · /leads"]
        inv["/invoices · /invoices/:id · /billing · /subscription · /approvals"]
        comms["/messages · /notifications"]
        admin["/settings · /account · /import · /audit · /aml · /reports"]
    end

    subgraph portal["Portal cliente — /[locale]/portal · PortalShell"]
        pl["/portal"]
        pm["/portal/matters · /portal/matters/:id"]
        pacc["/portal/account"]
    end

    subgraph plat["Plataforma — /[locale]/platform · auth propia"]
        platc["/platform (consola super-admin)"]
    end

    subgraph bff["BFF — /api/auth/* (route handlers)"]
        b1["login · logout · refresh · register-tenant<br/>change-password · mfa/login · social/finish"]
    end

    mw --> pub
    mw -->|"scope=firm"| app
    mw -->|"scope=client"| portal
    pub --> bff
```

- **26** páginas en el grupo `(app)` (firm), **4** en `portal`, **1** en `platform`, **7** públicas
  (`login`, `forgot/reset-password`, `verify-email`, `onboarding`, `intake/:token`, landing) y **2**
  legales (`privacy`, `terms`). El `middleware.ts` decide a qué shell entra cada quien según la cookie de
  scope; ver [02-auth-and-sessions.md](02-auth-and-sessions.md).
- El layout `(app)` envuelve en **`SubscriptionGate`** (muro si no hay suscripción/trial activos).
- `/platform` queda **exenta del gating** del middleware (tiene su propia autenticación de super-admin).

## Capas y responsabilidades

```mermaid
flowchart LR
    subgraph data["Estado de servidor"]
        rq["TanStack Query<br/>lib/hooks.ts"]
        api["lib/api.ts<br/>(access en memoria, retry on-401)"]
        rq --> api
    end
    subgraph rt["Tiempo real"]
        sock["lib/socket.ts (socket.io-client)<br/>invalida queries con notification:new / message:new"]
    end
    subgraph auth["Sesión (cliente)"]
        ap["lib/auth.tsx (AuthProvider)<br/>bootstrap de refresh salvo en rutas públicas"]
    end
    subgraph ui["Sistema de diseño"]
        rad["Radix primitives (dialog, tabs, dropdown, tooltip, avatar, label, slot)"]
        sh["components/ui/* (shadcn propio) + cva + tailwind-merge"]
        icon["lucide-react · framer-motion · geist (fuente)"]
    end
    subgraph i18n["Internacionalización"]
        ni["next-intl · messages/es.json + overrides/<jur>.json (lf_jur)"]
    end
    api -->|"Bearer"| nest["API NestJS"]
    sock <--> nest
    ap --> api
```

- **Estado de servidor:** TanStack Query (hooks en `lib/hooks.ts`). El cliente HTTP (`lib/api.ts`,
  CODEOWNERS) guarda el access en memoria y reintenta una vez ante 401 pidiendo refresh al BFF.
- **Realtime:** `lib/socket.ts` se une a las salas del usuario/tenant/expediente e invalida las queries
  pertinentes al recibir `notification:new` / `message:new`.
- **Sesión cliente:** `lib/auth.tsx` (`AuthProvider`) mintea un access desde la cookie de refresh al
  montar **salvo en rutas públicas** (login/onboarding) para no generar 401 de refresh.
- **Diseño:** componentes propios estilo shadcn (`components/ui/*`) sobre primitivas Radix, con
  `class-variance-authority` + `tailwind-merge`, iconos `lucide-react`, animación `framer-motion`,
  fuente `geist`. El QR Verifactu del portal/detalle usa `qrcode.react`.
- **i18n:** `next-intl` con **un solo catálogo `es`** (`messages/es.json`) más **overrides por
  jurisdicción** (`messages/overrides/<jur>.json`, jur = `es`/`do`) seleccionados por la cookie `lf_jur`.
  Las rutas antiguas `/es-ES/*` y `/es-DO/*` redirigen (308) a `/es/*`.

## Rutas BFF (7)

`apps/web/src/app/api/auth/` — los **únicos** route handlers del web; gestionan la cookie de sesión
`lf_session` (httpOnly) y el scope:

| Ruta BFF                         | Hace                                                                      |
| -------------------------------- | ------------------------------------------------------------------------- |
| `POST /api/auth/login`           | proxya a Nest, fija `lf_session` (httpOnly) + `lf_scope`, devuelve access |
| `POST /api/auth/refresh`         | rota el refresh (cookie) y devuelve nuevo access                          |
| `POST /api/auth/logout`          | revoca el refresh y borra cookies                                         |
| `POST /api/auth/register-tenant` | alta de despacho (onboarding) + sesión inicial                            |
| `POST /api/auth/change-password` | cambia la contraseña, cierra otras sesiones, reemite el par de tokens     |
| `POST /api/auth/mfa/login`       | segundo paso MFA: canjea desafío + código por sesión                      |
| `POST /api/auth/social/finish`   | canjea el ticket de OAuth (login social) por sesión                       |

> CODEOWNERS protege `middleware.ts`, `lib/api.ts`, `lib/scope.ts` y `app/api/auth/` por ser lógica de
> sesión/seguridad. Ver [09-infrastructure-cicd.md](09-infrastructure-cicd.md).
