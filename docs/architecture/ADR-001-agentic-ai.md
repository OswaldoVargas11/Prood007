# ADR-001: Capa de IA agéntica (tool-use)

> Documento vivo del programa de mejora continua — generado 2026-06-27.

| Campo      | Valor                                                               |
| ---------- | ------------------------------------------------------------------- |
| Estado     | Ola 1 desplegada (PR #195); Ola 2a escritura `create_task` en curso |
| Fecha      | 2026-06-27                                                          |
| Ámbito     | Capa de IA — `packages/domain`, `apps/api`                          |
| Decisión   | Añadir tool-use agéntico **aditivo** sobre `AiEngine`               |
| Reversible | Sí (capa nueva; no toca rutas existentes ni fiscales)               |

> **Actualización Ola 2a (2026-06-27):** se incorpora la **primera herramienta de ESCRITURA**,
> `create_task`. Decisión de seguridad: la IA solo ejecuta acciones **reversibles y no fiscales**,
> reutilizando los servicios existentes con sus validaciones (`TasksService.create`: valida tenant del
> expediente, audita `task.created`, notifica al asignado). Deliberadamente **fuera de alcance** para la
> IA: facturas, pagos, firmas, envío de correos, cambios de estado de expediente y borrados. El executor
> resuelve la referencia del expediente a su id (acotado por `tenantId`) y rechaza referencias
> inexistentes sin escribir. Próximas escrituras (p. ej. `draft_and_save_document`) seguirán el mismo
> criterio: reversibles, no fiscales, vía servicio existente, auditadas.

## Contexto

La IA actual de Lawzora es **one-shot**: el modelo genera texto (asistente, resúmenes, plantillas, borradores de correo) y el humano ejecuta cualquier acción derivada. La arquitectura es limpia e intercambiable:

- Un contrato `AiEngine` en `packages/domain` aísla el dominio del proveedor.
- `AnthropicEngine` es la implementación real (SDK `@anthropic-ai/sdk` 0.71.2, modelo por defecto `claude-opus-4-6`, configurable vía `AI_MODEL`).
- `DisabledEngine` es el _fallback_ cuando no hay clave de API, de modo que el producto arranca sin IA.
- Un `AiAssistantProvider` de alto nivel orquesta los casos de uso.
- RAG con embeddings de Voyage y similitud coseno (sin pgvector).
- Cuota diaria por _tenant_ (llamadas + tokens).

Lo que **no** existe hoy es _tool-use_ / _function calling_: el modelo no puede consultar datos reales del despacho ni proponer acciones fundamentadas. Competidores como **Clio Duo** ya ofrecen un "agente dedicado" capaz de operar sobre los datos del estudio. Cerrar esa brecha es relevante tanto para producto como para _due-diligence_ de la IP.

## Decisión

Añadir una **capa agéntica aditiva** encima de `AiEngine`, **sin reescribir** lo existente. Las llamadas one-shot actuales no cambian.

### Diseño

1. **Contrato.** Se añade un nuevo método `runAgent(req, executor)` a la interfaz `AiEngine` en `packages/domain`. El `executor` es un _callback_ inyectado por el llamante que materializa cada herramienta solicitada.

2. **`AnthropicEngine`.** Implementa el bucle de _tool-use_:
   - El modelo solicita una herramienta → el motor la ejecuta vía `executor` → el motor devuelve el resultado al modelo → se itera.
   - El bucle termina cuando el modelo emite la respuesta final **o** se alcanza `maxSteps`, un tope anti-bucle que acota coste y previene recursión infinita.

3. **`DisabledEngine`.** `runAgent` lanza **503** (servicio de IA no disponible), coherente con el _fallback_ sin clave.

4. **`AiAgentService`** (capa de aplicación en `apps/api`). Define:
   - El **catálogo de herramientas**. MVP de **solo lectura**: `search_matters`, `get_matter`, `list_tasks`, `find_client`, `list_documents`.
   - El **executor**, que mapea cada herramienta a consultas Prisma **siempre acotadas por `tenantId`** (además de la RLS de Postgres).

5. **Endpoint** `POST /ai/agent`:
   - Solo _staff_ (`FIRM_ADMIN` / `LAWYER`).
   - `RequiresFeature('ai')`.
   - _Throttle_ + cuota de tokens.
   - Auditoría con evento `ai.agent_run`.

### Catálogo de herramientas (MVP)

| Herramienta      | Tipo    | Acotación        | Descripción                                |
| ---------------- | ------- | ---------------- | ------------------------------------------ |
| `search_matters` | Lectura | `tenantId` + RLS | Busca expedientes por texto/criterios.     |
| `get_matter`     | Lectura | `tenantId` + RLS | Detalle de un expediente concreto.         |
| `list_tasks`     | Lectura | `tenantId` + RLS | Tareas (filtrables por expediente/estado). |
| `find_client`    | Lectura | `tenantId` + RLS | Localiza un cliente.                       |
| `list_documents` | Lectura | `tenantId` + RLS | Documentos asociados a un expediente.      |

## Consecuencias

**Positivas**

- El asistente pasa de **"sugerir"** a **"consultar datos reales y responder con acciones"** fundamentadas en el estado del despacho.
- **Cada paso queda auditado** (`ai.agent_run`): qué herramientas se pidieron, qué se devolvió y cuánto coste consumió.
- Diseño **aditivo y reversible**: si la capa se desactiva, el producto vuelve al comportamiento one-shot sin tocar nada.
- Cierra la brecha competitiva con agentes dedicados como Clio Duo.

**Costes / riesgos**

- El coste por turno se multiplica: un único turno agéntico puede implicar **varias llamadas** al modelo (una por iteración del bucle). La cuota de tokens debe contabilizar todo el coste agéntico, no solo la respuesta final.
- Mayor superficie de razonamiento del modelo sobre datos → el _tenant-scoping_ deja de ser una buena práctica para ser un **invariante de seguridad**.
- `maxSteps` introduce un punto de configuración sensible (demasiado bajo degrada utilidad; demasiado alto dispara coste).

## Seguridad

- **Tenant-scoping obligatorio** en cada herramienta: toda consulta Prisma del executor lleva `tenantId` explícito, **además** de la RLS de Postgres. Defensa en profundidad.
- El catálogo MVP es de **solo lectura**: ninguna herramienta muta estado.
- **Nunca** tocar rutas fiscales ni la RLS. La capa agéntica no se acerca a la construcción del registro fiscal (e-CF DGII / Verifactu/TicketBAI) ni a sus secuencias inmutables.
- La cuota de tokens cuenta el **coste agéntico completo** (todas las llamadas del bucle), evitando que un turno con muchas iteraciones eluda los límites por _tenant_.
- Acceso restringido a _staff_ (`FIRM_ADMIN` / `LAWYER`) y gobernado por `RequiresFeature('ai')` + _throttle_.

## Escalabilidad futura

| Línea                         | Descripción                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Herramientas de **escritura** | `create_task`, `draft_and_save_document`, con **matriz de permisos por rol**. |
| **Streaming**                 | Emitir tokens/pasos al cliente en tiempo real para mejor UX.                  |
| Conversación **multi-turno**  | Persistir el hilo agéntico más allá de una sola petición.                     |
| **MCP**                       | Exponer el catálogo de herramientas vía Model Context Protocol.               |

Cada herramienta de escritura futura entrará por la misma costura (`executor` + catálogo), pero sujeta a la matriz de permisos por rol y manteniendo intactas las garantías de _tenant-scoping_, auditoría y exclusión de rutas fiscales.

## Alternativas consideradas

- **Reescribir `AiAssistantProvider` para que sea agéntico de origen.** Descartada: rompería el camino one-shot probado y aumentaría el riesgo sin beneficio inmediato.
- **Agente como microservicio separado.** Descartada para el MVP: duplicaría la lógica de _tenant-scoping_, cuota y auditoría; el bucle vive mejor dentro del motor que ya conoce el proveedor.
- **Tool-use atado a `AnthropicEngine` sin pasar por el contrato.** Descartada: rompería la intercambiabilidad de proveedor que es un activo de la arquitectura.

## Estado de implementación

En curso en la rama `feat/continuous-improvement-program` (Ola 1): contrato `runAgent`, bucle de _tool-use_ en `AnthropicEngine`, `DisabledEngine` con 503, `AiAgentService` con catálogo de solo lectura y endpoint `POST /ai/agent` con auditoría `ai.agent_run`.
