# LegalFlow — Plan de construcción (MVP Fase 1)

> SaaS de gestión legal multi-jurisdicción (España `es` + República Dominicana `do`).
> Principio rector: **núcleo agnóstico de jurisdicción + adaptadores de cumplimiento enchufables**.

## Leyenda de estado
- `[ ]` pendiente · `[~]` en progreso · `[x]` completado · `[!]` bloqueado

## Dependencias de alto nivel
```
E0 Andamiaje ──► E1 Auth/RBAC ──► E2 Clientes/Expedientes ──► E3 Documentos
                                            │                        │
                                            ├──► E4 Tareas/Plazos     │
                                            └──► E5 Ledger/Facturación┘
E6 Portal cliente  ◄── E2,E3,E5
E7 Auditoría/Notif ◄── transversal (engancha en cada módulo)
E8 i18n/Multimoneda◄── transversal (desde E0)
E9 Cumplimiento    ◄── paquete base (se consume desde E2 y E5)
```

---

## E0 — Andamiaje del monorepo  `[~]`
- [x] `git init` aislado en `Prod007` (no usar el repo del home).
- [x] `PLAN.md` y `DECISIONS.md`.
- [x] `pnpm-workspace.yaml` + `package.json` raíz + `.npmrc`.
- [x] `.gitignore`, `.editorconfig`, `.env.example`.
- [x] `packages/config`: tsconfig base, ESLint, Prettier compartidos.
- [x] `packages/domain`: enums y tipos compartidos del dominio.
- [x] `packages/compliance`: interfaz + providers (ver E9).
- [x] `apps/api`: esqueleto NestJS + `nest-cli.json` + `tsconfig`.
- [x] `apps/web`: esqueleto Next.js (App Router) + Tailwind + i18n.
- [x] `apps/api/prisma/schema.prisma`: modelo de dominio completo.
- [x] `docker-compose.yml`: Postgres + MinIO + Redis.
- [ ] **(requiere toolchain)** `pnpm install` y verificación de build.
- [ ] **(requiere toolchain)** `prisma migrate dev` (migración inicial).
- [ ] Husky + lint-staged + commitlint (Conventional Commits).
- [ ] CI básica (lint + test + build).

## E1 — Auth multi-tenant + RBAC  `[ ]`
- [ ] Modelo `Tenant`, `User`, `Role`, `Permission`, `RefreshToken` (en schema).
- [ ] `AuthModule`: registro de tenant + primer usuario Admin.
- [ ] Login con JWT **access** (corto) + **refresh** (rotación + revocación).
- [ ] `JwtStrategy` + `RefreshStrategy` (passport) + guards.
- [ ] `TenantContext` (middleware/interceptor que fija `tenantId` por request).
- [ ] RBAC: roles `CLIENT` / `LAWYER` / `FIRM_ADMIN`; decorador `@Roles` + `RolesGuard`.
- [ ] Hash de contraseñas (argon2), política de credenciales.
- [ ] Aislamiento por tenant en todas las queries (helper Prisma + camino a RLS).
- [ ] Tests e2e: registro, login, refresh, expiración, acceso cruzado denegado.

## E2 — Clientes y Expedientes  `[ ]`
- [ ] CRUD `Client` con `validateTaxId` del provider (NIF/CIF · RNC/Cédula).
- [ ] CRUD `Matter` (tipo, cliente, abogado responsable, estado).
- [ ] Máquina de estados del expediente (ciclo de vida).
- [ ] Asignación de abogado; permisos por rol.
- [ ] Tests: validación fiscal por jurisdicción, transiciones de estado.

## E3 — Documentos  `[ ]`
- [ ] `StorageProvider` (interfaz) + impl. S3/MinIO + impl. disco local (dev).
- [ ] Subida de `Document` + `DocumentVersion` (hash, mime, tamaño).
- [ ] Flujo de revisión: `PENDING → IN_REVIEW → APPROVED / REJECTED / CHANGES_REQUESTED` + comentarios.
- [ ] Notificaciones en transiciones de revisión.
- [ ] Tests: versionado, transiciones, control de acceso.

## E4 — Tareas y plazos procesales  `[ ]`
- [ ] CRUD `Task` con fecha límite y asignación.
- [ ] Vínculo opcional `Task → ProceduralDeadline` calculado por `getProceduralDeadlines`.
- [ ] Cálculo real ES (días hábiles + festivos); RD interfaz lista (calendario mínimo).
- [ ] Tests: cálculo de plazos ES con festivos.

## E5 — Ledger + Facturación jurídica  `[ ]`
- [ ] `LedgerEntry`: provisiones de fondos, suplidos, horas con tarifa (`TimeEntry`).
- [ ] Ledger transparente, consistente (sin huecos), visible por el cliente en tiempo real.
- [ ] `Invoice` con campos fiscales del provider.
- [ ] `buildInvoiceRecord`: **Verifactu** (firma + QR + encadenamiento) en ES; **e-CF** (XML DGII) en RD.
- [ ] Cálculo de impuestos real: IVA 21% + retención IRPF (ES); ITBIS 18% (RD).
- [ ] Envío a AEAT/DGII **stubbeado** detrás de la interfaz.
- [ ] **Tests obligatorios** de cobertura: cálculo fiscal, encadenamiento, ledger.

## E6 — Portal del cliente  `[ ]`
- [ ] Vista de sus expedientes, pendientes, documentos y costes (ledger).
- [ ] Permisos de solo-lectura/acción acotada para rol `CLIENT`.
- [ ] Realtime del ledger y notificaciones vía WebSocket.

## E7 — Auditoría y notificaciones (transversal)  `[ ]`
- [ ] `AuditLog` inmutable (append-only) en toda acción sensible.
- [ ] `NotificationModule` + entrega realtime (Socket.IO).
- [ ] `Message`: chat por expediente.

## E8 — i18n y multimoneda (transversal)  `[ ]`
- [ ] Locales `es-ES` y `es-DO` en web y mensajes de API; cero strings hardcodeados.
- [ ] Moneda por tenant (EUR / DOP); formateo localizado de importes y fechas.

## E9 — Capa de cumplimiento (paquete base)  `[~]`
- [x] Interfaz `ComplianceProvider` + tipos.
- [x] `SpainComplianceProvider` (esqueleto: IVA/IRPF, Verifactu, LexNET, SII, plazos).
- [x] `DominicanComplianceProvider` (esqueleto: ITBIS, e-CF/DGII, RNC, 606/607).
- [x] `ComplianceProviderFactory` (selección por `tenant.jurisdiction`).
- [ ] Implementación real `validateTaxId` (NIF/CIF, RNC, Cédula con dígitos de control).
- [ ] Implementación real `getTaxRates` por jurisdicción.
- [ ] `buildInvoiceRecord` estructuralmente correcto (Verifactu / e-CF XML).
- [ ] `getProceduralDeadlines` real ES (festivos nacionales).
- [ ] **Tests obligatorios** de cobertura en toda la capa.

## Diferido (stubs detrás de interfaz — NO construir aún)
- Envío real AEAT/DGII, LexNET en vivo, firma electrónica (Signaturit/DocuSign), SMS.
- `AiAssistantProvider` (solo contrato): redacción/resumen/revisión con citación y anti-alucinación.
- CRM/captación, dashboards avanzados, app móvil.

## Transversales de seguridad / cumplimiento de datos
- [ ] Cifrado en tránsito (TLS) y en reposo (campos sensibles / disco).
- [ ] Control de acceso granular + aislamiento estricto por tenant (camino a Postgres RLS).
- [ ] Preparado RGPD/LOPDGDD (ES) y Ley 172-13 (RD); trazabilidad para futuro AI Act.

---

## Estado actual de la sesión
- ✅ Entregado para revisión: `PLAN.md`, `DECISIONS.md` y andamiaje completo del monorepo (archivos).
- ⚠️ **Bloqueante de entorno:** esta máquina no tiene Node.js / pnpm / Docker instalados (solo git).
  No se ha podido ejecutar `pnpm install`, build, ni `prisma migrate`. Ver `DECISIONS.md` §Entorno.
- ⏭️ Siguiente al aprobar: E1 (Auth multi-tenant + RBAC).
