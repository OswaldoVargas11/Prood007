# Auditoría de paridad — Agente de IA de Lawzora vs. líderes del mercado

> Generado 2026-06-27 — programa de calidad del agente de IA.

Auditoría de paridad del agente de IA de Lawzora (`POST /ai/agent`) contra un checklist de 12 puntos derivado de la investigación de los agentes legales líderes: **Clio Duo**, **Harvey**, **Thomson Reuters CoCounsel**, **LexisNexis Lexis+ AI / Protégé** y **vLex Vincent**.

Todo lo afirmado sobre Lawzora procede del estado verificado del código a 2026-06-27 (`apps/api/src/ai/ai-agent.tools.ts`, `ai-agent.service.ts`, `packages/domain` `AiEngine`, `docs/architecture/ADR-001-agentic-ai.md`, `docs/ai/AGENT-TRUST-PATTERNS.md`). Todo lo afirmado sobre competidores procede de las fuentes citadas en cada punto (URLs al final). Material para due-diligence de producto/IP; sin afirmaciones no defendibles.

**Leyenda de veredicto:** **Cumple** = paridad funcional con los líderes · **Parcial** = mecanismo presente pero incompleto frente al estándar de mercado · **Falta** = no implementado.

---

## 1. Conversacional multi-turno con memoria

| Punto                   | Qué hacen los líderes                                                                                                                                | Qué hace Lawzora                                                                                                                                                                                  | Veredicto  | Evidencia / ruta                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| Multi-turno con memoria | Harvey opera como asistente conversacional sobre múltiples documentos en un mismo hilo; CoCounsel y Vincent mantienen sesión de trabajo persistente. | Conversación **multi-turno real**: el historial se reenvía por turno (servidor _stateless_, tope 20 mensajes). UI: dock de chat flotante (solo staff, gated por `/ai/status` + entitlement `ai`). | **Cumple** | `apps/web/src/components/lexora/ai-agent-dock.tsx`; `POST /ai/agent`; ADR-001 |

Matiz honesto: el hilo es _stateless_ en servidor (memoria por reenvío del cliente), sin memoria persistente entre sesiones ni recuperación de hilos pasados. Suficiente para paridad conversacional básica, por debajo de "memoria de larga duración".

## 2. Grounding sobre datos reales del despacho

| Punto                        | Qué hacen los líderes                                                                                                                                                          | Qué hace Lawzora                                                                                                                                                                                                                                                                                | Veredicto  | Evidencia / ruta                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| Grounding sobre datos reales | Clio Duo aterriza recomendaciones sobre los datos del estudio; Lexis+ usa _legal chunking_ sobre el DMS con BYOK; todos exigen "responder solo desde las fuentes recuperadas". | 7 herramientas de **lectura acotadas por `tenantId` + RLS Postgres**: `search_matters`, `get_matter`, `list_open_tasks`, `find_client`, `list_documents`, `firm_overview` (expedientes activos/tareas/plazos vencidos). El agente consulta el estado real del despacho, no responde de memoria. | **Cumple** | `apps/api/src/ai/ai-agent.tools.ts` (tools 1-6); executor con `tenantId` explícito |

Matiz: el grounding es sobre **datos estructurados** (metadatos de expedientes/tareas/clientes/documentos). El RAG semántico sobre el **texto** de los documentos existe pero aún no es herramienta del agente (ver punto 3).

## 3. Citas verificables + anti-alucinación

| Punto                                 | Qué hacen los líderes                                                                                                                                                                                                                                                           | Qué hace Lawzora                                                                                                                                                                                                                                                                                                                                                                                                 | Veredicto   | Evidencia / ruta                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Citas verificables + anti-alucinación | Harvey descompone la respuesta en afirmaciones y verifica frase-a-frase (tasa ≈0,2%); Lexis+ Shepard's Verify comprueba existe/es-válida/cómo-fue-tratada y **marca lo no verificable**; Vincent enlaza cada autoridad con _hover-to-quote_; CoCounsel integra KeyCite siempre. | El prompt **prohíbe inventar** referencias/sentencias/citas; `legal_research` remite a **fuente primaria oficial** (CENDOJ/BOE en ES; Poder Judicial/DGII en RD) sin descargar contenido (evita alucinar jurisprudencia). Cada respuesta del agente devuelve la **traza de herramientas** ("Consultó: …") visible en la UI. El asistente **one-shot** (separado) ya muestra citas `[[id]]` + señal de confianza. | **Parcial** | `ai-agent.tools.ts` (tool `legal_research`); prompt anti-alucinación; one-shot con `[[id]]` |

Brecha: el mecanismo de **cita clicable + señal de validez** vive en el one-shot, **no portado al agente**; falta marcar explícitamente lo "no verificado" en vez de afirmarlo. Por debajo de Shepard's Verify / hover-to-quote.

## 4. Human-in-the-loop con checkpoints

| Punto                | Qué hacen los líderes                                                                                                                                                                                                            | Qué hace Lawzora                                                                                                                                                                                                                                                                                             | Veredicto   | Evidencia / ruta                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------- |
| HITL con checkpoints | Harvey diseña los Workflow Agents "con checkpoints HITL como característica central" y **pregunta si debe proceder** antes de editar; Spellbook: "todo lo que produce es una sugerencia", el letrado confirma/modifica/descarta. | Las dos escrituras son **reversibles y no fiscales** y nacen como **BORRADOR PENDING** a revisión del letrado: `create_task` (vía `TasksService`, audita/notifica) y `draft_and_save_document` (PDF con membrete, versión 1 PENDING, hash SHA-256, indexado). El prompt obliga a actuar solo cuando se pide. | **Parcial** | `ai-agent.tools.ts` (tools `create_task`, `draft_and_save_document`); ADR-001 Olas 2a/3a |

Brecha: el checkpoint es **post-hoc** (la escritura ya ocurrió, reversible) — no hay **gate de confirmación ANTES** de ejecutar la tool (ver punto 7). Es defendible (todo es reversible y revisable) pero por debajo del "ask before proceeding" de Harvey.

## 5. Ejecución agéntica multi-paso

| Punto                         | Qué hacen los líderes                                                                                                     | Qué hace Lawzora                                                                                                                                                                                                                                                                           | Veredicto  | Evidencia / ruta                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------- |
| Ejecución agéntica multi-paso | CoCounsel Deep Research interpreta → determina enfoque → ejecuta el flujo completo; Harvey encadena pasos de un workflow. | **Loop de tool-use real**: el modelo pide herramienta → el motor la ejecuta vía `executor` → devuelve el resultado → itera. `maxSteps` como tope anti-bucle (acota coste y previene recursión infinita). Modelo Anthropic Claude (`claude-opus-4-6` por defecto, configurable `AI_MODEL`). | **Cumple** | `AnthropicEngine.runAgent` en `packages/domain`; ADR-001 §Diseño |

## 6. Transparencia del razonamiento / thinking traces + plan

| Punto                                  | Qué hacen los líderes                                                                                                                                | Qué hace Lawzora                                                                                                             | Veredicto   | Evidencia / ruta                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------- |
| Transparencia / thinking traces + plan | Vincent "Clear Box": el letrado ve cómo llegó al resultado; CoCounsel **planifica** (crea un plan de investigación multi-paso) y explica su proceso. | Devuelve la **traza de herramientas usadas** ("Consultó: …") visible en el dock, lo que da auditabilidad de qué se consultó. | **Parcial** | `ai-agent-dock.tsx`; traza de tools en la respuesta |

Brecha: la traza es **post-hoc** (qué se consultó), **no** hay plan previo numerado ni razonamiento ("thinking") en vivo antes de ejecutar. Por debajo del "Clear Box" + plan de CoCounsel/Vincent.

## 7. Confirmación humana antes de acciones que escriben

| Punto                          | Qué hacen los líderes                                                                                                                                        | Qué hace Lawzora                                                                                                                                                                                                    | Veredicto | Evidencia / ruta                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| Confirmación antes de escribir | Harvey **pregunta si debe proceder a editar** antes de hacerlo; Spellbook exige confirmar/modificar/descartar cada cambio antes de aplicarlo (bulk-approve). | No existe un **gate de confirmación explícito ANTES** de ejecutar `create_task`/`draft_and_save_document`. La mitigación actual es que toda escritura es **reversible** y nace como BORRADOR pendiente de revisión. | **Falta** | ADR-001 (gate no implementado); `AGENT-TRUST-PATTERNS.md` rec. P0 #1 |

Brecha de mayor impacto reputacional, aunque acotada por la reversibilidad. Recomendación documentada: estado `pending_action` que el motor no ejecuta hasta recibir `approve`, auditado en `ai.agent_run`.

## 8. Acciones reales / tool use

| Punto                      | Qué hacen los líderes                                                                                                        | Qué hace Lawzora                                                                                                                                                                                                                                | Veredicto  | Evidencia / ruta                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| Acciones reales / tool use | Clio Duo opera sobre los datos del estudio; Harvey/CoCounsel ejecutan tareas (redacción, redline, research) con efecto real. | 2 herramientas de **escritura reversibles y no fiscales** reutilizando servicios existentes con sus validaciones: `create_task` y `draft_and_save_document`. **NUNCA**: facturas, pagos, firmas, envíos de correo, cambios de estado, borrados. | **Cumple** | `ai-agent.tools.ts` (tools 8-9); ADR-001 Olas 2a/3a |

Diferenciador defensivo: la **exclusión deliberada de rutas fiscales** (e-CF DGII / Verifactu) y financieras es una decisión de seguridad, no una carencia.

## 9. Skills/workflows preconstruidos + builder no-code

| Punto                              | Qué hacen los líderes                                                                                                                                                                                        | Qué hace Lawzora                                                                                                            | Veredicto | Evidencia / ruta                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------ |
| Skills/workflows + builder no-code | CoCounsel: workflows guiados + **builder** para crear/guardar/compartir procesos de la firma; Harvey Agent Builder; Lexis+ "skills" (documentos Word que dicen al agente cómo pensar) subibles por la firma. | No hay plantillas de workflow empaquetadas ni builder no-code. El agente opera por prompt libre sobre el catálogo de tools. | **Falta** | `AGENT-TRUST-PATTERNS.md` rec. P2 #9 |

## 10. Integración nativa (Word/Outlook/DMS) + panel de chat + sugerencias proactivas

| Punto                                 | Qué hacen los líderes                                                                                                            | Qué hace Lawzora                                                                                                                                                             | Veredicto   | Evidencia / ruta                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| Integración nativa + dock + proactivo | Clio for Word integra Vincent para draft/review/redline dentro de Word (beta may-2026); Lexis+/CoCounsel viven en el DMS/Office. | **Dock de chat** flotante (solo staff) ya integrado en la web. Add-ins de **Word y Outlook existen** pero **separados** del agente. Sin sugerencias proactivas contextuales. | **Parcial** | `ai-agent-dock.tsx`; add-ins Word/Outlook (separados) |

Brecha: el agente aún no vive **dentro** de los add-ins; el cliente del dock podría reutilizarse contra `POST /ai/agent` con el mismo gating.

## 11. Control en tiempo real (Stop / redirect)

| Punto                  | Qué hacen los líderes                                                                                                 | Qué hace Lawzora                                                                                                                                  | Veredicto | Evidencia / ruta                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------- |
| Control en tiempo real | UX de chat agéntico moderno (estilo CoCounsel/Harvey, sobre streaming) permite interrumpir/redirigir un run en curso. | No hay **streaming de tokens** ni **botón Stop**/cancelación de run. El único corte es `maxSteps` (tope automático), no interrupción del usuario. | **Falta** | ADR-001 (streaming listado como evolución futura) |

## 12. Gobernanza (permisos rol/tenant, audit log, no entrenar, BYOK)

| Punto      | Qué hacen los líderes                                                                                                                                         | Qué hace Lawzora                                                                                                                                                                                                                                                                 | Veredicto  | Evidencia / ruta                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Gobernanza | Clio: **tenant isolation** + datos **no usados para entrenar** + audit log de toda la actividad de IA; Lexis+ añade **BYOK** (claves de cifrado del cliente). | **Tenant-scoping obligatorio** en cada herramienta + **RLS Postgres** + auditoría `ai.agent_run` + **cuota diaria por tenant** (llamadas + tokens) + datos **no usados para entrenar** (API Anthropic). Solo staff (`FIRM_ADMIN`/`LAWYER`); el portal del cliente **no** accede. | **Cumple** | `ai-agent.service.ts`; evento `ai.agent_run`; ADR-001 §Seguridad |

Matiz: BYOK (claves de cifrado en poder del cliente, estilo Lexis+) no está; queda como diferenciación futura. Lo demás iguala o supera el estándar.

---

## Resumen ejecutivo

| Veredicto   | Puntos                                                                                            | Conteo     |
| ----------- | ------------------------------------------------------------------------------------------------- | ---------- |
| **Cumple**  | 1 (multi-turno), 2 (grounding), 5 (agéntico multi-paso), 8 (tool use), 12 (gobernanza)            | **5 / 12** |
| **Parcial** | 3 (citas/anti-alucinación), 4 (HITL checkpoints), 6 (transparencia/plan), 10 (integración nativa) | **4 / 12** |
| **Falta**   | 7 (confirmación pre-escritura), 9 (skills/builder), 11 (control en tiempo real)                   | **3 / 12** |

Lectura: Lawzora **cumple la mitad pesada y cara de construir** (grounding real con RLS, loop agéntico, escrituras reversibles, gobernanza completa). Las brechas son de **confianza percibida y control fino**, no de arquitectura de fondo. Ningún punto "Falta" es estructuralmente difícil; los tres tienen costura de diseño ya identificada.

---

## Los gaps más importantes

### 1. Gate de confirmación pre-escritura (punto 7 — Falta) — el de mayor impacto reputacional

Hoy el agente ejecuta `create_task`/`draft_and_save_document` sin pedir confirmación previa; la red de seguridad es la **reversibilidad** (todo nace como BORRADOR PENDING). Los líderes (Harvey "ask before proceeding", Spellbook confirmar/modificar/descartar) hacen del consentimiento previo el gesto central de confianza. **Impacto:** en due-diligence y en la percepción del letrado, "la IA actuó y luego lo reviso" pesa peor que "la IA propuso y yo aprobé", aunque el riesgo real esté acotado. Costura: estado `pending_action` no ejecutado hasta `approve`, auditado en `ai.agent_run`. **Bajo coste, alto retorno.**

### 2. Streaming + thinking-traces/plan en vivo + botón Stop (puntos 6, 11 — Parcial/Falta)

Falta streaming de tokens, plan previo numerado, razonamiento en vivo ("Clear Box" de Vincid, plan de CoCounsel) y un **botón Stop** para interrumpir un run entre pasos. Hoy solo hay traza **post-hoc** ("Consultó: …") y el tope automático `maxSteps`. **Impacto:** es la diferencia de _experiencia_ más visible frente a Harvey/CoCounsel; un agente que "piensa en vivo y se puede parar" se percibe como controlable y moderno. Afecta directamente a la sensación de control del usuario y a la demo comercial.

### 3. RAG-sobre-docs como herramienta del agente (puntos 2/3 — Parcial)

El RAG semántico (Voyage embeddings + coseno) **ya existe** como endpoint one-shot, pero **no está expuesto como tool del agente**. Por eso el agente fundamenta sobre **metadatos** pero no sobre el **texto** de los documentos con cita al fragmento. **Impacto:** limita el grounding y la citabilidad (puntos 2 y 3 a la vez) justo donde Vincent/Lexis+ son fuertes (cita al chunk con enlace). Costura: envolver el endpoint como `search_firm_knowledge` acotada por `tenantId`/RLS, devolviendo `documentId` + fragmento citable.

### 4. Workflows preconstruidos + builder no-code (punto 9 — Falta)

CoCounsel/Harvey/Lexis+ empaquetan flujos guiados y un builder para que la firma cree los suyos. Lawzora opera por prompt libre. **Impacto:** es funcionalidad de **diferenciación y retención** (procesos repetibles de la firma), no de confianza; menos urgente que 1-3 pero relevante para competir en "plataforma" y no solo "asistente". Las plantillas (skills versionados sobre las tools existentes) son baratas; el builder no-code es el tramo caro.

---

## Conclusión honesta: ¿es "comparable" a los líderes?

**Sí, es comparable en su clase, con asteriscos honestos.** Lawzora iguala a los líderes en lo más caro de construir — **grounding sobre datos reales con RLS por tenant, ejecución agéntica con tool-use real, escrituras reversibles auditadas y gobernanza completa** (tenant-scoping + RLS + `ai.agent_run` + cuotas + no-train). Lo que falta (gate pre-escritura, streaming/plan/Stop, RAG como tool, workflows) es **elevable con bajo coste** y sin tocar arquitectura. No es paridad total con Harvey/CoCounsel a 2026, pero sí un agente de la misma familia técnica.

**Dimensiones donde Lawzora GANA:**

- **Foso fiscal ES + RD.** Ningún líder global cubre e-CF DGII (RD) **y** Verifactu/TicketBAI (ES) de forma nativa; Lawzora trata el registro fiscal como **invariante inmutable que la IA tiene prohibido tocar**. Es a la vez foso de producto y postura de seguridad defendible.
- **Gobernanza / RLS como invariante, no como ajuste.** El tenant-scoping es **doble** (RLS Postgres + `tenantId` explícito en cada tool) y el portal del cliente está excluido por diseño. Iguala a Clio en aislamiento y lo formaliza en código.
- **Escrituras reversibles auditadas y acotadas.** La política "solo reversible, no fiscal, vía servicio existente, auditada, nace como BORRADOR" es una postura de seguridad **más conservadora y más auditable** que el "el agente edita directamente" de varios líderes.

**Dimensiones donde Lawzora PIERDE:**

- **Contenido jurídico.** No tiene base curada propia ni citador (Westlaw/KeyCite, Shepard's, base vLex). `legal_research` enlaza a fuente oficial pero **no ingiere ni verifica vigencia**; aquí Lexis+/CoCounsel/Vincent son estructuralmente superiores.
- **Ecosistema.** Sin integración del agente dentro de Word/Outlook (los add-ins existen pero separados), sin marketplace de skills/workflows ni alianzas (p. ej. Harvez×Lexis). Clio for Word ya lleva a Vincent dentro de Word.
- **Streaming / UX en vivo.** Sin streaming, plan en vivo ni Stop; la experiencia de "agente que piensa y se puede parar" es inferior a la de Harvey/CoCounsel.

**Veredicto de due-diligence:** base arquitectónica madura y diferenciada por jurisdicción (ES+RD) y gobernanza; brechas reales pero tácticas (confianza percibida y control de UX), no de fondo. Con las P0-P1 documentadas en `AGENT-TRUST-PATTERNS.md` (gate de confirmación, citas clicables en el agente, Stop, RAG como tool), el agente alcanza paridad funcional en confianza y HITL.

---

### Fuentes

- Harvey — [BigLaw Bench: Hallucinations](https://www.harvey.ai/blog/biglaw-bench-hallucinations), [Workflow Agents](https://www.harvey.ai/platform/workflow-agents), [Agent Builder](https://www.harvey.ai/blog/introducing-agent-builder)
- Thomson Reuters CoCounsel — [Press release agéntico/Deep Research](https://www.thomsonreuters.com/en/press-releases/2025/august/thomson-reuters-launches-cocounsel-legal-transforming-legal-work-with-agentic-ai-and-deep-research), [CoCounsel Legal](https://legal.thomsonreuters.com/en/products/cocounsel-legal), [Reimagined](https://www.thomsonreuters.com/en-us/posts/innovation/cocounsel-legal-reimagined/), [KeyCite](https://legal.thomsonreuters.com/en/products/westlaw/keycite)
- LexisNexis Protégé — [Citation integrity](https://www.lexisnexis.com/community/insights/legal/b/thought-leadership/posts/legal-ai-citation-integrity), [Greg Dickason CTO sobre Shepard's Verify](https://www.geeklawblog.com/2026/06/lexisnexis-cto-greg-dickason-on-agentic-legal-ai-protege-shepards-verify-and-the-future-of-legal-work.html), [Lexis+ amplía con Protégé/BYOK](https://www.lawnext.com/2026/05/lexisnexis-expands-lexis-with-protege-adding-agentic-skills-collaboration-workrooms-and-customer-held-encryption-keys.html)
- vLex Vincent — [Vincent AI](https://vlex.com/vincent-ai), [Fact-checking generative AI](https://vlex.com/news/fact-check-ai-vincent), [Unique features](https://support.vlex.com/vincent-by-vlex/vincent/getting-started-with-vincent/understanding-vincents-unique-features)
- Clio Duo — [Clio Work](https://www.clio.com/work/), [Manage AI](https://www.clio.com/blog/manage-ai/), [AI principles](https://www.clio.com/ca/ai-principles/), [National Magazine: Clio big moves in AI](https://nationalmagazine.ca/en-ca/articles/legal-market/legal-tech/2025/how-clio-s-big-moves-in-ai-will-affect-legal-practice)
- Comparativas — [Vals Legal AI Report](https://www.vals.ai/industry-reports/vlair-2-27-25), [Legal AI pricing 2026](https://thelegalprompts.com/blog/ai-legal-tools-pricing-comparison)
- Lawzora (estado verificado 2026-06-27) — `apps/api/src/ai/ai-agent.tools.ts`, `apps/api/src/ai/ai-agent.service.ts`, `docs/architecture/ADR-001-agentic-ai.md`, `docs/ai/AGENT-TRUST-PATTERNS.md`
