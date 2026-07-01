# LexNET — notificaciones judiciales y cómputo de plazos

Bandeja de **notificaciones de sede judicial electrónica** (LexNET) con encadenado automático del
**plazo procesal**: registras el acto recibido del juzgado y, desde su fecha de recepción, el sistema
calcula la fecha límite en días hábiles (con los festivos del despacho) y crea la **tarea procesal**.

Funciona en **modo manual desde el primer día**. El conector automático con LexNET es **gated** y queda
listo para activarse cuando dispongas de la acreditación oficial.

## Qué se ha entregado (ya en producción)

- Modelo `JudicialNotification` (RLS por despacho) + bandeja en **Despacho → Notificaciones** (`/lexnet`).
- Registro manual de notificaciones (asunto, órgano, nº de procedimiento, tipo, expediente, fecha de
  recepción).
- **Encadenado del plazo**: botón "Calcular plazo" → reutiliza el cómputo procesal existente
  (`TasksService.createFromDeadline`, días hábiles + festivos del despacho) y crea la tarea con la fecha
  límite, marcándola como procesal y enlazándola a la notificación.
- Endpoints `/api/judicial-notifications` (list/create/`:id/deadline`/delete) + `/connector` + `/sync`.
- Conector LexNET **gated** (`lexnet.config.ts`): inerte salvo configuración.

## Por qué el conector es gated

LexNET **no expone una API pública abierta** para terceros. La integración automatizada se hace por uno
de estos caminos, todos sujetos a acreditación:

1. **Sistema de gestión procesal acreditado** ante el CGPJ / Ministerio de Justicia (servicios web del
   Punto Neutro Judicial), con certificado de componente.
2. **Descarga/exportación** de notificaciones desde el portal LexNET (ficheros) e **importación** al
   sistema (vía `source = IMPORT`).

Hasta tener uno de esos canales, lo correcto es el **registro manual** (que ya calcula el plazo igual).

## Pasos para activar el conector automático (cuando tengas acceso)

1. Consigue la acreditación / certificado de componente para el canal elegido (servicio web o exportación).
2. Configura en la API (Fly secrets):
   ```bash
   flyctl secrets set -c fly.api.toml \
     LEXNET_ENABLED=true \
     LEXNET_ENDPOINT="https://<endpoint-del-canal-acreditado>"
   ```
   (Si el canal usa certificado de cliente .p12, lo añadimos como secreto y custodia cifrada, igual que el
   `.p12` de la DGII — avísame y lo cableo.)
3. Con `LEXNET_ENABLED=true` + endpoint, `GET /api/judicial-notifications/connector` pasa a `enabled:true`
   y `POST /sync` deja de ser no-op. **El punto de extensión real de ingesta** (parseo del fichero/respuesta
   LexNET → `JudicialNotification` con `source=LEXNET`/`IMPORT` + dedupe por `externalId`) está marcado en
   `judicial-notifications.service.ts` (`sync()`), listo para implementar contra el canal concreto.

## Notas

- El plazo se calcula con el `ComplianceProvider` de la jurisdicción del despacho (ES: días hábiles +
  festivos nacionales y los del despacho en Ajustes). Para RD aplica su propio cómputo.
- La tarea creada es **procesal** (`isProcedural`), entra en el avisador de plazos próximos y en el feed
  iCal del usuario, como cualquier plazo.
- Dedupe automático: `@@unique([tenantId, source, externalId])` evita registrar dos veces la misma
  notificación de LexNET en la ingesta automática.
