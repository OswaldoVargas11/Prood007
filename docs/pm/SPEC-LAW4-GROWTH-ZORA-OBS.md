# SPEC: Crecimiento · Calidad IA Zora · Observabilidad
> LAW-4 — Documento PM (Lucia). Fecha: 2026-06-30. Para aprobación de Aurora.

---

## 1. Crecimiento y onboarding de despachos (goal 849cd4d8)

### 1.1 Objetivo
Maximizar la conversión de visitante → despacho activado (primer expediente creado), y acortar el tiempo hasta el primer valor percibido en los mercados ES y RD.

### 1.2 Estado actual (observado en repo)

| Componente | Estado | Notas |
|---|---|---|
| Formulario de alta | ✅ Operativo | `apps/web/src/app/[locale]/onboarding/page.tsx` — 1 sola página, 2 jurisdicciones (ES/RD), campos opcionales firmSize/phone |
| Trial 15 días sin tarjeta | ✅ Operativo | Copia inline "15 días sin tarjeta, todo incluido" |
| Demo tenant en prod | ✅ Operativo | `ensure-demo-tenant.mjs` + `seed-demo-showcase.mjs`; `demo@demo.lawzora` |
| Planes SaaS | ✅ 3 tiers × 3 ciclos + Fundador (cupo 18) en Stripe LIVE | — |
| Material de venta | ✅ `GUION_DEMO_VENTAS.txt` existe | Sin versión digital interactiva ni RD-específica |
| Página pública de precios | ❌ No encontrada | Solo mención inline en el formulario de alta |
| Funnel / analytics de conversión | ❌ No encontrado | No hay tracking de pasos alta → activación |
| Onboarding guiado post-alta | ❌ No encontrado | Tras crear cuenta → dashboard sin guía de primeros pasos |
| Secuencia de email post-alta | ❌ No encontrada | Brevo configurado pero sin nurturing sequence |
| Material de venta RD específico | ❌ No encontrado | El guion cubre ES; RD tiene diferencias fiscales (e-CF, ITBIS) |

### 1.3 Gaps priorizados

**G1-A — Página pública de precios** (P1)
Sin `/precios`, la comparación de planes requiere completar el alta. Aumenta la fricción pre-conversión y dificulta el seguimiento de leads educados.

**G1-B — Onboarding guiado (checklist post-alta)** (P1)
Sin guía, el tiempo hasta "primer valor" (primer expediente o primera factura) es indefinido. Los SaaS B2B con guía reducen churn en los primeros 14 días entre 20-40%.

**G1-C — Funnel de conversión analítico** (P2)
Sin medir los pasos (visita landing → inicio registro → submit formulario → activación → primer expediente), no es posible optimizar con datos.

**G1-D — Secuencia de nurturing por email (15 días)** (P2)
Los 15 días de trial sin contacto dejan a los despachos solos. Una secuencia de 4-5 correos (tips de setup, demo de feature estrella, oferta de llamada) mejora la conversión a pago.

**G1-E — Material específico RD** (P3)
RD difiere en e-CF/DGII, ITBIS y jurisdicción DO. El guion ES no menciona estos diferenciales. Bloquea ventas a despachos dominicanos sin adaptación.

### 1.4 Especificaciones por ítem

#### G1-A: Página pública de precios
- **Ruta:** `/es/precios`, `/do/precios` (locale-aware, ya existe el sistema de rutas)
- **Contenido:** tabla de 3 tiers (Starter, Pro, Fundador) × ciclos anual/mensual, comparativa de features, FAQ de 5 puntos, CTA → `/es/alta`
- **Criterios de aceptación:**
  - [ ] La página existe en ambos locales (/es y /do) con precios correctos (EUR/DOP)
  - [ ] El plan Fundador muestra cupo restante (o "CERRADO" si agotado)
  - [ ] La página tiene canonical, OG tags y aparece en sitemap.ts
  - [ ] En mobile es usable (diseño responsive)
  - [ ] El CTA lleva al formulario de alta con `?plan=X` preseleccionado (opcional para Fase 1)

#### G1-B: Onboarding guiado post-alta
- **Mecanismo:** checklist persistente en dashboard (se cierra al completar o descartar explícitamente)
- **Pasos sugeridos (7):**
  1. Configura tu despacho (logo, dirección fiscal)
  2. Invita a un colaborador
  3. Crea tu primer cliente
  4. Abre tu primer expediente
  5. Sube un documento
  6. Crea una tarea con plazo
  7. Emite tu primera factura (o explora la vista de facturación)
- **Criterios de aceptación:**
  - [ ] El checklist aparece en dashboard para cuentas de < 7 días
  - [ ] Cada paso marca visualmente "completado" cuando el usuario realiza la acción (polling o event-driven)
  - [ ] El checklist es descartable y no reaparece
  - [ ] En mobile es visible y usable

#### G1-C: Funnel de conversión analítico
- **Eventos mínimos a instrumentar (server-side):**
  - `signup.started` (carga del form)
  - `signup.submitted` (POST /api/auth/register intento)
  - `signup.completed` (creación exitosa de Tenant)
  - `onboarding.step_completed` (cada paso del G1-B)
  - `first_matter_created`
  - `first_invoice_created`
- **Destino:** Sentry Performance o tabla propia de eventos (a definir con DevOps/Nora)
- **Criterios de aceptación:**
  - [ ] Los 6 eventos se emiten en producción
  - [ ] Se puede ver en Sentry (o la herramienta elegida) la tasa de conversión por paso
  - [ ] Los eventos son anonymized (sin PII en el payload)

#### G1-D: Secuencia de nurturing por email (15 días)
- **Herramienta:** Brevo (ya integrado y autenticado en prod)
- **Secuencia propuesta:**
  - D+1: "Cómo abrir tu primer expediente" (link al onboarding guiado)
  - D+3: "Zora, tu asistente de IA" (demo de la funcionalidad estrella)
  - D+7: "¿Necesitas ayuda? Agenda una llamada de 20 min"
  - D+12: "Últimos 3 días de prueba — comparativa de planes"
  - D+14: "Tu prueba termina hoy — continúa con [plan recomendado]"
- **Criterios de aceptación:**
  - [ ] La secuencia se activa automáticamente al crear un Tenant nuevo
  - [ ] Los correos usan el logo y dominio lawzora.com (autenticado en Brevo)
  - [ ] El despacho puede darse de baja (unsubscribe link)
  - [ ] Los correos están en ES y en DO (mismo idioma, diferente referencia fiscal si aplica)

#### G1-E: Material específico RD
- **Formato:** PDF + versión web de 1 página (puede ser markdown renderizado)
- **Contenido diferencial a cubrir:**
  - e-CF / DGII: cómo funciona la integración, qué hace Lawzora automáticamente
  - ITBIS: cómo Lawzora maneja el 18% en facturas
  - Legislación local: referencia a Ley 172-13 y RGPD equivalente
- **Criterios de aceptación:**
  - [ ] El material existe y está accesible para el equipo de ventas
  - [ ] El guion de demo RD distingue los flujos ES vs DO (e-CF vs Verifactu)

---

## 2. Calidad del agente IA Zora (goal 920de062)

### 2.1 Objetivo
Llevar la paridad del agente de 8/12 ítems a ≥11/12 vs la barra de Harvey/Clio Duo/CoCounsel, y establecer un proceso continuo de evaluación de calidad.

### 2.2 Estado actual (observado en repo)

| Componente | Estado | Notas |
|---|---|---|
| Tools (lectura) | ✅ 8 core + 91 extendidas = **~102 tools totales** | `ai-agent.tools.ts` + catálogo completo |
| Tools (escritura HITL) | ✅ 3 write tools con gate de confirmación | create_task, draft_and_save_document, create_template |
| Multi-turno conversacional | ✅ Implementado | AiConversation/AiChatMessage, historial acotado 20 msgs |
| Streaming de progreso + Stop | ✅ Implementado | NDJSON a `/ai/agent/stream`, tool-trace events + done |
| RAG semántico | ✅ Implementado | `search_firm_knowledge` con VOYAGE_API_KEY (Float[]+coseno) |
| Generative UI (tarjetas) | ✅ Diseñado (catálogo en docs/ai) | UI de tarjetas por herramienta definida |
| Token-by-token streaming final | ❌ No implementado | Considerado cosmético en roadmap |
| Workflow builder no-code | ❌ No encontrado | Alta complejidad (3 subsistemas), estimación: varias tandas |
| Agente dentro de Word/Outlook | ❌ No integrado | Add-ins existen; auth SSO de Office es la barrera |
| Evaluación sistemática (LLM-as-judge) | ❌ No encontrado | `AGENT-EVAL-SCENARIOS.md` existe pero sin harness automatizado |
| Paridad actual vs Harvey/Clio | 8/12 | 4 ítems pendientes según auditoría jun-27 |

### 2.3 Los 4 gaps de paridad pendientes (inferidos de la auditoría 8/12)

Basado en AGENT-REMAINING-ROADMAP.md y el catálogo de tools, los gaps de paridad más probables son:

| ID | Gap | Evidencia |
|---|---|---|
| Z-1 | Token-by-token streaming del texto final | Roadmap: cosmético, posponer tras 1 y 2 |
| Z-2 | Workflow builder no-code | Roadmap: 3 subsistemas, alta complejidad |
| Z-3 | Agente dentro de Word/Outlook (SSO) | Roadmap: Fase A (token) → Fase B (SSO Office) |
| Z-4 | Harness de evaluación automatizado | AGENT-EVAL-SCENARIOS.md existe sin ejecución automática |

### 2.4 Especificaciones por ítem

#### Z-1: Token-by-token streaming de texto final
- **Contexto:** El canal NDJSON ya existe para tool-traces. El texto final llega completo ("done" event). Extender para enviar tokens del texto final progresivamente.
- **Restricciones:** Debe respetar el HITL (no streamear como final si hay pendingWrites) y las citas RAG (resolver al final, reconciliar después).
- **Criterios de aceptación:**
  - [ ] El texto de respuesta final aparece token a token en la UI del chat
  - [ ] Si hay pendingWrites, el streaming se pausa hasta resolución HITL
  - [ ] Las citas RAG (fuentes) aparecen correctamente después del texto final
  - [ ] Existe un botón "Stop" que corta el stream en cualquier momento (ya existe para tool-traces, extender a texto)
  - [ ] Regresión: las herramientas HITL siguen funcionando correctamente

#### Z-2: Skills preconstruidos (fase previa al workflow builder)
- **Contexto:** El roadmap recomienda no construir el editor visual primero. Entregar primero "skills" preconstruidos: secuencias parametrizadas expuestas como plantillas con formulario de entradas.
- **Candidatos para Fase 1 (4 skills):**
  1. "Apertura de expediente completa" (conflict check → alta cliente → apertura expediente → carta encargo)
  2. "Revisión semanal de cartera" (stale matters + tareas vencidas + resumen KPIs)
  3. "Montaje de operación M&A" (partes + hitos + data room + estructura DD)
  4. "Plazo procesal desde notificación" (cálculo + tarea + asignación)
- **Criterios de aceptación:**
  - [ ] Los 4 skills son seleccionables desde la UI del chat (panel de "Flujos rápidos" o similar)
  - [ ] Cada skill abre un formulario de entradas mínimas (ej: nombre del cliente, tipo de expediente)
  - [ ] Al ejecutar, el agente guía el flujo paso a paso con confirmaciones HITL en cada escritura
  - [ ] Los skills son auditables (aparecen en el log de auditoría del agente)

#### Z-3: Evaluación automatizada de calidad del agente
- **Contexto:** `AGENT-EVAL-SCENARIOS.md` existe con escenarios de prueba pero no hay harness que los ejecute automáticamente.
- **Propuesta:** Test harness LLM-as-judge que ejecuta un conjunto de escenarios golden contra el agente y valida la respuesta por criterios definidos.
- **Criterios de aceptación:**
  - [ ] Existe un script `eval:agent` que ejecuta ≥20 escenarios contra `/ai/agent`
  - [ ] Cada escenario tiene criterios de calidad explícitos (herramienta correcta usada, respuesta sin alucinaciones, cita presente si RAG)
  - [ ] El script produce un informe de paridad (X/Y escenarios superados)
  - [ ] Se puede ejecutar en CI (o manualmente antes de cada release mayor del agente)
  - [ ] El baseline actual (8/12) queda registrado como punto de partida

#### Z-4: RAG citable — mejora de presentación de fuentes
- **Contexto:** `search_firm_knowledge` ya devuelve fragmentos con fuente. La UI del chat debe mostrar las citas de forma clicable y verificable.
- **Criterios de aceptación:**
  - [ ] Las respuestas con RAG muestran las fuentes como chips/referencias numeradas
  - [ ] Clicar una fuente abre el documento o fragmento en contexto
  - [ ] Si una fuente es un expediente/cliente, el chip es navegable (deep link)
  - [ ] Si no hay fuentes, no aparece sección de "Fuentes"

---

## 3. Observabilidad en producción (goal f2c9cbf2, parte no-infra)

### 3.1 Objetivo
Tener visibilidad operativa completa: errores capturados, KPIs de negocio monitorizables, dunning verificable, y audit log con integridad garantizada. Coordinar con Nora/DevOps para la parte de infra (Prometheus, Grafana, backups de BD).

### 3.2 Estado actual (observado en repo)

| Componente | Estado | Notas |
|---|---|---|
| Sentry API (errores) | ✅ Activo | `@sentry/nestjs`, DSN configurado en prod, GDPR-compliant |
| Pino logging | ✅ Activo | JSON estructurado, redacción de headers Auth/Cookie, `LOG_LEVEL` configurable |
| Dunning cron | ✅ Activo | Diario 6AM, in-app + email; no SMS |
| Sentry web | ⚠️ Parcial | Instrumentado pero requiere 2º DSN/proyecto separado del API |
| Audit log (AuditLog tabla) | ⚠️ Incompleto | 7 gaps de D10-001 a D10-007 (mutable, sin WORM, sin IP/user-agent) |
| Métricas de aplicación | ❌ No encontrado | Sin Prometheus, sin StatsD, sin endpoint `/metrics` |
| KPIs de negocio en tiempo real | ❌ No encontrado | Dashboard de admin sin datos de "signup rate", "active tenants", etc. |
| Alertas configuradas | ❌ Sin configurar | Solo alertas manuales de Sentry (sin umbrales ni playbooks) |

### 3.3 Gaps priorizados

| ID | Gap | Severidad | Coordinación |
|---|---|---|---|
| O-1 | Sentry web con DSN propio | Media | Tomas (CTO) |
| O-2 | AuditLog append-only (D10-001..003) | Alta | Tomas (CTO) |
| O-3 | Métricas de aplicación + Prometheus | Media | Nora (DevOps) |
| O-4 | Dashboard de KPIs de negocio | Media | Tomas + Marco (Design) |
| O-5 | Alertas con playbooks (Sentry / PagerDuty) | Media | Nora (DevOps) |
| O-6 | SMS en dunning | Baja | Tomas (CTO) |

### 3.4 Especificaciones por ítem

#### O-1: Sentry web con proyecto separado
- **Contexto:** La app web (`apps/web`) está instrumentada pero comparte el mismo Sentry DSN del API, o no tiene DSN propio configurado. Los errores de Server Components y client-side no se capturan en un proyecto separado.
- **Acción:** Crear un 2º proyecto en Sentry (lawzora-web), obtener `NEXT_PUBLIC_SENTRY_DSN` y `SENTRY_AUTH_TOKEN` para el build.
- **Criterios de aceptación:**
  - [ ] `apps/web` tiene su propio proyecto Sentry (lawzora-web)
  - [ ] Los errores de React client-side aparecen en el proyecto web (no en el API)
  - [ ] Los errores de Server Components/route handlers también se capturan
  - [ ] `global-error.tsx` está conectado al DSN correcto
  - [ ] El deploy de web pasa `NEXT_PUBLIC_SENTRY_DSN` como build arg

#### O-2: AuditLog con integridad garantizada (D10-001, 002, 003)
- **Contexto (de SECURITY-AUDIT-2026-06-24.md):**
  - D10-001: La tabla `AuditLog` es modificable/borrable por el rol de app (RLS FOR ALL, onDelete: Cascade)
  - D10-002: Acciones del super-admin de plataforma no auditadas
  - D10-003: Descargas de documentos no auditadas
- **Propuesta:**
  - Revocar UPDATE/DELETE sobre AuditLog al rol de app (solo INSERT + SELECT)
  - Añadir trigger de BD que impida UPDATE/DELETE (segunda línea de defensa)
  - Cambiar `onDelete: Cascade` a `onDelete: SetNull` o desacoplar la FK
  - Emitir evento `audit.document_download` en cada descarga interna
  - Emitir evento `platform.admin_action` para mutaciones super-admin
- **Criterios de aceptación:**
  - [ ] `REVOKE UPDATE, DELETE ON AuditLog FROM app_user` aplicado en prod
  - [ ] Trigger de BD rechaza UPDATE/DELETE (test: intentar borrar una fila → error)
  - [ ] Las descargas de documentos generan un registro en AuditLog
  - [ ] Las acciones del super-admin (login, cambio de plan, impersonation) generan AuditLog
  - [ ] Migración de Prisma sin romper esquemas existentes (mantener FKs)

#### O-3: Métricas de aplicación (coordinar con Nora/DevOps)
- **Propuesta (parte app-layer, no infra):**
  - Añadir `@nestjs/terminus` métricas básicas + endpoint `/metrics` en formato Prometheus
  - Métricas mínimas a exponer:
    - `http_request_duration_ms` (histograma por ruta y status)
    - `ai_agent_run_duration_ms` + `ai_agent_tool_calls_total`
    - `dunning_emails_sent_total` / `dunning_failed_total`
    - `active_tenants_total` (snapshot diario)
    - `invoices_created_total` / `invoices_paid_total`
- **Coordinar con Nora:** scraping con Prometheus, dashboards en Grafana, alertas de umbral
- **Criterios de aceptación:**
  - [ ] Endpoint `GET /metrics` devuelve texto Prometheus válido (requiere auth o IP allowlist)
  - [ ] Las 5 métricas listadas están presentes y se incrementan en prod
  - [ ] Nora confirma que Prometheus las raspa correctamente
  - [ ] Hay al menos 1 dashboard en Grafana con las métricas de negocio

#### O-4: Dashboard de KPIs de negocio (plataforma admin)
- **Propuesta:** Panel de super-admin (o informe Sentry/Metabase) con:
  - Nuevos tenants por semana/mes
  - Tasa de activación (registro → primer expediente, objetivo: ≥60% en 7 días)
  - Tenants activos (al menos 1 acción en 30 días)
  - MRR / ARR estimado (desde Stripe webhooks)
  - Uso de IA: runs/día, tools más usadas, tasa de HITL aceptadas vs rechazadas
  - Dunning: facturas vencidas, recuperadas, fallidas (tasa por mes)
- **Criterios de aceptación:**
  - [ ] Las métricas se calculan server-side (no en el cliente) y no exponen datos de un tenant a otro
  - [ ] El panel es accesible solo para platform admin
  - [ ] Los datos se actualizan al menos diariamente (cron o webhooks)
  - [ ] MRR viene de Stripe (no de la BD local) para evitar divergencia

#### O-5: Alertas operativas con playbooks
- **Propuesta:**
  - Definir umbrales de alerta en Sentry:
    - Error rate > 1% en 5 min → PagerDuty/Slack
    - Dunning cron sin ejecutarse en 26h → alerta
    - AI quota exhaustion de cualquier tenant → alerta
    - Sentry DB latency > 500ms p95 → aviso
  - Documentar playbook por tipo de alerta (quién, qué hacer, escalación)
- **Coordinar con Nora:** configurar los canales de notificación (Slack #incidentes, PagerDuty on-call)
- **Criterios de aceptación:**
  - [ ] Al menos 4 reglas de alerta están configuradas en Sentry/Grafana
  - [ ] Existe `docs/runbooks/ALERT-PLAYBOOKS.md` con pasos por tipo de alerta
  - [ ] Al menos un miembro del equipo recibe las alertas en tiempo real (Slack/PagerDuty)

---

## 4. Sub-tickets propuestos para aprobación de Aurora

> Aurora aprueba/rechaza/reasigna. Sin crear hasta confirmación.

### Goal 1: Crecimiento

| Ticket | Título | Owner sugerido | Prioridad |
|---|---|---|---|
| LAW-CRE-1 | Página pública de precios (/es/precios + /do/precios) | Design/Marco + CTO/Tomas | P1 |
| LAW-CRE-2 | Onboarding guiado post-alta (checklist 7 pasos en dashboard) | CTO/Tomas | P1 |
| LAW-CRE-3 | Funnel de conversión: instrumentación de 6 eventos server-side | CTO/Tomas | P2 |
| LAW-CRE-4 | Secuencia de nurturing email 15 días (Brevo) | CTO/Tomas | P2 |
| LAW-CRE-5 | Material de venta específico RD (e-CF, ITBIS, Ley 172-13) | PM/Lucia | P3 |

### Goal 2: Calidad IA Zora

| Ticket | Título | Owner sugerido | Prioridad |
|---|---|---|---|
| LAW-ZOR-1 | Streaming token-a-token del texto final (extender canal NDJSON) | CTO/Tomas | P2 |
| LAW-ZOR-2 | Skills preconstruidos fase 1: 4 flujos multi-paso desde UI chat | CTO/Tomas | P1 |
| LAW-ZOR-3 | Harness de evaluación automatizada (≥20 escenarios, LLM-as-judge) | CTO/Tomas | P1 |
| LAW-ZOR-4 | RAG citable: fuentes como chips clicables en UI del chat | Design/Marco + CTO/Tomas | P2 |

### Goal 3: Observabilidad

| Ticket | Título | Owner sugerido | Prioridad |
|---|---|---|---|
| LAW-OBS-1 | Sentry web: 2º proyecto con NEXT_PUBLIC_SENTRY_DSN en prod | CTO/Tomas | P1 |
| LAW-OBS-2 | AuditLog append-only: REVOKE + trigger + descargas + super-admin | CTO/Tomas | P1 |
| LAW-OBS-3 | Endpoint /metrics Prometheus + 5 métricas mínimas | CTO/Tomas + DevOps/Nora | P2 |
| LAW-OBS-4 | Dashboard KPIs de negocio (platform admin, MRR desde Stripe) | CTO/Tomas + Design/Marco | P2 |
| LAW-OBS-5 | Alertas operativas: 4 reglas + playbooks en runbooks/ | DevOps/Nora | P2 |

---

*Documento generado por Lucia (PM) — LAW-4. Para revisión y aprobación de Aurora antes de crear sub-tickets.*
