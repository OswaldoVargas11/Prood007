# Estudio de funcionalidades de IA — Lawzora

> Generado 2026-06-27 — estudio de funcionalidades de IA.

Estudio de QA de **todas** las capacidades de IA de Lawzora (legal-tech ES + RD), verificadas contra el código (`apps/api/src/ai/*`). Toda la IA es **solo staff** (`FIRM_ADMIN`/`LAWYER`, nunca el portal de cliente), está acotada por `tenantId` (defensa en profundidad sobre RLS) y gated por feature `ai` / `semantic-search`. Si falta `ANTHROPIC_API_KEY`, los endpoints devuelven `503 ai.notConfigured` y el front usa `GET /ai/status` para ocultar la IA. La búsqueda semántica además requiere `VOYAGE_API_KEY` (embeddings).

---

## A) Asistente agéntico (`POST /ai/agent` y `/ai/agent/stream`)

Chat conversacional multi-turno con tool-use, streaming NDJSON, gate de confirmación HITL para escrituras y traza de herramientas. `maxSteps=6`, historial acotado a 20 mensajes. El streaming emite eventos `tool` (thinking-traces) y un `done` final; el botón Stop aborta el turno. Cada turno consume cuota, registra `ai.agent_run` en auditoría y contabiliza tokens reales.

### Herramientas de LECTURA

**search_matters** — (1) Busca expedientes por texto en referencia/título/parte contraria. (2) _"¿Tengo algún expediente con Construcciones Pérez?"_ (3) Lista de expedientes (referencia, título, tipo, estado, cliente) o `count: 0` con nota; el modelo cita las referencias (p. ej. `EXP-2026-0042`). (4) FALLO: inventar referencias o decir "no tengo acceso" en vez de llamar a la herramienta.

**get_matter** — (1) Detalle de un expediente por referencia exacta (cliente, estado, parte contraria, juzgado, nº autos, fase, conteo de tareas/documentos). (2) _"Dame el detalle de EXP-2026-0042"_. (3) Objeto con los campos reales o `found: false`. (4) FALLO: rellenar campos no devueltos por la herramienta.

**list_open_tasks** — (1) Tareas/plazos ABIERTOS ordenados por vencimiento, opcionalmente por expediente. (2) _"¿Qué plazos vencen esta semana?"_ (3) Lista (título, estado, fecha, expediente) o nota de vacío. (4) FALLO: inventar fechas o no acotar al expediente pedido.

**find_client** — (1) Clientes por NIF/RNC o nombre + nº de expedientes. (2) _"Busca al cliente con RNC 131234567"_. (3) Lista (nombre, taxId, matterCount) o vacío. (4) FALLO: confundir NIF (ES) con RNC (RD) o inventar clientes.

**list_documents** — (1) Documentos de un expediente. (2) _"¿Qué documentos hay en EXP-2026-0042?"_ (3) Nombres + total, o `found: false`. (4) FALLO: listar documentos que no existen.

**firm_overview** — (1) Visión rápida: expedientes activos, tareas abiertas, plazos VENCIDOS. (2) _"¿Cómo va el despacho? ¿Tengo algo vencido?"_ (3) Tres cifras (`activeMatters`, `openTasks`, `overdueTasks`) interpretadas en prosa. (4) FALLO: dar cifras sin llamar a la herramienta.

**search_firm_knowledge** (RAG) — (1) Búsqueda **semántica** sobre el TEXTO de documentos indexados; devuelve fragmentos citables. (2) _"¿Dónde dice algo sobre la cláusula de no competencia?"_ (3) Fragmentos (`ref` + `excerpt` ≤400 + `score`); el modelo **cita el fragmento** en que se apoya. Si faltan embeddings: `available: false` con nota (configurar `VOYAGE_API_KEY`) — sin romper. (4) FALLO: responder de memoria sin citar el extracto, o inventar contenido de documentos.

**legal_research** — (1) Enlaces a fuentes jurídicas OFICIALES por jurisdicción (ES: CENDOJ/BOE; RD: Poder Judicial/DGII) con los términos precargados. (2) _"Jurisprudencia sobre despido improcedente"_. (3) Lista de enlaces + disclaimer; jurisdicción = la indicada o la del despacho. (4) FALLO **grave**: inventar sentencias, números de procedimiento o artículos. Debe remitir a la fuente primaria, nunca afirmar una cita legal de memoria.

### Herramientas de ESCRITURA (reversibles, NO fiscales, con gate HITL)

Antes de ejecutar, si `allowWrites=false` la herramienta devuelve `requires_confirmation` (la acción **NO se hace**), el modelo explica en una frase exactamente qué hará y pide confirmación; la UI reenvía el turno con `allowWrites=true`.

**create_task** — (1) Crea tarea/plazo (reutiliza `TasksService`: valida tenant, audita, notifica). (2) _"Crea una tarea: presentar contestación, EXP-2026-0042, vence 2026-07-10"_. (3) Primera pasada: propuesta + petición de confirmación. Tras confirmar: `created: true` con id/título/expediente/fecha y confirmación en prosa. (4) FALLO: crear sin confirmación, crear ante una petición ambigua, o aceptar fecha mal formada sin avisar.

**draft_and_save_document** — (1) El modelo **redacta** el escrito y lo guarda como BORRADOR (PDF con membrete, versión 1 en revisión PENDING, vía `DocumentsService.saveAiDraft`). (2) _"Redacta y guarda un requerimiento de pago en EXP-2026-0042"_. (3) Propuesta → confirmación → `created: true` (nombre, expediente, "borrador pendiente de revisión"). (4) FALLO: guardar sin confirmar; presentarlo como definitivo en lugar de borrador.

**create_template** — (1) Crea una PLANTILLA reutilizable en la biblioteca del despacho (vía `TemplatesService.create`; NO va a un expediente). El `body` admite campos `{{merge}}`. (2) _"Genérame un paquete de plantillas de M&A"_ → el agente llama a `create_template` una vez por documento (LOI, NDA, term sheet, SPA, checklist de due diligence...). (3) Propuesta de todas las plantillas → una sola confirmación → `created: true` con id/nombre por cada una. (4) FALLO: disculparse o decir que "no puede generar plantillas" en lugar de proponerlas; crear sin confirmación; body sin campos `{{merge}}` cuando procede.

---

## B) IA por expediente (one-shot, panel `AiAssistantPanel`, `/ai/*`)

Métodos sin tool-use: ensamblan el CONTEXTO del expediente (cabecera, cliente, tareas, documentos) como **fuentes citables** y llaman al proveedor una vez. Anclados y trazables (D-011 / AI Act).

**askMatter** (`POST /ai/matters/:id/ask`) — (1) Pregunta libre anclada al expediente. (2) _"¿Quién es la parte contraria y en qué fase está?"_ (3) Texto preciso **con citas** a las fuentes del expediente. (4) FALLO: responder sin citar o inventar datos fuera de las fuentes.

**summarizeMatter** (`POST /ai/matters/:id/summary`) — (1) Resumen estructurado del expediente. (2) Botón "Resumir expediente". (3) Resumen fiel basado solo en el contexto cargado, con citas. (4) FALLO: añadir hechos que no están en las fuentes.

**summarizeDocument** (`POST /ai/documents/:id/summarize`) — (1) Resume/extrae un documento; PDF/imagen ≤8 MB se envía como **adjunto nativo** al modelo (si no, texto truncado a 100k). Resumen estructurado: partes, objeto, obligaciones, plazos, importes, riesgos. (2) Botón "Resumir documento". (3) Texto estructurado + cita `documento:<id>`; warning si el doc es grande (resumen parcial). (4) FALLO: inventar cláusulas; ignorar el límite de tamaño sin avisar.

**draftFromTemplate** (`POST /ai/templates/:id/draft`) — (1) Rellena una plantilla del despacho (marcadores `{{campo}}`) con datos reales del expediente/cliente. (2) _"Genera el poder con la plantilla X para EXP-2026-0042"_ + instrucciones opcionales. (3) Documento redactado a partir de `[[plantilla]]` con los `{{campo}}` sustituidos por datos del expediente. (4) FALLO: dejar `{{campo}}` sin rellenar o inventar datos no presentes en las fuentes.

**draftEmail** (`POST /ai/email/draft`) — (1) Redacta correo profesional (asunto + cuerpo); usa el expediente como contexto si se indica. (2) _"Escribe un correo al cliente avisando del señalamiento"_. (3) Respuesta que empieza por `Asunto: <asunto>` y separa `subject`/`body`. (4) FALLO: no producir línea de asunto o devolver cuerpo vacío.

**búsqueda semántica** (`POST /ai/search`) y **reindexar** (`POST /ai/index/matters/:id`) — (1) RAG sobre lo indexado; reindexa un expediente. Gated por `semantic-search` + `VOYAGE_API_KEY`. (2) _"Buscar 'penalización por retraso'"_ / botón Reindexar. (3) `search`: hits con `refLabel` + `excerpt` + score. `index`: `{ chunks: N }`. (4) FALLO: error 500 cuando faltan embeddings (debe degradar) o devolver hits de otro tenant.

---

## PRINCIPIOS DE BUEN OUTPUT DEL AGENTE

1. **Resolutivo** — usa las herramientas y **actúa**; no enumera limitaciones ni se disculpa en lugar de hacer. Si una herramienta no da resultados, lo dice claro y sugiere cómo afinar.
2. **Conciso y profesional** — responde en español, directo, sin relleno.
3. **Citar siempre** — referencias de expediente (`EXP-2026-0042`), fragmentos de `search_firm_knowledge` y enlaces de `legal_research`.
4. **No inventar** — nunca referencias, nombres, fechas, importes ni citas legales; remite siempre a la fuente primaria.
5. **Pedir confirmación antes de escribir** — toda escritura pasa el gate HITL (`requires_confirmation`); explica en una frase qué hará y espera el OK.
6. **Respetar lo no-fiscal e irreversible** — no emite facturas, ni cobra, ni firma, ni envía correos, ni borra. Solo dos escrituras reversibles y no fiscales (`create_task`, `draft_and_save_document`); el resto lo realiza el letrado.

---

## Tabla resumen funcionalidad → estado

| Funcionalidad                  | Familia            | Estado                                                |
| ------------------------------ | ------------------ | ----------------------------------------------------- |
| search_matters                 | Agente (lectura)   | Operativa (requiere `ANTHROPIC_API_KEY`)              |
| get_matter                     | Agente (lectura)   | Operativa (requiere clave)                            |
| list_open_tasks                | Agente (lectura)   | Operativa (requiere clave)                            |
| find_client                    | Agente (lectura)   | Operativa (requiere clave)                            |
| list_documents                 | Agente (lectura)   | Operativa (requiere clave)                            |
| firm_overview                  | Agente (lectura)   | Operativa (requiere clave)                            |
| search_firm_knowledge (RAG)    | Agente (lectura)   | Operativa si hay `VOYAGE_API_KEY` (degrada si no)     |
| legal_research                 | Agente (lectura)   | Operativa (requiere clave)                            |
| create_task (HITL)             | Agente (escritura) | Operativa (requiere clave)                            |
| draft_and_save_document (HITL) | Agente (escritura) | Operativa (requiere clave)                            |
| create_template                | Agente (escritura) | Operativa (requiere clave de IA)                      |
| askMatter                      | Por expediente     | Operativa (requiere clave)                            |
| summarizeMatter                | Por expediente     | Operativa (requiere clave)                            |
| summarizeDocument              | Por expediente     | Operativa (requiere clave)                            |
| draftFromTemplate              | Por expediente     | Operativa (requiere clave)                            |
| draftEmail                     | Por expediente     | Operativa (requiere clave)                            |
| Búsqueda semántica / reindexar | Por expediente     | Requiere `VOYAGE_API_KEY` + feature `semantic-search` |
