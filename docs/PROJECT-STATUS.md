# Estado del proyecto — fuente de la verdad

> **Único fichero autoritativo de "qué está en prod vs qué está pendiente".** Los docs de planificación
> (`docs/improvements/NEXT-IMPROVEMENTS.md`, `docs/ai/AGENT-REMAINING-ROADMAP.md`, `docs/strategy/*GAP*`)
> son de **planificación** y quedan STALE al entregarse cosas: **este fichero manda**.
>
> **Última actualización:** 2026-07-01 · **Prod:** API `lawzora-api` v140 · web `lawzora-web` v118 · main `8df2b2a`.

---

## ✅ DESPLEGADO EN PRODUCCIÓN (no volver a listar como pendiente)

### Olas de la org de agentes (jun-30 / jul-01)
- **Transaccional T-1** — Funds-flow / closing statement + ledger de escrow con importes (modelos + RLS + PDF + UI cockpit). Bug i18n `deal.fundsFlow.*` **corregido** en Ola 2.
- **Transaccional T-2** — Gating de Conditions Precedent + indicador de readiness al signing/closing.
- **Transaccional T-3** — Alertas de plazo del calendario (longstop / CP deadline; migración `deal_milestone_reminders`).
- **IA — Builder de workflows multi-paso (LAW-22)** — motor + persistencia RLS + API `/ai/workflows*` **y UI (LAW-67)**. **VIVO en prod** (gated `@RequiresFeature('ai')`; ANTHROPIC_API_KEY ya puesta). ← *el "gap #1 del roadmap del agente" está CERRADO y desplegado; ya NO espera merge.*
- **IA — Streaming de progreso + Stop/cancel (LAW-21)** — cancelación real del turno; default `claude-opus-4-8`.
- **Seguridad** — trigger append-only en AuditLog; fix BAC en borrado de clientes (LAW-31); harness pentest autenticado; triage pentest jun-26.
- **Crecimiento** — página pública `/es/precios`; claims fiscales precisos (LAW-47).
- **Calidad** — harness `eval:agent`; linter i18n `tools/i18n-check.mjs` en CI (LAW-49).
- **Fiscal (seams, gated)** — firma XAdES-BES e-CF + Verifactu (firma+QR). NO transmite aún (falta cert).

### Ya entregado antes (contexto)
- **NEXT-IMPROVEMENTS 1.2 → 3.4** — entregado en **Tanda 2 (PRs #174–#184)**. *(El único de esa tanda sin hacer es **1.1**.)*
- Cockpit transaccional base (#185), chat social interno (#186), cobro/Stripe, multi-jurisdicción ES/RD, aceptación legal (clickwrap), importar de la nube, observabilidad (Sentry/pino), y el resto del núcleo.

---

## ⏳ PENDIENTE — construible ahora (priorizado)

### Prioridad alta
1. **Notificaciones del chat por correo/push (NEXT 1.1)** — la única de esa tanda sin hacer. Reutiliza `MatterReadState` + Brevo + PWA; enganche = cron sobre no-leídos. Impacto Alto · Esfuerzo Medio.
2. **Búsqueda dentro del contenido de documentos (NEXT 2.1)** — extender RAG al texto extraído (`extractText` ya existe). Impacto Alto · Esfuerzo Alto. *(Requiere `VOYAGE_API_KEY`.)*

### Prioridad media (foso / paridad)
3. **RAG jurídico sobre fuentes públicas** (CENDOJ/BOE ES + Poder Judicial RD) — refuerza el diferencial ES+RD. Esfuerzo Medio-alto.
4. **Webhooks salientes** — complementa el OpenAPI ya publicado; abre integraciones. Esfuerzo Bajo.
5. **Agente dentro de Word/Outlook (gap #2)** — Fase A (token de sesión) desbloquea valor; Fase B (SSO Office) necesita entorno Office real.

### Prioridad baja (pulido / infra externa)
6. **App móvil vía Capacitor** (reutiliza la web Next.js).
7. **Onboarding por materia** (reduce time-to-value).
8. **Streaming token-a-token del texto final** — cosmético; el progreso + Stop ya cubren la barra del sector. Posponer.

### Follow-ups fiscales/legales (auditoría LAW-46 de Vera)
9. **LAW-50 [NECESITA-OWNER]** — `do.json` no localiza billing/deal → tenants RD ven IVA/IRPF en vez de ITBIS/ISR. Necesita glosario RD del owner.
10. **LAW-51 (baja)** — cobertura golden-file del seam de firma.

---

## 🔒 BLOQUEOS DEL OWNER (config/infra, no son "mejoras a implementar")
- **Transmisión fiscal real** (XAdES e-CF / firma+remisión Verifactu) → falta el **certificado real**. Mayor multiplicador de valor, gated en el owner.
- **`VOYAGE_API_KEY`** (búsqueda en documentos) · **`REDIS_URL`** (presencia multi-instancia). *(`ANTHROPIC_API_KEY` ya en prod → IA viva.)*
- **ZOR-3** — correr el baseline de `eval:agent` (necesita key + tenant).
- **Backlog de seguridad preexistente (CodeQL)** — 9 alertas viejas (jun-20/30), incl. **3 CRÍTICAS** `type-confusion` en `apps/api/src/integrations/microsoft.service.ts:103-106` + ReDoS en `inbound-email` + `text-extract`. Tanda de seguridad separada.

---

## Recomendación de arranque
- Mayor impacto puro construible ahora: **#1 (notificaciones chat)** y **#2 (búsqueda en contenido)**.
- El "gap #1 builder de workflows" y el "merge sandbox→prod" **ya no son pendientes** (desplegados).
