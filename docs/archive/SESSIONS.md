# SESSIONS.md — Plan de trabajo por slots (3 × ~5 h, limitados por tokens)

Cada sesión termina cuando se agotan los tokens del slot. El plan está ordenado para que cada
slot deje un incremento **coherente, probado y commiteado** (PR #1 se actualiza en cada push).
El diseño de la UI se delega a **Claude Design** (ver `DESIGN_PROMPT.md`) y avanza en paralelo;
el trabajo que NO depende del diseño se hace ya.

Estado de partida (2026-06-14): backend MVP E1–E7 + núcleo de E9 completos y probados (75 tests).
Pendiente: UI funcional, CI/hooks, hardening de seguridad, pulido de E8/E9.

---

## Sesión 1 — Hardening de backend + cimientos de frontend (no dependen del diseño)

Objetivo: dejar el backend listo para producción-MVP y el frontend preparado para "vestir" con el
diseño cuando llegue.

1. **Seguridad transversal** (prioridad del usuario):
   - `@nestjs/throttler`: rate limiting global + límite estricto en `/auth/login` y `/auth/register-tenant`.
   - `helmet`: cabeceras de seguridad HTTP.
   - Revisión de superficie: confirmar `@Roles` en todos los controllers sensibles, CORS, tamaño de payload.
2. **CI** (GitHub Actions): lint + test unit + e2e (con servicio Postgres) + build, en cada push/PR.
3. **Husky real**: `pre-commit` (lint-staged) + `commit-msg` (commitlint).
4. **Frontend — plomería sin diseño**:
   - Cliente API tipado (`apps/web/src/lib/api`) con manejo de access/refresh token.
   - Contexto de auth + guard de rutas + login funcional (UI mínima provisional).
   - Formato de moneda/fecha por locale (EUR/DOP, es-ES/es-DO).
5. **Entregable al usuario**: `DESIGN_PROMPT.md` para lanzar Claude Design.

## Sesión 2 — UI núcleo (con el diseño de Claude Design ya disponible)

Objetivo: app de despacho usable para staff.

1. App shell: layout, navegación, selector de idioma, cabecera de usuario/tenant.
2. Dashboard (resumen: expedientes activos, tareas próximas/plazos, facturación reciente).
3. Clientes: listado + alta/edición con validación fiscal en vivo.
4. Expedientes: listado + ficha + cambios de estado + asignación.
5. Documentos: subida, versiones, flujo de revisión.
6. Tareas: listado, alta, y alta desde plazo procesal.
7. Wiring completo a la API + i18n + estados de carga/error.

## Sesión 3 — Facturación, portal y tiempo real + cierre

Objetivo: completar el MVP visible y dejarlo listo para revisión/merge.

1. Ledger + facturación: vista de ledger por expediente, emisión de factura (Verifactu/e-CF),
   detalle de factura con totales fiscales, cobro.
2. Portal del cliente: sus expedientes, documentos, costes (ledger) y facturas (solo lectura).
3. Tiempo real: notificaciones (campana) y chat por expediente vía WebSocket.
4. Pulido: accesibilidad, responsive, vacíos/errores, e2e de UI básicos.
5. Documentación de uso + checklist de despliegue; preparar PR para revisión/merge.

---

## Reglas de operación entre sesiones

- Registrar cada bloque en `AI_WORKLOG.md` (protocolo compartido con Codex).
- Mantener `PLAN.md` (checklist por épicas) y `DECISIONS.md` (ADR) al día.
- Commits pequeños (Conventional Commits) y push a `feat/mvp-fase1` (PR #1) tras cada incremento probado.
- No romper el principio núcleo-agnóstico: nada de un país concreto fuera de `packages/compliance`.
