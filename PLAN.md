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

## E0 — Andamiaje del monorepo `[~]`

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
- [x] `pnpm install` y verificación de build (domain/compliance/api/web compilan).
- [x] `prisma migrate dev` (migración inicial `20260613174416_init` aplicada).
- [x] Smoke test: API arranca, conecta a Postgres y `/api/health` responde 200.
- [x] Husky + lint-staged (prettier) + commitlint (Conventional Commits) activos.
- [x] CI (GitHub Actions): install + build + lint + unit + e2e (Postgres) — **verde**.

## E1 — Auth multi-tenant + RBAC `[~]`

- [x] Modelo `Tenant`, `User`, `Role`, `Permission`, `RefreshToken` (en schema/migración).
- [x] `AuthModule`: registro de tenant + siembra de RBAC + primer usuario FIRM_ADMIN.
- [x] Login con JWT **access** (15 min) + **refresh** (7 d, rotación + revocación + reuse-detection).
- [x] `JwtStrategy` (access) + rotación de refresh en `TokensService` + guards globales.
- [x] RBAC: roles `CLIENT` / `LAWYER` / `FIRM_ADMIN`; decorador `@Roles` + `RolesGuard`.
- [x] Hash de contraseñas con **argon2**; política mínima (≥10 chars en DTO).
- [x] `tenantId` + jurisdicción propagados en el token y en `RequestUser`.
- [x] Tests e2e (8): registro, validación, login, 401, /me con rol, rotación+reuse, health público.
- [x] Aislamiento por tenant en queries de negocio (consolidado en E2: todo filtra por `tenantId`).
      Pendiente futuro: activar Postgres RLS como defensa en profundidad (documentado en DECISIONS).

## E2 — Clientes y Expedientes `[x]`

- [x] CRUD `Client` con `validateTaxId` del provider (NIF/CIF · RNC/Cédula) + normalización.
- [x] CRUD `Matter` (tipo, cliente, abogado responsable, estado) + referencia autogenerada.
- [x] Máquina de estados del expediente (`matter-status.ts`, transiciones validadas).
- [x] Asignación de abogado (validada en tenant + rol); permisos por rol (`@Roles`).
- [x] **Aislamiento por tenant** en todas las queries (filtro `tenantId` + `updateMany/deleteMany`).
- [x] `AuditService` inmutable enganchado en create/update/status.
- [x] Tests e2e (9): validación fiscal, transiciones válidas/ inválidas, aislamiento cross-tenant.

## E3 — Documentos `[x]`

- [x] `StorageProvider` (interfaz en domain) + impl. S3/MinIO (`minio`) + impl. disco local (dev),
      seleccionada por `STORAGE_DRIVER`. Local con protección anti path-traversal.
- [x] Subida de `Document` + `DocumentVersion` (hash SHA-256, mime, tamaño) + versionado incremental.
- [x] Flujo de revisión (APPROVED/REJECTED/CHANGES_REQUESTED/IN_REVIEW) + comentarios (`DocumentReview`).
- [x] Notificaciones persistidas al autor en cada revisión (`NotificationsService`).
- [x] Descarga autenticada por streaming; límite de subida 25 MB.
- [x] Tests e2e (7): subida, descarga, versionado, revisión, notificación, aislamiento, 400 PENDING.

## E4 — Tareas y plazos procesales `[x]`

- [x] CRUD `Task` con fecha límite, estado y asignación (+ notificación al asignado).
- [x] `POST /tasks/from-deadline`: crea la tarea con `dueDate` calculada por `getProceduralDeadlines`
      (isProcedural + deadlineType persistidos).
- [x] Cálculo **real** ES (días hábiles + festivos nacionales, Viernes Santo incl.); RD solo findes.
- [x] Tests: unit de plazos (Pascua/festivos/días hábiles) + e2e from-deadline (Navidad).

## E5 — Ledger + Facturación jurídica `[x]`

- [x] `LedgerEntry`: provisiones, suplidos, honorarios + `TimeEntry` (horas con tarifa → TIME_FEE).
- [x] Ledger transparente con saldo calculado (convención de signo documentada) por expediente.
- [x] `Invoice` + `InvoiceLine` con campos fiscales y `complianceRecord` (JSON opaco) del provider.
- [x] `buildInvoiceRecord` real: **Verifactu** (huella SHA-256 + QR + encadenamiento) en ES;
      **e-CF** (XML DGII con totales) en RD.
- [x] Cálculo fiscal real (`tax-math.ts`): IVA 21% + retención IRPF (ES); ITBIS 18% (RD).
- [x] Envío a AEAT/DGII **stubbeado** (`submission.status = STUBBED`).
- [x] Cobro de factura (PAYMENT + estado PAID).
- [x] Tests: unit fiscal/encadenamiento (compliance 24) + e2e ledger/factura/cobro/aislamiento (7).

## E6 — Portal del cliente `[x]`

- [x] `PortalModule` (rol `CLIENT`, solo lectura): sus expedientes, documentos, tareas, ledger y facturas.
- [x] Aprovisionamiento de usuario de portal (`POST /clients/:id/portal-user`) vinculado a la ficha.
- [x] Acceso acotado a los expedientes propios (`assertMatterAccess` + `Client.userId`).
- [x] Notificaciones realtime vía WebSocket (Socket.IO) al usuario.
- [x] Tests e2e: visibilidad propia, 403 a lo ajeno, 403 de rol cruzado.

## E7 — Auditoría y notificaciones (transversal) `[x]`

- [x] `AuditLog` inmutable (append-only) en acciones sensibles de todos los módulos.
- [x] `NotificationsModule` + entrega realtime (Socket.IO, salas `user:`/`tenant:`/`matter:`).
- [x] `Message`: chat por expediente con control de acceso (staff + cliente del expediente) + emit realtime.
- [x] Tests e2e: chat, aislamiento y recepción de notificación en tiempo real.

## E8 — i18n y multimoneda (transversal) `[~]`

- [x] Locales `es-ES` y `es-DO` operativos en web (next-intl, sin strings hardcodeados en UI).
- [x] Moneda por tenant (EUR / DOP); ledger y facturas usan `tenant.currency`.
- [x] Errores de cumplimiento con `messageKey` para traducir en UI.
- [ ] Catálogo i18n exhaustivo de mensajes de API (pendiente de pulido).

## E9 — Capa de cumplimiento (paquete base) `[x]`

- [x] Interfaz `ComplianceProvider` + tipos.
- [x] `SpainComplianceProvider` (esqueleto: IVA/IRPF, Verifactu, LexNET, SII, plazos).
- [x] `DominicanComplianceProvider` (esqueleto: ITBIS, e-CF/DGII, RNC, 606/607).
- [x] `ComplianceProviderFactory` (selección por `tenant.jurisdiction`).
- [x] Implementación real `validateTaxId` (NIF/CIF/NIE, RNC, Cédula con dígitos de control).
- [x] Implementación real `getTaxRates` por jurisdicción (IVA/IRPF ES, ITBIS RD).
- [x] `buildInvoiceRecord` estructuralmente correcto (Verifactu / e-CF XML).
- [x] `getProceduralDeadlines` real ES (fines de semana + festivos nacionales).
- [x] **Tests obligatorios** de cobertura en toda la capa.

## Diferido (stubs detrás de interfaz — NO construir aún)

- Envío real AEAT/DGII, LexNET en vivo, firma electrónica (Signaturit/DocuSign), SMS.
- `AiAssistantProvider` (solo contrato): redacción/resumen/revisión con citación y anti-alucinación.
- CRM/captación, dashboards avanzados, app móvil.

## Transversales de seguridad / cumplimiento de datos

- [ ] Cifrado en tránsito (TLS) y en reposo (campos sensibles / disco).
- [~] Control de acceso granular + aislamiento estricto por tenant. **Postgres RLS activa** como
  defensa en profundidad (políticas + rol de mínimo privilegio, ver D-013); pendiente el wiring de
  la app que fija `app.tenant_id` por request.
- [ ] Preparado RGPD/LOPDGDD (ES) y Ley 172-13 (RD); trazabilidad para futuro AI Act.

---

## Estado actual de la sesión

- ✅ Entregado para revisión: `PLAN.md`, `DECISIONS.md` y andamiaje completo del monorepo (archivos).
- ⚠️ **Bloqueante de entorno:** esta máquina no tiene Node.js / pnpm / Docker instalados (solo git).
  No se ha podido ejecutar `pnpm install`, build, ni `prisma migrate`. Ver `DECISIONS.md` §Entorno.
- ⏭️ Siguiente al aprobar: E1 (Auth multi-tenant + RBAC).

### Actualizacion 2026-06-14 - Codex

- Entorno local con Node/pnpm operativo; se han ejecutado pruebas unitarias de compliance, e2e de API
  y comprobaciones TypeScript.
- Backend MVP Fase 1 avanzado hasta E7 y E9 validado con tests.
- Frontend existente en `apps/web`, pero todavia es una pantalla inicial basica; falta UI funcional
  para operar clientes, expedientes, documentos, tareas, ledger y portal.
- Siguiente foco recomendado: corregir configuracion de lint/CI (E0), ampliar UI funcional (E8/web)
  y abordar transversales de seguridad/datos.
