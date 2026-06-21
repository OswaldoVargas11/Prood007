# 10 · Inventario de tecnología

> Derivado de los 6 `package.json` del monorepo: **103 paquetes únicos**. Aquí los relevantes por rol.
> Monorepo **pnpm workspaces** (raíz + `apps/*` + `packages/*`).

## Estructura del monorepo

| Workspace                 | Rol                                                             | deps / dev |
| ------------------------- | --------------------------------------------------------------- | ---------- |
| **`apps/api`**            | API NestJS (REST + WebSocket + cron)                            | 29 / 23    |
| **`apps/web`**            | Frontend Next.js                                                | 28 / 18    |
| **`packages/compliance`** | Proveedores fiscales (Verifactu/e-CF) + cálculo                 | 1 / 6      |
| **`packages/domain`**     | Tipos y **contratos** compartidos (incl. `AiAssistantProvider`) | 0 / 3      |
| **`packages/config`**     | Config compartida de ESLint/TS                                  | 5 / 0      |
| **raíz**                  | Tooling de repo                                                 | 0 / 7      |

## Backend (`apps/api`)

| Paquete                                               | Rol                                           |
| ----------------------------------------------------- | --------------------------------------------- |
| `@nestjs/common·core·platform-express`                | Framework HTTP (NestJS 10)                    |
| `@nestjs/websockets·platform-socket.io` + `socket.io` | Gateway de tiempo real                        |
| `@nestjs/jwt·passport` + `passport-jwt·passport`      | Emisión/validación de JWT, estrategia auth    |
| `@nestjs/config`                                      | Carga de configuración / env                  |
| `@nestjs/throttler`                                   | Rate limiting (guard global)                  |
| `@nestjs/schedule`                                    | Cron interno (dunning · billing 06:00)        |
| `@nestjs/mapped-types`                                | DTOs derivados                                |
| `@prisma/client`                                      | ORM (cliente; rol app NOBYPASSRLS)            |
| `@anthropic-ai/sdk`                                   | IA (Claude): asistente, resúmenes, correos    |
| `stripe`                                              | Pagos (Connect) + suscripción SaaS + webhooks |
| `nodemailer`                                          | Envío de email (SMTP Brevo)                   |
| `argon2`                                              | Hash de contraseñas                           |
| `class-validator·class-transformer`                   | Validación y transformación de DTOs           |
| `helmet`                                              | Cabeceras de seguridad HTTP                   |
| `minio`                                               | Cliente S3 para el almacén de objetos         |
| `pdfkit`                                              | Generación de PDF (factura)                   |
| `qrcode`                                              | QR del registro fiscal (Verifactu) en el PDF  |
| `reflect-metadata·rxjs`                               | Runtime de NestJS                             |
| `@legalflow/compliance·@legalflow/domain`             | Paquetes internos                             |

> Google/Microsoft (Calendar, Gmail/Graph) y Voyage (embeddings RAG) se consumen por **fetch directo**
> a sus APIs REST, sin SDK dedicado.

## Frontend (`apps/web`)

| Paquete                                                                         | Rol                                          |
| ------------------------------------------------------------------------------- | -------------------------------------------- |
| `next` (15.5.x)                                                                 | App Router, RSC, route handlers (BFF)        |
| `react·react-dom` (**18.3.1, fijado**)                                          | Librería de UI                               |
| `@tanstack/react-query`                                                         | Estado de servidor / caché                   |
| `@radix-ui/react-*` (dialog, tabs, dropdown-menu, tooltip, avatar, label, slot) | Primitivas accesibles                        |
| `class-variance-authority·clsx·tailwind-merge`                                  | Variantes de estilos (sistema shadcn propio) |
| `cmdk`                                                                          | Command bar (⌘K)                             |
| `lucide-react`                                                                  | Iconos                                       |
| `framer-motion`                                                                 | Animaciones                                  |
| `geist`                                                                         | Tipografía                                   |
| `next-themes`                                                                   | Modo claro/oscuro                            |
| `next-intl`                                                                     | i18n (`es` + overrides por jurisdicción)     |
| `react-hook-form·@hookform/resolvers·zod`                                       | Formularios + validación                     |
| `socket.io-client`                                                              | Tiempo real                                  |
| `qrcode.react`                                                                  | QR Verifactu escaneable en detalle/portal    |

## Paquetes internos

- **`@legalflow/domain`** — tipos y **contratos** de dominio neutrales. Incluye el contrato
  `AiAssistantProvider` (D-011) con `sources`/`citations`/señales de confianza alineadas con la
  trazabilidad del AI Act; **implementado** en `apps/api/src/ai/` con Anthropic (gateado por API key).
- **`@legalflow/compliance`** — interfaz `ComplianceProvider` + `SpainComplianceProvider` y
  `DominicanComplianceProvider` + `ComplianceProviderFactory`. Tests con gate de cobertura ≥90%
  ([09](09-infrastructure-cicd.md)). Ver [05](05-compliance-providers.md).
- **`@legalflow/config`** — config compartida de ESLint/TypeScript (typescript-eslint, eslint-config-prettier, eslint-plugin-import).

## Tooling de repositorio (raíz)

`husky` (hooks de git) · `lint-staged` (formateo en staged) · `@commitlint/*` (Conventional Commits) ·
`prettier` · `typescript`. Pruebas: **Jest** (api e2e, compliance), **Vitest** (web unit), **Playwright**
(web e2e).

## Versiones fijadas notables

| Tecnología            | Versión                      | Por qué                                                                                                                        |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **React / React-DOM** | **18.3.1 (fijado, no 19)**   | Estabilidad y compatibilidad del ecosistema (Radix/Query/next-intl) sobre React 18; evita el salto a 19 mientras se estabiliza |
| Next.js               | 15.5.x                       | App Router + route handlers (BFF)                                                                                              |
| NestJS                | 10.4.x                       | Framework de la API                                                                                                            |
| Prisma                | 5.x (client ^5.20, CLI 5.22) | ORM con soporte de extensiones de cliente (usado para fijar `app.tenant_id`)                                                   |
| Node                  | 24 (entorno local observado) | Provoca el matiz ESM del antiguo `tailwind.config.ts` (ya corregido)                                                           |
| pnpm workspaces       | —                            | Monorepo con paquetes internos `@legalflow/*`                                                                                  |

> La fijación exacta de cada versión debe leerse en cada `package.json`; arriba se listan las
> notables. El recuento total (103 únicos) incluye devDependencies.
