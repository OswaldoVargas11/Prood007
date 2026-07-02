# Enrutado por complejidad (`AI_MODEL` vs `AI_MODEL_LIGHT`)

> 2026-07-02 — reduce coste sin bajar calidad: tareas de baja complejidad se enrutan a un modelo más
> barato; el agente conversacional principal sigue en `AI_MODEL`.

## Matriz tarea → modelo

| Tarea                                                                                                                   | ¿Llama al modelo? | Modelo                                                                             | Motivo                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Agente conversacional (`POST /ai/agent`, `AiAgentService.run`/`runStream`)                                              | Sí                | `AI_MODEL` (`claude-opus-4-8`)                                                     | Tool-use multi-paso, razonamiento jurídico — necesita el modelo principal.                                                         |
| Resumen del día (`AiService.dailyBrief`)                                                                                | Sí                | **`AI_MODEL_LIGHT`** (`claude-haiku-4-5-20251001`)                                 | Resumen corto (3–5 viñetas) de datos YA estructurados (KPIs del dashboard); sin tool-use.                                          |
| Verificador de citas (`AiAgentService.maybeCheckCitations`, gated `AI_CITATION_CHECK=true`)                             | Sí                | **`AI_MODEL_LIGHT`** (override explícito con `AI_CITATION_CHECK_MODEL` si se fija) | Segunda pasada de clasificación (¿la cita respalda la afirmación?), tarea acotada y de bajo riesgo.                                |
| Generación de título de conversación (`AiChatService.titleFrom`)                                                        | **No**            | —                                                                                  | Es un truncado de string del primer mensaje (`ai-chat.service.ts:37-41`); no hay llamada al modelo que enrutar.                    |
| Digest de chat (`ChatDigestService.evaluateTenant`, módulo `chat_digest`)                                               | **No**            | —                                                                                  | Agregación determinista de mensajes no leídos + plantilla de texto (`chat-digest.logic.ts`); no hay llamada al modelo que enrutar. |
| Resto (resumen/pregunta de expediente, resumen de documento, borrador de plantilla/correo, revisión tabular, playbooks) | Sí                | `AI_MODEL`                                                                         | Fuera del alcance de esta tanda; quedan en el modelo principal.                                                                    |

Los dos últimos ítems estaban en el alcance original de la tarea ("generación de títulos", "digest de
chat") pero **no llaman al modelo IA hoy** — son deterministas. No se les añadió una llamada IA nueva
(sería una feature nueva, no un enrutado) tras confirmarlo con el owner.

## Configuración

```bash
AI_MODEL="claude-opus-4-8"                    # agente conversacional principal
AI_MODEL_LIGHT="claude-haiku-4-5-20251001"    # tareas ligeras (default si no se fija)
AI_CITATION_CHECK="true"                      # activa el verificador de citas
AI_CITATION_CHECK_MODEL="..."                 # opcional: fuerza un modelo distinto solo para el verificador
```

`AI_CITATION_CHECK_MODEL`, si se fija, tiene prioridad sobre `AI_MODEL_LIGHT` (retrocompatible con el
comportamiento previo a esta tanda).

## Medir el ahorro por tenant

`AiUsage` (contador diario de cuota, ver `ai-quota.service.ts`) ahora desglosa, además de los totales
(`inputTokens`/`outputTokens`), el subconjunto atribuible al modelo ligero:

- `lightModelInputTokens`
- `lightModelOutputTokens`

`AiQuotaService.recordUsage(user, inputTokens, outputTokens, model?)` incrementa estas dos columnas
cuando `model` coincide con el `AI_MODEL_LIGHT` configurado (el modelo real devuelto por el proveedor en
`AiCompletion.model`, no el solicitado — así el desglose es exacto aunque el proveedor haga alias). No se
tocó el tope diario (`AI_DAILY_CALL_LIMIT`/`AI_DAILY_TOKEN_LIMIT`): sigue siendo un único presupuesto por
tenant+día; el desglose es solo informativo, para poder comparar `lightModel* / total` por tenant.

Migración: `20260702160000_ai_usage_light_model`.

## Corrección relacionada: `OpenAiCompatEngine.complete()` no honraba `req.model`

Se encontró que, a diferencia de `AnthropicEngine.complete()`, el motor OpenAI-compat ignoraba el
override de modelo por-llamada y siempre usaba el `AI_MODEL` del motor. Sin este fix, el enrutado a
`AI_MODEL_LIGHT` no habría funcionado en despliegues configurados con `AI_PROVIDER=openai` (Groq, Gemini,
OpenRouter, etc.). Corregido en `apps/api/src/ai/providers/openai-compat.engine.ts`.

## Comparativa `eval:agent` — opus vs sonnet-5

Objetivo de la tarea: correr `pnpm eval:agent` con `AI_MODEL=claude-opus-4-8` (baseline) y con
`AI_MODEL=claude-sonnet-5`, para evaluar si el agente **conversacional principal** podría bajar de tier
sin perder paridad. **Nota:** esto es independiente del enrutado por tarea de arriba — es una pregunta
sobre qué modelo usar para `AI_MODEL` en sí.

- **Selftest offline (`pnpm eval:agent:selftest`): ✅ verde.** 41 escenarios en el banco (`agent-eval-scenarios.json`,
  incluye E39–E41 de citas verificables), 15/15 chequeos de la lógica de puntuación pasan.
- **Corrida real: PENDIENTE-OWNER.** Requiere `ANTHROPIC_API_KEY`, un API arriba (`EVAL_API`) y un tenant
  staff sembrado (`EVAL_EMAIL`/`EVAL_PASSWORD` o `EVAL_TOKEN`) — ninguno disponible en este entorno de
  desarrollo (sandbox sin clave de Anthropic ni base de datos accesible). No se cambió el default de
  producción (`AI_MODEL` sigue en `claude-opus-4-8`); esto es solo evidencia pendiente de generar.

Para generar la comparativa cuando haya clave disponible:

```bash
# Baseline
AI_MODEL=claude-opus-4-8 pnpm --filter @legalflow/api start &   # o el despliegue de turno
ANTHROPIC_API_KEY=sk-ant-... EVAL_EMAIL=demo@demo.lawzora EVAL_PASSWORD='...' \
  pnpm eval:agent   # deja docs/ai/eval-runs/<fecha>-opus.{json,md}

# Candidato
AI_MODEL=claude-sonnet-5 pnpm --filter @legalflow/api start &
ANTHROPIC_API_KEY=sk-ant-... EVAL_EMAIL=demo@demo.lawzora EVAL_PASSWORD='...' \
  pnpm eval:agent   # deja docs/ai/eval-runs/<fecha>-sonnet5.{json,md}
```

Comparar la paridad operativa (X/41) y, sobre todo, que **0** escenarios de seguridad (E29–E38) fallen en
ambas corridas antes de considerar bajar el default de `AI_MODEL`.

## Recomendación (a falta de la corrida real)

- El enrutado por tarea (esta tanda) ya reduce coste sin tocar el modelo del agente principal: es la
  palanca de menor riesgo y queda **activa por defecto** (no gated).
- Bajar `AI_MODEL` de Opus a Sonnet-5 para el agente principal es una decisión de mayor impacto (afecta
  tool-use multi-paso y razonamiento jurídico) — no cambiar el default sin la comparativa real arriba.
