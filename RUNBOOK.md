# RUNBOOK — Despliegue y operación (LegalFlow / Lexora)

> Runbook operativo. La entrega continua (CD) está **cableada pero desconectada** hasta elegir hosting
> (ver D-018). Este documento recoge la configuración de seguridad de despliegue: TLS en tránsito y
> cifrado en reposo. No activa nada por sí solo.

## 1. Roles de base de datos (RLS fail-closed · D-013/D-020)

Tres roles, tres URLs. Provisiónalos **fuera de banda** en producción con contraseñas fuertes:

| Variable              | Rol                | Uso                                   | Privilegio                                    |
| --------------------- | ------------------ | ------------------------------------- | --------------------------------------------- |
| `DATABASE_URL`        | `legalflow_app`    | Runtime de la API                     | Mínimo (DML); **NOBYPASSRLS** → RLS se aplica |
| `DIRECT_DATABASE_URL` | propietario        | Solo Prisma Migrate (DDL, roles, RLS) | Privilegiado                                  |
| `SYSTEM_DATABASE_URL` | `legalflow_system` | Solo login/registro/carga de token    | **BYPASSRLS** (no superusuario)               |

- `SYSTEM_DATABASE_URL` es la **joya de la corona**: salta TODO el aislamiento. Secreto fuerte, gestor de
  secretos, **nunca** logueado, **nunca** reutilizado fuera de `SystemPrismaService`. En producción es
  **obligatorio**: si falta, la API no arranca (no se permite el fallback a propietario/superusuario).
- En producción, `legalflow_system` se crea fuera de banda; la migración solo (re)aplica GRANTs.

## 2. Cifrado en reposo (D-021)

- **Contenido de documentos:** AES-256-GCM a nivel de aplicación (`EncryptedStorageProvider`).
  - `DATA_ENCRYPTION_KEY` = 32 bytes en base64. Generar:
    `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
  - **Obligatorio en producción** (sin clave la API no arranca). Guardar en gestor de secretos
    (AWS Secrets Manager / Vault / variables del entorno cifradas). Nunca en el repo ni en logs.
  - **Rotación:** generar clave nueva, re-cifrar los objetos (el byte de versión del formato permite
    convivencia temporal de versiones). Documentar la fecha de rotación.
- **PII de clientes y resto de la BD:** cifrado **a nivel de volumen/disco (TDE)** del gestor Postgres
  (RDS encryption, disco cifrado del proveedor). Cubre toda la BD en reposo sin romper consultas. El
  cifrado de columnas de PII consultable (blind index/determinista) queda como fase posterior (D-021).
- **Backups:** cifrados con la misma política; mismas claves bajo gestión de secretos.

## 3. TLS en tránsito

- **Terminación TLS en el borde:** reverse proxy / balanceador (Nginx, Caddy, ALB) delante de `web` y
  `api`. Certificados gestionados (Let's Encrypt/ACM) con renovación automática.
- **Redirección 80 → 443** y **HSTS** (`Strict-Transport-Security: max-age=63072000; includeSubDomains;
preload`).
- **TLS moderno:** TLS 1.2+ (preferible 1.3), suites seguras, OCSP stapling.
- **Tráfico interno:** si los servicios cruzan red no confiable, TLS también entre proxy↔api↔db.
- **Postgres:** `sslmode=require` (mejor `verify-full` con CA) en las URLs de conexión en producción.
- **Cookies:** las cookies de sesión del BFF ya son `httpOnly`; en producción además `Secure` (solo HTTPS)
  y `SameSite=Lax` (ya aplicado).

## 4. Checklist previo a producción

- [ ] `legalflow_app`, `legalflow_system` y rol propietario provisionados con contraseñas fuertes.
- [ ] `SYSTEM_DATABASE_URL` y `DATA_ENCRYPTION_KEY` en el gestor de secretos (no en el repo).
- [ ] TLS en el borde + HSTS + redirección 80→443 verificados.
- [ ] `sslmode=require`/`verify-full` hacia Postgres.
- [ ] Cifrado de disco/volumen de la BD y de los backups activado.
- [ ] Migraciones aplicadas con el rol propietario (`DIRECT_DATABASE_URL`).
- [ ] Smoke: login → dashboard, subida/descarga de documento (round-trip cifrado), aislamiento de tenant.
