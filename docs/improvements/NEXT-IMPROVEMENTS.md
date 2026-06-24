# Próximas mejoras de producto — estudio

Estudio de mejoras del mismo estilo que la tanda recién entregada (checklists de presentación,
sistema de carpetas, dashboards con gráficos, reorganización del workspace y chat tipo red social).
Pensado para priorizar el siguiente ciclo. Cada propuesta indica **impacto**, **esfuerzo** y el punto
de enganche en el código actual.

> Convención: impacto/esfuerzo en escala Alta/Media/Baja. «Reutiliza» = infraestructura existente
> sobre la que se apoya, para no reinventar.

---

## Recién entregado (contexto)

- **Multi-letrado** (`MatterAssignment`) — equipo por expediente.
- **Sistema de ficheros** (`Folder`) — carpetas en documentos y plantillas.
- **Checklists de presentación** (`PresentationType`/`MatterChecklist`) — requisitos por gestión.
- **Chat tipo red social** — leído/typing/presencia, participación por equipo asignado.
- **Dashboards con gráficos** (recharts) — pastel/donut/barras.
- **Reorganización del sidebar** — grupos por afinidad de tarea.

---

## Prioridad 1 — alto impacto, esfuerzo contenido

### 1.1 Notificaciones del chat por correo/push (impacto Alto · esfuerzo Medio)

Hoy el chat avisa en tiempo real solo si la otra parte está conectada. Falta el aviso cuando el
destinatario está **ausente** (correo al cliente/letrado tras N minutos sin leer; push PWA).
**Reutiliza:** `MatterReadState` (PR-4) para detectar no leídos, `NotificationsService`, Brevo (correo
ya en prod), PWA (ya instalada). Enganche: cron que recorre `MatterReadState` vs mensajes recientes.

### 1.2 Plantillas de tareas/flujos por tipo de gestión (impacto Alto · esfuerzo Medio)

Igual que las checklists de **documentos**, definir un flujo de **tareas/plazos** por tipo de
presentación (p. ej. «Compraventa» → reservar nota simple, firma, liquidación de impuestos…). Al
aplicar el tipo, se generan las tareas con vencimientos relativos.
**Reutiliza:** modelo `Task` (procedural + dueDate) y el patrón catálogo→instancia de
`PresentationType`. Enganche: nuevo `requirement.kind` (DOC|TASK) o tabla hermana.

### 1.3 Carpetas: arrastrar y soltar + selección múltiple (impacto Medio · esfuerzo Bajo)

El sistema de ficheros (PR-2) mueve por menú. Añadir drag-drop de documentos a carpetas y subida
directa dentro de una carpeta arrastrando varios ficheros.
**Reutiliza:** `FolderBrowser`, `useMoveDocument`. Enganche: HTML5 DnD en `file-tree`/documentos.

### 1.4 Vista Kanban de expedientes (impacto Alto · esfuerzo Medio)

Tablero por `MatterStatus` (OPEN→IN_PROGRESS→…) con arrastrar para cambiar de estado, como
complemento a la tabla. Muy visual para el día a día del despacho.
**Reutiliza:** máquina de estados `canTransition`, `useChangeMatterStatus`. Enganche: nueva vista en
`/matters` con toggle tabla/kanban.

---

## Prioridad 2 — alto valor, más esfuerzo

### 2.1 Búsqueda dentro del contenido de los documentos (impacto Alto · esfuerzo Alto)

Hoy la búsqueda semántica (RAG) indexa expedientes; extenderla al **texto extraído** de los documentos
(ya existe `extractText` para el redline) para buscar «¿dónde dice X?» en todo el expediente.
**Reutiliza:** `extractText`, `AiEmbedding` (Float[]+coseno), `ai-search.service`. Enganche: indexar
`DocumentVersion` al subir.

### 2.2 Métricas de rentabilidad por expediente y por letrado (impacto Alto · esfuerzo Medio)

El `User` ya tiene `billRate`/`costRate`. Cruzar `TimeEntry` (horas) con coste para mostrar **margen**
real por expediente y la rentabilidad por letrado en el panel/Informes.
**Reutiliza:** `TimeEntry`, `Profitability` (ya hay tipo), gráficos de PR-5. Enganche: ampliar
`dashboard.charts` + página `/reports`.

### 2.3 Firma electrónica en lote (impacto Medio · esfuerzo Medio)

`SignatureRequest` firma una versión a la vez. Permitir enviar a firma un **conjunto** (p. ej. todos
los entregables de un cierre o de una checklist completada).
**Reutiliza:** `SignaturePanel`, `ClosingChecklist`, checklists de PR-3. Enganche: endpoint batch que
itere el adaptador Signaturit.

### 2.4 Reacciones, menciones y adjuntos en el chat (impacto Medio · esfuerzo Medio)

Subir el chat de PR-4 a paridad «red social»: reacciones (emoji), @menciones que notifican, y adjuntar
un documento del expediente directamente en un mensaje.
**Reutiliza:** `Message` (+ `reactions` Json, `attachmentDocumentId`), realtime gateway, documentos.

---

## Prioridad 3 — pulido y consistencia

### 3.1 Hub del expediente con pestañas agrupadas (impacto Medio · esfuerzo Bajo)

El detalle del expediente tiene ~13 pestañas. Agruparlas (Resumen · Trabajo: Documentos/Requisitos/
Tareas · Económico: Costes/Provisión/Facturación · Comunicación: Chat/Correos · Actividad) reduce la
carga visual. **Reutiliza:** `Tabs` existentes; solo reordenar/anidar.

### 3.2 Presencia/colaboración multi-instancia (impacto Medio · esfuerzo Medio)

La presencia/typing de PR-4 vive en memoria del proceso. Al escalar a varias máquinas en Fly, añadir
`@socket.io/redis-adapter`. **Reutiliza:** punto de extensión ya documentado en `RealtimeGateway`.
Requiere aprovisionar Redis (Upstash/Fly) y un secreto.

### 3.3 Personalización del panel (impacto Bajo · esfuerzo Medio)

Permitir al despacho elegir qué gráficos/KPIs ve y en qué orden (vistas guardadas ya existen como
patrón). **Reutiliza:** `SavedView`, `dashboard.charts`.

### 3.4 Exportar checklists/expediente a PDF (impacto Medio · esfuerzo Bajo)

Generar un PDF del estado de una checklist de presentación (qué falta, qué está aportado) para enviar
al cliente. **Reutiliza:** `buildDocumentPdf`, datos de PR-3.

---

## Tabla resumen

| #   | Mejora                                    | Impacto | Esfuerzo |
| --- | ----------------------------------------- | ------- | -------- |
| 1.1 | Notificaciones del chat (correo/push)     | Alto    | Medio    |
| 1.2 | Plantillas de tareas/flujos por gestión   | Alto    | Medio    |
| 1.3 | Carpetas: drag-drop + multiselección      | Medio   | Bajo     |
| 1.4 | Kanban de expedientes                     | Alto    | Medio    |
| 2.1 | Búsqueda en el contenido de documentos    | Alto    | Alto     |
| 2.2 | Rentabilidad por expediente/letrado       | Alto    | Medio    |
| 2.3 | Firma electrónica en lote                 | Medio   | Medio    |
| 2.4 | Reacciones/menciones/adjuntos en chat     | Medio   | Medio    |
| 3.1 | Hub del expediente con pestañas agrupadas | Medio   | Bajo     |
| 3.2 | Presencia multi-instancia (Redis)         | Medio   | Medio    |
| 3.3 | Personalización del panel                 | Bajo    | Medio    |
| 3.4 | Exportar checklist/expediente a PDF       | Medio   | Bajo     |

**Recomendación de arranque:** 1.3 + 3.1 + 3.4 (rápidas, suben la percepción de pulido) y, en paralelo,
1.2 + 1.4 (alto impacto en el día a día del despacho).
