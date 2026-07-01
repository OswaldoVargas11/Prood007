# Roadmap del agente de IA: gaps de paridad no cerrados en esta tanda

> ⚠️ **Doc de planificación (puede estar STALE).** Estado real → **`docs/PROJECT-STATUS.md`**.
> A 2026-07-01: el **gap #1 (builder de workflows no-code)** está **CERRADO y DESPLEGADO en prod** (LAW-22 backend + LAW-67 UI). Quedan gap #2 (Word/Outlook) y gap #3 (token-a-token, cosmético).

> Generado 2026-06-27.

Esta tanda eleva el agente de Lawzora (`POST /ai/agent`, despachos ES + RD) a la barra
real del sector en lo conversacional: herramientas de lectura y escritura con HITL, citas,
streaming de **progreso** (thinking-traces) y botón **Stop**. Quedan tres piezas grandes de
paridad frente a Lexis+/Harvey/Vincent que **no** se abordan aquí porque son proyectos en sí
mismas, no incrementos. Este documento las describe con honestidad para due-diligence:
qué son, por qué son grandes, esfuerzo, riesgo y enfoque recomendado.

---

## 1. Builder de workflows no-code (estilo Lexis+ / Harvey Workflows / Vincent Studio)

**Qué es.** Una superficie donde el usuario compone, sin código, secuencias de pasos del
agente ("para cada expediente vencido: investiga, redacta borrador, crea tarea de revisión")
y las guarda como plantillas reutilizables y compartibles dentro del despacho.

**Por qué es grande.** Son tres subsistemas, no una pantalla:

1. **UI de constructor** — editor visual (nodos/pasos, entradas tipadas, ramas
   condicionales, mapeo de salidas a entradas). Es producto frontend complejo con su propio
   modelo de estado, validación y UX de errores.
2. **Motor de ejecución** — un orquestador que ejecuta los pasos de forma determinista,
   resuelve dependencias entre pasos, gestiona reintentos, pausa para HITL en cada escritura,
   y persiste estado de ejecución (resumible, auditable). Esto es distinto del bucle
   conversacional actual: requiere un grafo de ejecución explícito.
3. **Versionado** — las plantillas evolucionan; hace falta versionado, diffs, migración de
   ejecuciones en curso y control de quién puede editar/publicar (gobernanza por despacho).

**Esfuerzo:** alto (varias tandas; el motor + versionado por sí solos son una tanda cada uno).

**Riesgo:** alto. El motor de ejecución toca datos fiscales y de expediente con escrituras
encadenadas; un fallo de orquestación puede crear tareas/borradores erróneos en lote. Exige
RLS por tenant, auditoría e idempotencia de cada paso. La UI es además donde más fácilmente
se sobre-diseña.

**Enfoque recomendado (incremental).** No construir el editor primero. Empezar por **"skills"
preconstruidos** —secuencias parametrizadas escritas en código, que ya tenemos como base con
las herramientas del agente— expuestas como un catálogo de plantillas que el usuario lanza con
un formulario de entradas. Esto entrega el 80% del valor percibido (workflows repetibles) sin
el editor. Solo cuando haya tracción y tipología clara de workflows reales, abrir el editor
visual sobre el mismo motor que ya ejecuta los skills. Así el motor se valida con skills
internos antes de exponerlo a composición libre del usuario.

---

## 2. Integración del agente DENTRO de Word/Outlook

**Qué es.** Que el agente conversacional viva en el taskpane de Word/Outlook, no solo como
add-ins separados (que ya existen para tareas puntuales). Que el usuario, desde el documento
que está redactando, hable con el agente y este lea/escriba en su contexto.

**Por qué es grande.** El reto no es la UI del taskpane (HTML estándar), sino el **auth de
Office add-ins**: obtener un token SSO de Office (Office.js `getAccessToken` / on-behalf-of),
intercambiarlo por una sesión válida de Lawzora, y que el taskpane llame a `/ai/agent` con
las credenciales del usuario y tenant correctos. El SSO de Office tiene casos límite
notorios (consentimiento, fallback a diálogo de login, tokens caducados, AAD vs cuentas
personales) y **no es verificable sin un entorno Office real** (manifest, sideloading,
tenant de pruebas).

**Esfuerzo:** medio-alto. La lógica de chat + llamada a `/ai/agent` es media; el auth y la
verificación en Office elevan el coste y, sobre todo, la incertidumbre.

**Riesgo:** medio. Riesgo de seguridad acotado (es ampliar superficie de auth, hay que
validar el intercambio de token y el aislamiento por tenant). El riesgo dominante es de
**ejecución/verificación**: sin entorno Office no se puede dar por "hecho" de forma fiable;
puede pasar QA en mock y fallar en el cliente.

**Enfoque recomendado.** Tratarlo como dos fases separables. **Fase A:** taskpane que llama a
`/ai/agent` con auth por token de sesión existente (mismo mecanismo que la web), evitando el
SSO nativo de Office al principio —login en diálogo si hace falta—. Esto desbloquea valor sin
el riesgo del SSO. **Fase B:** SSO nativo de Office cuando haya entorno Office de pruebas
acreditado para verificarlo de extremo a extremo. No marcar la integración como completa hasta
pasar Fase B en Office real.

---

## 3. Streaming token-a-token de la respuesta final

**Qué es.** Que el texto final del agente aparezca palabra a palabra según se genera, como
ChatGPT/Harvey, en vez de aparecer completo al terminar.

**Contexto importante.** Esta tanda **ya** añade el streaming que marca la barra del sector
según la auditoría: streaming de **progreso** (qué herramienta usa, thinking-traces / pasos
del razonamiento) y botón **Stop** para cancelar. Eso es lo que el usuario percibe como
"el agente está trabajando y puedo pararlo". El streaming **token-a-token del texto final** es
un extra cosmético sobre esa base, no la barra real.

**Por qué no es trivial.** Requiere propagar el stream del modelo hasta el cliente sin romper
dos invariantes del agente: las **citas** (se resuelven/validan al final, hay que streamear el
prosa y reconciliar referencias después) y el **HITL** (no se debe streamear como "final" algo
que aún requiere confirmación de escritura). También obliga a SSE/streaming HTTP coherente con
la cancelación ya implementada.

**Esfuerzo:** bajo-medio (la infraestructura de streaming y Stop ya queda de esta tanda; es
extender el canal al texto final con cuidado de citas/HITL).

**Riesgo:** bajo. Cosmético; el peor caso es desactivarlo y volver a respuesta completa.

**Enfoque recomendado.** Posponer hasta después de 1 y 2. Es la mejora de menor ratio
valor/criticidad de las tres: el progreso + Stop ya cubren la expectativa del sector. Abordarlo
como pulido cuando el resto de paridad esté cerrado, reutilizando el canal de streaming de
progreso ya existente.

---

## Resumen para due-diligence

| Gap                              | Esfuerzo   | Riesgo | Enfoque                                                                  |
| -------------------------------- | ---------- | ------ | ------------------------------------------------------------------------ |
| 1. Builder de workflows no-code  | Alto       | Alto   | Skills preconstruidos primero, editor después sobre el mismo motor       |
| 2. Agente dentro de Word/Outlook | Medio-alto | Medio  | Fase A (token de sesión) → Fase B (SSO Office), verificar en Office real |
| 3. Streaming token-a-token final | Bajo-medio | Bajo   | Posponer; progreso + Stop ya cubren la barra del sector                  |

Honestidad explícita: 1 es la única pieza que requiere arquitectura nueva sustancial; 2 está
limitada por verificabilidad (entorno Office), no por dificultad de código; 3 es pulido. La
base conversacional —herramientas de lectura/escritura con HITL, citas, progreso y Stop— ya
está al nivel del sector tras esta tanda.
