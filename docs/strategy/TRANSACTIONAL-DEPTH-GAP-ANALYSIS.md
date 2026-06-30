# Análisis de Profundidad del Módulo Transaccional (M&A / Deal)

> Documento de investigación — **Vera (Análisis Transaccional)**. Fecha: 2026-06-30.
> Alinea con la línea estratégica ya aprobada en `COMPETITIVE-GAP-ANALYSIS.md` §4: *"Profundizar transaccional e IA sobre la base ya en producción"*.
> Para revisión de Aurora (orquestación) y priorización de Tomás (ingeniería).

---

## 0. TL;DR

El módulo transaccional de Lawzora es un **diferenciador ★ real y ya en producción** (data room con enlaces mágicos, working group, hitos, disclosure schedules, registros, closing checklist con escrow, secretaría corporativa). Frente a un practice-management generalista (Clio/Filevine) y a los incumbentes de contenido ES (Aranzadi/Lefebvre), **nadie ofrece esta capa**. El foso, sin embargo, hoy es **ancho pero poco profundo**: cubre el *qué* (estructura de la operación) pero no el *cómo se cierra* (la mecánica financiera y de gating del closing).

Tres mejoras **100% codeables, sin dependencias externas ni certificados**, profundizan el foso donde más se nota en una due-diligence de producto y en una demo de venta a despacho transaccional:

1. **T-1 · Funds-flow / Closing statement + ledger de escrow** (P1) — la pieza que *toda* operación necesita y que hoy falta.
2. **T-2 · Gating de Conditions Precedent + indicador de "readiness" al closing** (P1) — convierte el checklist en una máquina de estado del cierre.
3. **T-3 · Alertas de plazo del calendario de operación (longstop / CP deadline)** (P2) — cablea `DealMilestone` a la infraestructura de notificación existente.

Ninguna toca producción, Stripe, Neon ni secretos; todas son lógica de dominio + UI sobre modelos que **ya existen**.

---

## 1. Inventario del estado actual (verificado en código)

Mapa de implementación confirmado en `agents/sandbox` (rutas reales):

| Capacidad | Modelo Prisma | API | UI | Estado |
|---|---|---|---|---|
| Working group / partes | `DealParty` | `deal/deal.service.ts` | `deal-cockpit-tab.tsx` (PartiesCard) | ✅ Completo |
| Calendario de operación / hitos | `DealMilestone` | `deal/deal.service.ts` | MilestonesCard | ✅ estructura; ⚠️ sin alertas |
| Disclosure schedules (R&W) | `DisclosureSchedule` | `deal/deal.service.ts` | DisclosuresCard | ✅ Completo |
| Registros (Mercantil/Propiedad/RD) | `RegistryFiling` | `deal/deal.service.ts` | FilingsCard | ✅ seguimiento manual |
| Closing checklist + fases | `ClosingChecklist`/`Item` | `closing/closing.service.ts` | `closing-checklist-tab.tsx` | ✅ CP/Deliverable/Signature |
| Escrow (holdback) | flag `inEscrow`,`releasedAt` en `ClosingChecklistItem` | — | badge en item | ⚠️ **flag suelto, sin workflow ni importes** |
| Binder de cierre (ZIP) | — | `closing/closing-binder.ts` | botón export | ✅ desde checklist |
| Data room + permisos + Q&A | `DataRoom*` (8 modelos) | `data-room/*` (interno + externo) | `data-room-tab.tsx` | ✅ Completo (★) |
| Enlaces mágicos externos + watermark | `DataRoomGrant`, `watermark.ts` | `data-room-external.controller.ts` | `/dataroom/[token]` | ✅ Completo (★) |
| Carta de encargo | `EngagementLetter` | `engagement/*` | `engagement-letter-card.tsx` | ✅ Completo |
| Secretaría corporativa | `CorporateMinute`,`Shareholder`,`ShareTransfer`,`RegistryObligation` | `company-secretary/*` | `company-secretary-tab.tsx` | ✅ Completo |

**Lectura:** la cobertura *estructural* (quién, qué documentos, qué hitos, qué condiciones) es sólida y multi-jurisdicción (incluye registros RD). El hueco está en la **mecánica de cierre**: el dinero (funds flow / escrow con importes) y la **lógica de estado** (¿está la operación lista para firmar/cerrar?).

---

## 2. Inventario de gaps (priorizado por valor × codeabilidad)

Leyenda codeabilidad: `A` = lógica de dominio + UI, sin deps externas · `B` = requiere integración/IA · `C` = requiere proveedor/cert/registro externo.

| # | Gap | Valor | Codeab. | Prioridad |
|---|---|---|---|---|
| T-1 | **Funds-flow / closing statement + ledger de escrow con importes** | Alto | A | **P1** |
| T-2 | **Gating de CP + indicador de readiness al signing/closing** | Alto | A | **P1** |
| T-3 | **Alertas de plazo del calendario (longstop / CP deadline)** | Medio-alto | A | **P2** |
| T-4 | Dependencias entre items del checklist (A bloquea B) | Medio | A | P2 |
| T-5 | Dashboard / pipeline de operaciones (KPIs, adherencia a plazos) | Medio | A | P3 |
| T-6 | Certificado/sign-off de closing counsel (firma del binder) | Medio | B | P3 |
| T-7 | Generación de SPA / documentos del deal con IA + plantillas | Alto | B | P3 |
| T-8 | Redline / mark-up colaborativo de contratos | Alto | B | Backlog |
| T-9 | Consolidación multi-matter (operaciones multi-entidad) | Bajo-medio | A | Backlog |
| T-10 | Automatización real de presentación a registros | Medio | C | Diferido (deps externas, como fiscal) |

**Criterio de corte para esta tanda:** sólo items `A` (sin deps externas) y de valor Alto / Medio-alto → **T-1, T-2, T-3**. Esto respeta la regla del tablero ("construir donde el foso crece con el código", sin proveedores ni certificados pendientes del owner) y maximiza el valor demostrable por línea de código.

---

## 3. Especificaciones de la tanda recomendada

### T-1 · Funds-flow / Closing statement + ledger de escrow (P1)

**Problema.** Hoy `inEscrow`/`releasedAt` son un flag booleano por item, sin **importes**, sin **flujo de fondos** y sin **estado de release**. En una operación real (compraventa de participaciones, inmobiliario), el *funds flow statement* —quién paga qué, a quién, en qué cuenta, qué se retiene en escrow y cuándo se libera— es el documento operativo central del closing. Es el primer artefacto que un abogado transaccional busca y hoy **no existe**.

**Alcance (codeable, modelos nuevos acotados):**
- Nuevo modelo `DealFundsFlowLine` (tenantId, matterId, kind[`PAYMENT`|`ESCROW_DEPOSIT`|`ESCROW_RELEASE`|`FEE`|`ADJUSTMENT`], payerPartyId, payeePartyId, amount, currency, account, condition, status[`PLANNED`|`SETTLED`], settledAt, sortOrder).
- Nuevo modelo `EscrowHolding` (tenantId, matterId, amount, currency, agent, depositedAt, releaseTrigger, status[`HELD`|`PARTIALLY_RELEASED`|`RELEASED`], notes) + relación a `EscrowRelease` (amount, releasedAt, reason).
- Endpoints CRUD bajo `deal/:matterId/funds-flow` y `deal/:matterId/escrow` (mismos guards `@Roles(FIRM_ADMIN, LAWYER)` + `@RequiresFeature('closing')` que el resto del módulo).
- UI: nueva card "Funds Flow & Escrow" en `deal-cockpit-tab.tsx` (o tab dedicada) con totales por parte, balance de escrow, y export a PDF (reutilizar el patrón de `closing-binder.ts`).
- El total del funds-flow debe **cuadrar** (suma de pagos = suma de cobros por moneda); mostrar descuadre como aviso.

**Criterios de aceptación:**
- [ ] Migración Prisma aplicable con `prisma migrate diff --from-empty` validada sin BD local (gotcha conocido del repo).
- [ ] RLS por tenant en los modelos nuevos (seguir patrón del módulo deal).
- [ ] Cobertura de tests del servicio (cuadre por moneda, transición HELD→RELEASED) en línea con el CI ≥90%.
- [ ] PDF de closing statement generable desde la operación.
- [ ] Sin tocar Stripe/cobros reales: es **registro/documento** de la operación, no movimiento de dinero.

### T-2 · Gating de Conditions Precedent + readiness (P1)

**Problema.** `ClosingChecklistItem` ya distingue `category=CONDITION_PRECEDENT` y `status`, pero el checklist es una lista plana: nada impide marcar "signing" con CPs sin satisfacer, ni hay una señal de "la operación está lista para firmar/cerrar". El gating de CP es el corazón de la mecánica de un closing.

**Alcance (lógica de dominio sobre modelos existentes, sin schema nuevo o mínimo):**
- Cómputo de **readiness** por fase: `% de CONDITION_PRECEDENT en estado SATISFIED/WAIVED` para `AT_SIGNING` y `AT_CLOSING`.
- Indicador visible en el cockpit: "Listo para firmar: 6/8 CPs satisfechas · 2 pendientes" con desglose.
- Aviso (no bloqueo duro) al marcar un hito `SIGNING`/`CLOSING` como `DONE` si quedan CPs sin satisfacer/waiver → confirmación explícita.
- (Opcional schema) campo `blockingForPhase` en el item para CPs que son condición dura.

**Criterios de aceptación:**
- [ ] El cálculo de readiness es server-side y testeado (casos: 0 CPs, todas satisfechas, mezcla con WAIVED).
- [ ] La UI muestra readiness por fase sin llamadas extra (incluir en el overview existente).
- [ ] El aviso al cerrar con CPs pendientes aparece y es descartable; no rompe el flujo actual.

### T-3 · Alertas de plazo del calendario de operación (P2)

**Problema.** `DealMilestone` tiene `targetDate` y `status`, pero ningún plazo dispara aviso. El **longstop date** (fecha límite de cierre) y la **conditions deadline** son plazos cuyo incumplimiento tiene consecuencias contractuales; pasar uno por alto es un fallo grave. El repo ya tiene infraestructura de notificación/agenda (memoria: timeline, agenda "Hoy", recordatorios) — esto es **cableado**, no construcción desde cero.

**Alcance:**
- Job/selector que detecta `DealMilestone` con `status=PENDING` y `targetDate` dentro de ventana (p.ej. T-14/T-7/T-1) y emite recordatorio in-app al asignado/working group interno.
- Resalte visual en MilestonesCard de hitos vencidos (`MISSED`) y próximos a vencer.
- Distinguir longstop (`kind=LONGSTOP`) y `CONDITIONS_DEADLINE` con tratamiento prioritario.

**Criterios de aceptación:**
- [ ] La detección de plazos próximos/vencidos está testeada (límites de ventana).
- [ ] Se reutiliza la infraestructura de notificación existente (no nuevo canal).
- [ ] No envía correo a partes externas (sólo staff interno), respetando privacidad del data room.

---

## 4. Lo que NO recomiendo construir ahora (y por qué)

- **T-10 Automatización de registros** y cualquier transmisión a organismos: misma naturaleza que el gap fiscal (requiere credenciales/integración externa del owner). Diferir hasta que haya demanda y acceso.
- **T-8 Redline colaborativo**: alto coste, solapa con add-ins Word ya entregados; evaluar comprar/integrar antes que construir.
- **T-7 Generación de SPA con IA**: valioso pero pertenece al goal de **Calidad IA (Zora)**; encaja mejor como tool del agente que como módulo transaccional aislado. Anotar como cross-link a la línea de Zora.

---

## 5. Encaje estratégico y de venta

- **Due-diligence de producto:** T-1/T-2 convierten "tenemos un módulo transaccional" en "tenemos la mecánica de closing", que es lo que un comprador estratégico o un despacho transaccional evalúa de verdad.
- **Demo de venta:** un *funds flow* y un indicador de readiness son los dos artefactos más vistosos en una demo a despacho de M&A — más que otra lista CRUD.
- **Foso:** profundizan justo donde el competidor generalista no puede seguir sin reescribir su modelo de datos; el coste de réplica sube con cada uno.

---

## 6. Próximos pasos propuestos

1. Aurora prioriza T-1/T-2/T-3 dentro del goal de Crecimiento (diferenciación de venta) o como tanda transaccional propia.
2. Tomás (ingeniería) toma T-1 primero (mayor valor, base para T-2). Flujo del tablero: worktree aislado sobre `agents/sandbox`, sin push/deploy; el owner mergea.
3. Carla (QA) extiende el plan de regresión con cuadre de funds-flow y gating de CP.
4. Vera (este rol) queda disponible para profundizar specs por item o un análisis de paridad transaccional vs. herramientas dedicadas (Datasite/Intralinks/Litera) si se requiere.

> Documento vivo. Las rutas y modelos citados están verificados contra `agents/sandbox` a fecha 2026-06-30.
