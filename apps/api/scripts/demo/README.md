# Datos DEMO transaccionales — 3 escenarios poblados

Sistema de **datos de demostración** para enseñar el producto **lleno** en demos en vivo a despachos
transaccionales. Crea **3 despachos demo aislados** (un tenant por escenario), cada uno poblado de
extremo a extremo con datos **100% ficticios**:

| #   | Escenario                                                           | Despacho (demo)                            | Acceso                                |
| --- | ------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| 1   | **Boutique de M&A** — compraventa de participaciones a medio cierre | Quórum Corporate Abogados · DEMO           | `mna@demo.legalflow.invalid`          |
| 2   | **Inmobiliario** — compraventa con due diligence en curso           | Solar & Lonja Abogados Inmobiliario · DEMO | `inmobiliaria@demo.legalflow.invalid` |
| 3   | **Mercantil general** — con secretaría de sociedades activa         | Mercantia Asesores Legales · DEMO          | `mercantil@demo.legalflow.invalid`    |

**Contraseña común** a las 3 demos: `Demo.Transaccional-2026!` (configurable con `DEMO_SEED_PASSWORD`).

Cada despacho queda con el plan **AVANZADO** y suscripción **ACTIVE** → **todas las funciones
desbloqueadas** (data room, closing, hoja de encargo, secretaría, IA…) y **sin muro de prueba**.

---

## Qué incluye cada despacho

- **Clientes** con identificadores fiscales **válidos pero ficticios**: NIF/CIF (ES) y RNC/Cédula (RD).
- **Expedientes** con **timeline de actividad**, **parte contraria** y datos de la operación.
- **Documentos versionados** + un **redline visible** (v1 vs v2 de contrato/estatutos).
- **Data room** con **enlace mágico activo**, **permisos por carpeta**, **marca de agua** y **Q&A**.
- **Checklist de cierre** a medias (**condiciones previas mixtas**: cumplidas / en curso / dispensadas)
  y **closing binder generable** (se genera bajo demanda desde el checklist + documentos).
- **Hoja de encargo generada** (PDF en el expediente).
- **Leads** del CRM en distintas fases del embudo (NEW → CONTACTED → QUALIFIED → LOST).
- **Tareas** con **plazos próximos** + **un plazo procesal computado** (días hábiles de la
  jurisdicción) encadenado a una notificación judicial (LexNET-lite).
- **Partes de horas** con horas **facturadas** y **sin facturar** (para que salte la alerta de WIP).
- **Facturas** con registro **Verifactu (ES)** / **e-CF (RD)** en **MODO SANDBOX** (ver más abajo).
- **Dashboard con KPIs vivos** (facturación, cobrado, vencido, embudo, horas sin facturar…).
- **Escenario 3**: **libro de actas** y **libro de socios** con **movimientos** de participaciones
  (transmisión + ampliación de capital) y **obligaciones recurrentes** al Registro.

---

## Cómo levantarlo / resetearlo

> Requiere acceso a la base de datos por el **rol privilegiado** (RLS-bypass), igual que el alta de
> despacho y `ensure-demo-tenant.mjs`: define `SYSTEM_DATABASE_URL` (o `DIRECT_DATABASE_URL`) en
> `apps/api/.env`. El seed **no toca migraciones, RLS ni defaults fiscales**.

```bash
# Sembrar los 3 escenarios (idempotente: borra la demo previa y la recrea limpia)
pnpm seed:demo

# Sembrar solo uno
pnpm seed:demo --scenario 1        # 1 | 2 | 3 | all

# Borrar las demos (sin volver a sembrar)
pnpm reset:demo
pnpm reset:demo --scenario 2

# Contra producción (carga apps/api/.env.production)
pnpm seed:demo --production
```

**Es idempotente y reseteable**: antes de sembrar un escenario, `seed:demo` **borra** su tenant demo
anterior. Ejecútalo justo **antes de cada demo** para empezar limpio. El `reset:demo` deja la base
sin demos.

**Smoke test sin base de datos** (valida imports, identificadores fiscales contra el validador real,
construcción de factura en sandbox, PDF y plazos procesales):

```bash
node apps/api/scripts/demo/selfcheck.mjs
```

Al terminar, `seed:demo` imprime el **enlace mágico** del data room de cada escenario (el token solo
se muestra una vez; en BD se guarda únicamente su `sha256`).

---

## Aislamiento y seguridad (no toca datos reales)

- **Un tenant por escenario**, con `tenantId` explícito en cada fila. Respeta **RLS fail-closed**
  (D-020): se escribe por el rol de sistema, exactamente como el alta real de despacho.
- **Borrado acotado por dominio**: el reset **solo** elimina tenants cuyo admin pertenece al dominio
  **reservado** `@demo.legalflow.invalid` — ningún despacho real lo usa, así que **nunca** toca datos
  reales. Coexiste con las demos de ventas (`@demo.lawzora`) sin pisarlas.
- **Marcados como demo**: el nombre del despacho lleva el sufijo ` · DEMO`, los PDFs llevan un sello
  «DEMO · DATOS FICTICIOS» y los identificadores fiscales son inventados (con dígito de control válido).
- **Sin secretos ni PII real**: nombres, emails (`*.demo`) y datos son ficticios.

## Fiscal en SANDBOX (sin transmisión real)

- Las facturas se construyen con los **mismos providers de cumplimiento** que usa la API
  (`@legalflow/compliance`), que generan la **huella/encadenamiento Verifactu** y el **e-CF** de forma
  **pura**, **sin red ni certificado**.
- **No se transmite nada** a AEAT/DGII: no se define `DGII_ENV` ni se usa ningún `.p12`. Las facturas
  RD quedan con `ecfStatus = STUBBED` (transmisión apagada). No hay efectos fiscales reales.

## IA

- El seed **no hace llamadas a IA en vivo**: todo el contenido (documentos, actas, Q&A, redline) es
  **texto pre-generado** ficticio incrustado en el propio seed.

---

## Almacenamiento de ficheros (para descarga / redline / marca de agua)

El seed sube ficheros reales (PDFs y textos) al **mismo backend** que la API, con la **misma clave** y
el **mismo cifrado en reposo** (`DATA_ENCRYPTION_KEY`, AES-256-GCM) — así la descarga, la **marca de
agua** del data room y el **redline** funcionan de verdad:

- `STORAGE_DRIVER=local` (default) → escribe en `STORAGE_LOCAL_PATH` (default `./storage` relativo a
  `apps/api`). **Ejecuta el seed con el mismo entorno con el que corre la API** para que las rutas
  coincidan.
- `STORAGE_DRIVER=minio|s3` → usa `STORAGE_ENDPOINT` / `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY` /
  `STORAGE_SECRET_KEY` (cliente `minio`, como `S3StorageProvider`).

La escritura de ficheros es **best-effort**: si el backend no está disponible, el seed **avisa y
sigue**. Las filas en BD existen igualmente, así que **las vistas de lista/detalle salen llenas**;
solo se degradan la descarga/preview y la extracción de texto del redline.

---

## Estructura

```
apps/api/scripts/demo/
  seed-demo.mjs            # CLI: pnpm seed:demo [--scenario 1|2|3|all] [--production]
  reset-demo.mjs           # CLI: pnpm reset:demo [--scenario 1|2|3|all]
  selfcheck.mjs            # smoke test sin BD (imports, IDs fiscales, sandbox, PDF, plazos)
  lib/
    env.mjs                # carga de .env + Prisma privilegiado + identidad/constantes de demo
    identifiers.mjs        # generadores NIF/CIF/RNC/Cédula (dígito de control válido)
    storage.mjs            # escritor de objetos espejo de la API (local|minio + AES-256-GCM)
    artifacts.mjs          # PDFs (pdf-lib) y textos de relleno ficticios
    provision.mjs          # alta de tenant (réplica de registerTenant) + plan que desbloquea todo
    fiscal.mjs             # emisión de facturas Verifactu/e-CF en sandbox (providers puros)
    builders.mjs           # clientes, expedientes, docs+redline, data room, closing, encargo, tareas…
    company-secretary.mjs  # libro de actas / socios / movimientos / obligaciones (escenario 3)
    reset.mjs              # borrado seguro acotado al dominio demo + purga de almacenamiento
  scenarios/
    registry.mjs           # identidad compartida de los 3 escenarios (emails, nombres, jurisdicción)
    scenario-1-mna.mjs
    scenario-2-realestate.mjs
    scenario-3-mercantil.mjs
```
