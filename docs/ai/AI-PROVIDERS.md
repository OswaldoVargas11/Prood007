# Proveedores de IA (multi-proveedor)

> Generado 2026-06-27 — programa de calidad del agente de IA.

La capa de IA es **agnóstica del proveedor**: el factory de `AiModule` elige el motor por configuración,
sin tocar el catálogo de herramientas, el executor, la RLS ni el gate HITL.

| Motor                | Cuándo                                                           | Variables                                                |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `AnthropicEngine`    | producción (calidad máxima, no entrena con tus datos)            | `ANTHROPIC_API_KEY`, `AI_MODEL` (def. `claude-opus-4-6`) |
| `OpenAiCompatEngine` | cualquier API compatible con OpenAI (incl. gratis, para pruebas) | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `AI_MODEL`          |
| `DisabledEngine`     | sin claves → la IA se muestra apagada (no rompe)                 | —                                                        |

## Selección

- `AI_PROVIDER=anthropic` o `openai` fuerza uno.
- Sin `AI_PROVIDER`: se prefiere Anthropic si está su clave; si no, OpenAI-compat.

## Proveedores compatibles con OpenAI (con function calling)

Pon estos tres secrets en `lawzora-api` (`flyctl secrets set ... -a lawzora-api`):

| Proveedor         | `OPENAI_BASE_URL`                                          | `AI_MODEL` (ejemplo)                       | Coste           |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------ | --------------- |
| **Groq**          | `https://api.groq.com/openai/v1`                           | `llama-3.3-70b-versatile`                  | Tier gratis     |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.0-flash`                         | Tier gratis     |
| **Cerebras**      | `https://api.cerebras.ai/v1`                               | `llama-3.3-70b`                            | Tier gratis     |
| **OpenRouter**    | `https://openrouter.ai/api/v1`                             | p. ej. `meta-llama/llama-3.3-70b-instruct` | Modelos `:free` |
| **Mistral**       | `https://api.mistral.ai/v1`                                | `mistral-large-latest`                     | Tier gratis     |
| **OpenAI**        | `https://api.openai.com/v1`                                | `gpt-4o-mini`                              | De pago         |

Ejemplo (Groq):

```bash
flyctl secrets set \
  AI_PROVIDER=openai \
  OPENAI_API_KEY=gsk_... \
  OPENAI_BASE_URL=https://api.groq.com/openai/v1 \
  AI_MODEL=llama-3.3-70b-versatile \
  -a lawzora-api
```

## ⚠️ Privacidad (importante en legal-tech)

Los tiers **gratuitos** pueden usar tus datos para entrenar. Lawzora maneja datos confidenciales de
clientes, así que:

- Con proveedores gratuitos: **solo el tenant demo / datos sintéticos**, nunca datos reales.
- Para producción real: **Anthropic** (no entrena con datos de la API por defecto) o un proveedor de pago
  con ZDR (Azure OpenAI, OpenAI con ZDR) o self-host.

## Limitaciones del motor OpenAI-compat

- Adjuntos: soporta **imágenes** (visión, data URL); **PDF no** (el resumen de documentos con PDF nativo
  es mejor en Anthropic).
- Calidad de tool-use/razonamiento de los modelos abiertos < Claude: vale para validar la fontanería
  end-to-end, no como calidad de producción jurídica.
