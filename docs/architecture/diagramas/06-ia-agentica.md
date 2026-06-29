# 06 · IA agéntica (Zora)

[⬅ Volver al índice](README.md)

Asistente legal con **tool-use** (Anthropic Claude) sobre los datos del despacho, con gate humano antes de escribir y sin acciones fiscales. Ref: `docs/architecture/ADR-001-agentic-ai.md`.

---

## 6.1 Bucle del agente (tool-use loop)

```mermaid
sequenceDiagram
  autonumber
  participant U as Usuario (dock Zora)
  participant CT as ai.controller<br/>@RequiresFeature('ai') · @Roles(FIRM_ADMIN,LAWYER)
  participant Q as AiQuotaService<br/>(cuota diaria llamadas/tokens)
  participant E as AnthropicEngine
  participant LLM as Claude (claude-opus-4-6)
  participant X as AiToolExecutor
  participant DB as Prisma (RLS por tenant)
  participant AU as AuditLog

  U->>CT: POST /ai/agent {mensaje, contexto}
  CT->>Q: ¿cuota disponible?
  Q-->>CT: ok
  CT->>E: runAgent(req, executor)
  loop hasta end_turn o 12 pasos
    E->>LLM: messages + tools
    alt stop_reason = tool_use
      LLM-->>E: solicita tool(args)
      E->>X: invoke(tool, args)
      X->>DB: query/acción (valida tenantId + RLS)
      DB-->>X: resultado
      X-->>E: tool_result
    else end_turn
      LLM-->>E: texto final
    end
  end
  E-->>CT: { output, steps, pendingWrites }
  CT->>AU: ai.agent_run (tools, tokens, coste)
  CT-->>U: respuesta (Markdown + UI generativa, streaming)
```

- Máx. **12 iteraciones**; todos los tokens (entrada + salida de todas las vueltas) cuentan contra la cuota.
- Streaming NDJSON al dock (`api.stream`), con render Markdown + UI generativa.
- Sin `ANTHROPIC_API_KEY` → `DisabledEngine` (503) y la UI oculta la IA.

---

## 6.2 Catálogo de tools y gate HITL

```mermaid
flowchart TB
  classDef sec fill:#fecaca,stroke:#b91c1c,color:#450a0a;
  classDef ok fill:#bbf7d0,stroke:#15803d,color:#052e16;

  subgraph read["🔎 Lectura (sin confirmación)"]
    r1[search_matters]; r2[get_matter]; r3[list_open_tasks]
    r4[find_client]; r5[list_documents]; r6[list_templates]
    r7[how_to]; r8[legal_research]
  end

  subgraph write["✍️ Escritura (reversible · gate HITL)"]
    w1[create_task]; w2[draft_and_save_document]; w3[create_template]
    w4[create_client]; w5[update_task_status]
  end

  subgraph never["⛔ Nunca expuesto"]
    n1["Facturas/pagos/fiscal<br/>(e-CF · Verifactu · DGII · AEAT)"]:::sec
    n2["Transmisión de firma"]:::sec
    n3["Envío de emails"]:::sec
    n4["Borrados / hard delete"]:::sec
  end

  read --> resp["Respuesta directa"]:::ok
  write --> hitl{"Confirmación humana<br/>(pendingWrites)"}:::sec
  hitl -- aprueba --> exec["Ejecuta + AuditLog"]:::ok
  hitl -- rechaza --> cancel["Descartado"]
```

> Toda escritura del agente es **reversible y no fiscal**, y los borradores de documento quedan en estado `PENDING` de revisión humana.

---

## 6.3 RAG citable (búsqueda semántica)

```mermaid
flowchart LR
  classDef ext fill:#fde68a,stroke:#b45309,color:#3f2d00;
  classDef data fill:#bbf7d0,stroke:#15803d,color:#052e16;

  q["Consulta"] --> emb["Voyage AI<br/>(voyage-3, 1024 dims)"]:::ext
  emb --> sim["Similitud coseno en JS<br/>(sin pgvector)"]
  sim --> idx[("AiEmbedding<br/>(kind: matter|document)")]:::data
  idx --> topk["Top-K contexto → modelo"]
  emb -. "sin VOYAGE_API_KEY" .-> txt["Fallback: búsqueda textual"]
  topk --> cite["search_firm_knowledge<br/>(respuestas citables)"]
```

| Aspecto               | Valor                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| Modelo de chat/agente | `claude-opus-4-6` (configurable `AI_MODEL`)                                   |
| Embeddings            | Voyage `voyage-3`, 1024 dims (opcional)                                       |
| Cuotas por tenant/día | llamadas + tokens (`AI_DAILY_*_LIMIT`)                                        |
| Rate limit IA         | ~20 req/min (sobre el global de 300/min)                                      |
| Auditoría             | evento `ai.agent_run` con tools, tokens y coste                               |
| `legal_research`      | apunta a fuentes primarias (CENDOJ/BOE, Poder Judicial/DGII) — **no ingesta** |
