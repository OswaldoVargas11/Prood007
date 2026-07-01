# Paridad competitiva — actualización 2026-07-01

> Documento de investigación — **Vera (Análisis Transaccional)**. Fecha: 2026-07-01. Issue LAW-74.
> Actualiza `AI-AGENT-PARITY-AUDIT.md` (2026-06-27) y `COMPETITIVE-GAP-ANALYSIS.md` (2026-06-27) con lo
> **construido y verificado en código** desde entonces (T-1/T-2/T-3 transaccional, workflows builder,
> gate HITL, streaming/Stop, RAG como tool, e-CF/Verifactu seams).
> **Todo lo afirmado sobre Lawzora está verificado contra el código real** (`agents/sandbox`, rutas/modelos
> citados), no de memoria. Todo lo afirmado sobre competidores conserva las fuentes de la auditoría de jun-27.

---

## 0. TL;DR — qué ha cambiado el mapa

Las auditorías de jun-27 fotografiaron un producto **antes** de tres tandas que ya están en código. Al
re-verificar contra las rutas y modelos reales, el veredicto se mueve de forma material en dos frentes:

1. **Agente de IA (Zora): de 5/12 "Cumple" → 9/12 "Cumple".** Se cerraron los tres "Falta" de jun-27
   (gate de confirmación pre-escritura, workflows builder, control en tiempo real/Stop) y dos "Parcial"
   (citas/RAG como tool, HITL con checkpoint previo). El agente pasó de **9 tools a 76** (64 lectura +
   escritura), con gate HITL "propón→confirma→ejecuta", streaming NDJSON con `AbortController`/Stop, y RAG
   citable como herramienta. Es una diferencia de **clase**, no de matiz.
2. **Módulo transaccional: la "mecánica de closing" está construida.** El hueco central que
   `TRANSACTIONAL-DEPTH-GAP-ANALYSIS.md` marcó (el *cómo se cierra*: dinero + estado) está cerrado: funds-flow
   con ledger de escrow por importes + PDF de closing statement (T-1), readiness de Conditions Precedent por
   fase (T-2), y alertas de plazo longstop/CP con ventanas prioritarias (T-3). El módulo pasó de "ancho pero
   poco profundo" a **ancho y profundo en el ciclo de cierre**.

**Matiz de honestidad (foso vs. producción):** buena parte de lo anterior vive en `agents/sandbox` a la
espera del merge del owner (política de esta corrida: los agentes no hacen push). El **foso técnico existe en
código y es demostrable**; parte aún no está en `prod`. Este documento evalúa **capacidad construida y
verificable**, distinguiéndolo de "desplegado" donde es material.

---

## 1. Agente de IA — scorecard actualizado (12 puntos)

Re-verificado contra `apps/api/src/ai/ai-agent.tools.ts`, `ai-agent.service.ts`, `ai-workflow.service.ts`,
`apps/api/src/ai/ai.controller.ts`, `packages/domain` (`AnthropicEngine`). Comparado con **Clio Duo,
Harvey, CoCounsel, Lexis+/Protégé, vLex Vincent**.

| # | Punto | jun-27 | **jul-01** | Evidencia en código |
|---|---|---|---|---|
| 1 | Conversacional multi-turno | Cumple | **Cumple** | dock `ai-agent-dock.tsx`; historial reenviado por turno |
| 2 | Grounding sobre datos reales (RLS/tenant) | Cumple | **Cumple** | 64 tools de lectura acotadas por `tenantId` + RLS |
| 3 | Citas verificables / anti-alucinación | Parcial | **Cumple (con matiz)** | `search_firm_knowledge` (RAG sobre texto, `AiSearchService`) ya es **tool del agente** → funda sobre el contenido y devuelve fragmento citable, no solo metadatos |
| 4 | HITL con checkpoints | Parcial | **Cumple** | gate `requires_confirmation` **antes** de ejecutar (además de reversibilidad post-hoc) |
| 5 | Ejecución agéntica multi-paso | Cumple | **Cumple** | loop tool-use `runAgent`, `maxSteps` |
| 6 | Transparencia / thinking-traces + plan | Parcial | **Parcial→Cumple parcial** | streaming NDJSON emite `tool`/`tool_result`/`text` en vivo (`agentStream`); falta plan numerado previo estilo CoCounsel |
| 7 | **Confirmación humana pre-escritura** | **Falta** | **Cumple** | `PendingWrite` + gate: si `WRITE_TOOLS` y `!allowWrites` → `requires_confirmation`, **no ejecuta** (`ai-agent.service.ts`) |
| 8 | Acciones reales / tool use | Cumple | **Cumple (ampliado)** | de 2 → decenas de escrituras reversibles, no fiscales, auditadas, vía servicios existentes |
| 9 | **Skills/workflows + builder no-code** | **Falta** | **Cumple** | `AiWorkflow`/`AiWorkflowRun` + motor secuencial que reutiliza `executeTool` (gate HITL heredado) + API `/ai/workflows*` + UI dock (LAW-67) |
| 10 | Integración nativa (Word/Outlook/DMS) | Parcial | **Parcial** | dock integrado; add-ins Word/Outlook existen pero el agente **aún no vive dentro** de ellos |
| 11 | **Control en tiempo real (Stop/redirect)** | **Falta** | **Cumple** | streaming + `AbortController`/`AbortSignal` propagado al engine + `isAborted()` entre tools → **Stop real** |
| 12 | Gobernanza (RLS, audit, no-train, cuota) | Cumple | **Cumple** | tenant-scoping doble + `ai.agent_run` + cuota por tokens; portal cliente excluido |

**Conteo:** de **5 Cumple / 4 Parcial / 3 Falta** → **9 Cumple / 3 Parcial (6, 10) / 0 Falta**.
(El punto 6 se cuenta conservadoramente como Parcial: hay razonamiento en vivo por streaming pero no un
plan previo numerado; el 3 se cuenta Cumple con el matiz de que no hay citador de vigencia tipo Shepard's.)

**Lectura:** los tres "Falta" de jun-27 eran precisamente los de **confianza percibida y control de UX**
(gate previo, builder, Stop). Están cerrados en código. Lo que queda "Parcial" son gaps de **ecosistema**
(agente dentro de Word/Outlook) y **experiencia** (plan previo numerado), no de arquitectura.

---

## 2. Módulo transaccional — la mecánica de closing está construida

`TRANSACTIONAL-DEPTH-GAP-ANALYSIS.md` (jun-30) diagnosticó: cobertura *estructural* sólida (quién/qué/hitos/
condiciones) pero hueco en la **mecánica de cierre** (dinero + estado). Re-verificado hoy contra
`apps/api/src/deal/`, `apps/api/src/closing/` y `apps/web/.../deal-cockpit-tab.tsx`:

| Gap jun-30 | Estado jul-01 | Evidencia en código |
|---|---|---|
| **T-1 Funds-flow + ledger de escrow con importes** | ✅ **Construido** | Modelos `DealFundsFlowLine`, `EscrowHolding`, `EscrowRelease` (schema); rutas `GET/POST /deal/:matterId/funds-flow`, `/deal/escrow`, `/escrow/:id/releases`; **PDF de closing statement** (`GET /deal/:matterId/funds-flow/statement`); cuadre multi-moneda en UI (`FundsFlowCard`). Escrow es **ledger por importes con releases**, no un flag booleano |
| **T-2 Gating de CP + readiness por fase** | ✅ **Construido** | `closing-readiness.logic.ts` (`computeReadiness`): readiness por `AT_SIGNING`/`AT_CLOSING`, cuenta `SATISFIED`+`WAIVED`, `pendingTitles`, `ready`; ruta `GET /closing/by-matter/:matterId/readiness`; test `closing-readiness.logic.spec.ts` |
| **T-3 Alertas de plazo (longstop/CP deadline)** | ✅ **Construido** | `milestone-reminders.logic.ts`: ventanas normales `[1,7,14]` y **prioritarias `[1,3,7,14,30]`** para `LONGSTOP`/`CONDITIONS_DEADLINE`; deduplicación por `targetDate`+ventana; `POST /deal/milestones/run-reminders`; `DealMilestoneRemindersService` |

**Lectura:** el diferenciador transaccional (★) ya no es solo estructural. La demo de venta a un despacho de
M&A ahora incluye los dos artefactos que un abogado transaccional busca primero — **un funds-flow que cuadra
y un indicador de readiness al signing/closing** — más el calendario que **avisa** del longstop. Es la
diferencia entre "tenemos un módulo transaccional" y "tenemos la máquina de estado del closing".

---

## 3. Matriz de capacidades actualizada (vs. líderes)

Leyenda: `OK` cubierto · `~` parcial · `—` ausente · `★` diferenciador de Lawzora · `▼` donde Lawzora pierde.
Cambios vs. jun-27 marcados con **↑**.

| Capacidad | Clio | Aranzadi/Lefebvre (ES) | Harvey | CoCounsel | **Lawzora** |
|---|---|---|---|---|---|
| Gestión de despacho | OK | OK | — | — | **OK** |
| Facturación + horas | OK | OK | — | — | **OK** |
| Compliance fiscal ES (Verifactu) | — | ~ | — | — | **OK ★** (firma+custodia; ver §5) |
| Compliance fiscal RD (e-CF DGII) | — | — | — | — | **OK ★** (motor+custodia; ver §5) |
| Multi-jurisdicción ES + RD | — | — | — | — | **OK ★** |
| Módulo transaccional / M&A | — | ~ | ~ | ~ | **OK ★ ↑** (mecánica de closing: funds-flow, readiness, alertas) |
| Data room + enlaces mágicos + Q&A | — | — | ~ | ~ | **OK ★** |
| Agente de IA (grounding+tools+HITL) | OK | ~ | OK | OK | **OK ↑** (76 tools, gate HITL, streaming/Stop) |
| Workflows builder no-code | ~ | — | OK | OK | **OK ↑** (LAW-22/67) |
| RAG citable sobre docs del despacho | ~ | ~ | OK | OK | **OK ↑** (`search_firm_knowledge`) |
| Contenido jurídico (jurisprudencia/legislación) | — | **OK ★** | ~ | OK | **— ▼** |
| Citador de vigencia (KeyCite/Shepard's) | — | ~ | OK | **OK ★** | **— ▼** |
| Agente dentro de Word/Outlook | ~ | OK | OK | OK | **~ ▼** (add-ins existen, sin agente dentro) |
| Ecosistema / marketplace | OK | ~ | ~ | ~ | **— ▼** |
| App móvil nativa | OK | OK | ~ | ~ | **~ ▼** (PWA) |
| Base instalada / marca | OK | OK | OK | OK | **— ▼** |
| BYOK (claves de cifrado del cliente) | — | — | ~ | ~ | **— ▼** |

---

## 4. Gaps que se CERRARON (ya no argumentar como debilidad)

- **Gate de confirmación pre-escritura** (era el "de mayor impacto reputacional" en jun-27) — cerrado.
- **Workflows builder no-code** — cerrado (backend + motor + API + UI).
- **Control en tiempo real / Stop** — cerrado (streaming + abort).
- **RAG como tool del agente / citabilidad** — cerrado (`search_firm_knowledge`).
- **Mecánica de closing (dinero + estado + plazos)** — cerrada (T-1/T-2/T-3).

Impacto en due-diligence: la narrativa "brechas tácticas de confianza y control, no de arquitectura" de
jun-27 ahora es más fuerte, porque **esas brechas tácticas se ejecutaron**. El comprador ve un equipo que
cierra su propio backlog de paridad con velocidad.

---

## 5. Gaps que siguen siendo REALES (honestos, priorizados)

**Estructurales (no construir — partnerizar o aceptar):**

1. **Contenido jurídico + citador de vigencia** — foso de Aranzadi/Lefebvre (ES) y de CoCounsel/Lexis+
   (KeyCite/Shepard's). `legal_research` enlaza a fuente oficial (CENDOJ/BOE/Poder Judicial/DGII) pero **no
   ingiere ni verifica vigencia**. Estructuralmente superior en el competidor; la estrategia aprobada
   (`COMPETITIVE-GAP-ANALYSIS.md §4`) es **partnerizar, no excavar**. Sigue vigente.
2. **Base instalada / marca / ecosistema** — gap **comercial**, no técnico; es el descuento de entrada para
   un comprador estratégico. No se cierra con código.
3. **BYOK** — diferenciación de Lexis+; no crítico para el segmento objetivo.

**Tácticos con dependencia EXTERNA del owner (no codeables sin él — no en esta tanda):**

4. **Transmisión fiscal real certificada** — el mayor multiplicador de valor, pero requiere el **certificado
   real del owner** y banco de pruebas:
   - **e-CF DGII (RD):** motor de firma XAdES-BES + custodia `.p12` + semilla→token→recepción **construidos y
     gated por `DGII_ENV`**; falta el certificado real (`DGII_ENV=cert` + subir `.p12`) y el perfil XAdES/
     CerteCF completo. Verificado: `dgii-signer.ts`, `ecf-transmission.service.ts`.
   - **Verifactu (ES):** custodia de cert + primitivo de firma **construidos** (`verifactu-signer.service.ts`
     reutiliza `signEnvelopedXml`); falta la **remisión SOAP** (modalidad VERI\*FACTU) que necesita banco de
     pruebas AEAT. **Hallazgo relevante (§ver doc de recomendación):** hoy **nada genera el registro de
     facturación encadenado** (`RegistroAlta` con `Huella`/encadenamiento + QR); el firmante recibe el XML ya
     hecho pero **no existe el constructor del registro**. La parte de **generación del registro encadenado +
     QR es codeable SIN certificado** (pura computación) y hace **precisa y demostrable** la claim de web
     "registro encadenado conforme". → tratado como opción **F-1** en `NEXT-DEPTH-RECOMMENDATION-2026-07-01.md`.

**Tácticos codeables SIN owner (candidatos a la próxima tanda — ver documento de recomendación):**

5. **Agente dentro de Word/Outlook** — los add-ins existen pero separados del agente; reutilizar el cliente
   del dock contra `POST /ai/agent` con el mismo gating. Valor de ecosistema.
6. **Ciclo transaccional PRE-signing y POST-closing** — la mecánica del *día del cierre* está construida, pero
   (a) la **coordinación de firma/ejecución** (quién firma qué página, contrapartes) y (b) el **seguimiento
   post-closing** (covenants, undertakings, calendario de liberación de escrow, earn-outs) **no existen** en
   código (verificado: sin modelos ni rutas). Es la frontera natural de profundidad. → **D-1/D-2/D-3**.
7. **Portfolio/pipeline de operaciones** — no existe vista cross-matter de deals (readiness agregada,
   exposición de escrow, longstops próximos a nivel despacho). Pura agregación sobre lo ya construido. → **D-3**.

---

## 6. Conclusión de due-diligence (actualizada)

**Lawzora es comparable en su clase a los líderes de IA legal, y en su vertical (ES+RD fiscal +
transaccional) no tiene competidor directo.** Frente a jun-27:

- **Gana** donde ya ganaba, **con más profundidad**: fiscal ES+RD como invariante inmutable, multi-
  jurisdicción, y ahora **la mecánica de closing** (no solo la estructura del deal) + **un agente de IA de la
  misma familia técnica que Harvey/CoCounsel** (grounding RLS, tool-use real, gate HITL, streaming/Stop,
  workflows, RAG citable).
- **Pierde** donde estructuralmente debe partnerizar (contenido jurídico + citador de vigencia) o donde el
  gap es comercial (base instalada/marca) — ninguno cerrable con código, y ambos ya asumidos en la tesis.
- **Deuda real y accionable sin owner:** ecosistema (agente en Word/Outlook) y **profundidad transaccional
  antes-del-firmar / después-del-cierre**. Es exactamente donde el foso crece con el código y el competidor
  generalista no puede seguir sin reescribir su modelo de datos.

> Documento vivo. Rutas y modelos verificados contra `agents/sandbox` a 2026-07-01. La foto de competidores
> conserva las fuentes citadas en `AI-AGENT-PARITY-AUDIT.md` §Fuentes.
